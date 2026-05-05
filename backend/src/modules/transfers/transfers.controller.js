'use strict';

const db = require('../../db/pool');
const { nextNumber } = require('../../utils/sequence');
const { applyMove, reverseDocument, checkAvailable } = require('../../utils/stockService');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');
const { broadcast } = require('../../websocket/hub');
const settings = require('../../utils/settingsService');
const customFields = require('../../utils/customFieldsService');

const HEAD_FIELDS = `
    t.id, t.number, t.transfer_date, t.depot_from_id, t.depot_to_id,
    t.vehicle_id, t.plate, t.driver_id, t.driver_name, t.weighing_id,
    t.state, t.received_at, t.received_by, t.user_id, t.notes,
    t.created_at, t.updated_at
`;
const HEAD_FIELDS_RAW = HEAD_FIELDS.replace(/t\./g, '');

async function list(req, res, next) {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const offset = parseInt(req.query.offset || '0', 10);
        const where = [];
        const params = [];

        if (req.query.state) { params.push(req.query.state); where.push(`t.state = $${params.length}`); }
        if (req.query.depot_from_id) { params.push(parseInt(req.query.depot_from_id, 10)); where.push(`t.depot_from_id = $${params.length}`); }
        if (req.query.depot_to_id) { params.push(parseInt(req.query.depot_to_id, 10)); where.push(`t.depot_to_id = $${params.length}`); }
        if (req.query.date_from) { params.push(req.query.date_from); where.push(`t.transfer_date >= $${params.length}`); }
        if (req.query.date_to) { params.push(req.query.date_to); where.push(`t.transfer_date <= $${params.length}`); }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        params.push(offset);

        const r = await db.query(`
            SELECT ${HEAD_FIELDS},
                   df.name AS depot_from_name,
                   dt.name AS depot_to_name,
                   COUNT(*) OVER() AS total_count
            FROM transfers t
            JOIN depots df ON df.id = t.depot_from_id
            JOIN depots dt ON dt.id = t.depot_to_id
            ${whereSql}
            ORDER BY t.transfer_date DESC, t.id DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const total = r.rows[0]?.total_count ? parseInt(r.rows[0].total_count, 10) : 0;
        res.json({
            items: r.rows.map(({ total_count, ...rest }) => rest),
            total, limit, offset,
        });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const head = await db.query(`
            SELECT ${HEAD_FIELDS},
                   df.name AS depot_from_name,
                   dt.name AS depot_to_name
            FROM transfers t
            JOIN depots df ON df.id = t.depot_from_id
            JOIN depots dt ON dt.id = t.depot_to_id
            WHERE t.id = $1
        `, [req.params.id]);
        if (head.rowCount === 0) throw new NotFoundError();

        const lines = await db.query(`
            SELECT tl.id, tl.article_id, a.code AS article_code, a.name AS article_name,
                   tl.quantity_sent, tl.quantity_received, tl.notes
            FROM transfer_lines tl
            JOIN articles a ON a.id = tl.article_id
            WHERE tl.transfer_id = $1
            ORDER BY tl.id
        `, [req.params.id]);

        res.json({ ...head.rows[0], lines: lines.rows });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { depot_from_id, depot_to_id, vehicle_id, plate, driver_id,
                driver_name, weighing_id, transfer_date, notes, lines } = req.body;
        if (!depot_from_id || !depot_to_id) throw new ValidationError('depot_from_id et depot_to_id requis');
        if (depot_from_id === depot_to_id) throw new ValidationError('Les dépôts source et destination doivent être différents');
        if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('Au moins une ligne requise');

        const result = await db.transaction(async (client) => {
            const prefRes = await client.query(`SELECT prefix_tr FROM company LIMIT 1`);
            const prefix = prefRes.rows[0]?.prefix_tr || 'TR';
            const number = await nextNumber('transfers', prefix, client);

            for (const l of lines) {
                if (!l.article_id || !l.quantity_sent) throw new ValidationError('article_id et quantity_sent requis');
            }

            const head = await client.query(`
                INSERT INTO transfers
                  (number, transfer_date, depot_from_id, depot_to_id, vehicle_id,
                   plate, driver_id, driver_name, weighing_id, state, user_id, notes)
                VALUES ($1, COALESCE($2, NOW()), $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11)
                RETURNING ${HEAD_FIELDS_RAW}
            `, [number, transfer_date || null, depot_from_id, depot_to_id, vehicle_id || null,
                plate || null, driver_id || null, driver_name || null, weighing_id || null,
                req.user.id, notes || null]);

            const trId = head.rows[0].id;
            for (const l of lines) {
                await client.query(`
                    INSERT INTO transfer_lines (transfer_id, article_id, quantity_sent, notes)
                    VALUES ($1, $2, $3, $4)
                `, [trId, l.article_id, l.quantity_sent, l.notes || null]);
            }
            return head.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'create_transfer', entity: 'transfers', entityId: result.id, payload: { number: result.number }, ip: req.ip });
        broadcast('transfer.created', { id: result.id, number: result.number });
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

/**
 * Send transfer: decrement source depot stock, set state = in_transit
 */
async function send(req, res, next) {
    try {
        const result = await db.transaction(async (client) => {
            const r = await client.query(`SELECT * FROM transfers WHERE id = $1 FOR UPDATE`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            const tr = r.rows[0];
            if (tr.state !== 'draft') throw new ConflictError(`État ${tr.state} : non envoyable`);

            const lines = await client.query(`SELECT * FROM transfer_lines WHERE transfer_id = $1`, [tr.id]);

            for (const l of lines.rows) {
                await checkAvailable({
                    depotId: tr.depot_from_id,
                    articleId: l.article_id,
                    quantity: l.quantity_sent,
                }, client);
            }
            for (const l of lines.rows) {
                await applyMove({
                    depotId: tr.depot_from_id,
                    articleId: l.article_id,
                    quantity: l.quantity_sent,
                    moveType: 'transfer_out',
                    sourceModel: 'transfer',
                    sourceId: tr.id,
                    userId: req.user.id,
                }, client);
            }

            const upd = await client.query(`UPDATE transfers SET state='in_transit' WHERE id=$1 RETURNING ${HEAD_FIELDS_RAW}`, [tr.id]);
            return upd.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'send_transfer', entity: 'transfers', entityId: result.id, ip: req.ip });
        broadcast('transfer.in_transit', { id: result.id, number: result.number });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

/**
 * Receive transfer: increment destination depot stock with the actual received qty,
 * accept partial reception (quantity_received per line in body).
 */
async function receive(req, res, next) {
    try {
        const lineUpdates = req.body.lines || []; // [{ id, quantity_received }]

        // -------- Paramètres ---------
        const cfg = await settings.getMany([
            'transfer.partial_receive_allowed',
            'transfer.tolerate_loss_pct',
        ]);
        const partialAllowed = cfg['transfer.partial_receive_allowed'] !== false;
        const tolerancePct = Number(cfg['transfer.tolerate_loss_pct'] ?? 0);
        const warnings = [];

        const result = await db.transaction(async (client) => {
            const r = await client.query(`SELECT * FROM transfers WHERE id = $1 FOR UPDATE`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            const tr = r.rows[0];
            if (tr.state !== 'in_transit') throw new ConflictError(`État ${tr.state} : non recevable`);

            const lines = await client.query(`SELECT * FROM transfer_lines WHERE transfer_id = $1`, [tr.id]);

            for (const l of lines.rows) {
                const updateForLine = lineUpdates.find((u) => u.id === l.id);
                const qtyReceived = updateForLine
                    ? Number(updateForLine.quantity_received)
                    : Number(l.quantity_sent);

                if (qtyReceived < 0) throw new ValidationError('quantity_received négative');

                // Si partial désactivé, exiger qty_received == qty_sent
                if (!partialAllowed && qtyReceived !== Number(l.quantity_sent)) {
                    throw new ValidationError(
                        `Réception partielle désactivée (paramétrage). ` +
                        `Article ligne ${l.id} : envoyé ${l.quantity_sent}, reçu ${qtyReceived}`
                    );
                }

                // Vérification tolérance perte
                const sent = Number(l.quantity_sent);
                if (sent > 0 && qtyReceived < sent && tolerancePct > 0) {
                    const lossPct = ((sent - qtyReceived) / sent) * 100;
                    if (lossPct > tolerancePct) {
                        warnings.push({
                            type: 'LOSS_OUT_OF_TOLERANCE',
                            line_id: l.id, article_id: l.article_id,
                            sent, received: qtyReceived, lossPct: Number(lossPct.toFixed(2)),
                            tolerancePct,
                            message: `Perte ${lossPct.toFixed(1)}% > tolérance ${tolerancePct}% sur l'article (envoyé ${sent}, reçu ${qtyReceived})`,
                        });
                    }
                }

                await client.query(
                    `UPDATE transfer_lines SET quantity_received = $1 WHERE id = $2`,
                    [qtyReceived, l.id]
                );

                if (qtyReceived > 0) {
                    await applyMove({
                        depotId: tr.depot_to_id,
                        articleId: l.article_id,
                        quantity: qtyReceived,
                        moveType: 'transfer_in',
                        sourceModel: 'transfer',
                        sourceId: tr.id,
                        userId: req.user.id,
                    }, client);
                }
            }

            const upd = await client.query(`
                UPDATE transfers SET state='received', received_at=NOW(), received_by=$1
                WHERE id=$2 RETURNING ${HEAD_FIELDS_RAW}
            `, [req.user.id, tr.id]);
            return upd.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'receive_transfer', entity: 'transfers',
                         entityId: result.id, payload: { warnings: warnings.length }, ip: req.ip });
        broadcast('transfer.received', { id: result.id, number: result.number, warnings });
        res.json({ ...result, warnings: warnings.length ? warnings : undefined });
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const result = await db.transaction(async (client) => {
            const r = await client.query(`SELECT * FROM transfers WHERE id = $1 FOR UPDATE`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            const tr = r.rows[0];
            if (tr.state === 'cancelled') throw new ConflictError('Déjà annulé');
            if (tr.state === 'received') throw new ConflictError('Transfert déjà reçu, annulation impossible');

            if (tr.state === 'in_transit') {
                await reverseDocument({ sourceModel: 'transfer', sourceId: tr.id }, client);
            }
            const upd = await client.query(`UPDATE transfers SET state='cancelled' WHERE id=$1 RETURNING ${HEAD_FIELDS_RAW}`, [tr.id]);
            return upd.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'cancel_transfer', entity: 'transfers', entityId: result.id, ip: req.ip });
        broadcast('transfer.cancelled', { id: result.id, number: result.number });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { list, getOne, create, send, receive, cancel };
