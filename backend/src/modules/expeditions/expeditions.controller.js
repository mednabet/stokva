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
    e.id, e.number, e.expedition_date, e.depot_id, e.partner_id, e.destination,
    e.vehicle_id, e.plate, e.driver_id, e.driver_name, e.weighing_id, e.state,
    e.total_quantity, e.total_amount, e.user_id, e.notes, e.custom_data,
    e.created_at, e.updated_at
`;
const HEAD_FIELDS_RAW = HEAD_FIELDS.replace(/e\./g, '');

async function list(req, res, next) {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const offset = parseInt(req.query.offset || '0', 10);
        const where = [];
        const params = [];

        if (req.query.state) { params.push(req.query.state); where.push(`e.state = $${params.length}`); }
        if (req.query.depot_id) { params.push(parseInt(req.query.depot_id, 10)); where.push(`e.depot_id = $${params.length}`); }
        if (req.query.partner_id) { params.push(parseInt(req.query.partner_id, 10)); where.push(`e.partner_id = $${params.length}`); }
        if (req.query.date_from) { params.push(req.query.date_from); where.push(`e.expedition_date >= $${params.length}`); }
        if (req.query.date_to) { params.push(req.query.date_to); where.push(`e.expedition_date <= $${params.length}`); }
        if (req.query.q) {
            params.push(`%${req.query.q}%`);
            where.push(`(e.number ILIKE $${params.length} OR e.plate ILIKE $${params.length} OR e.destination ILIKE $${params.length})`);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        params.push(offset);

        const r = await db.query(`
            SELECT ${HEAD_FIELDS}, p.name AS partner_name, d.name AS depot_name,
                   COUNT(*) OVER() AS total_count
            FROM expeditions e
            JOIN partners p ON p.id = e.partner_id
            JOIN depots   d ON d.id = e.depot_id
            ${whereSql}
            ORDER BY e.expedition_date DESC, e.id DESC
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
            SELECT ${HEAD_FIELDS}, p.name AS partner_name, d.name AS depot_name
            FROM expeditions e
            JOIN partners p ON p.id = e.partner_id
            JOIN depots   d ON d.id = e.depot_id
            WHERE e.id = $1
        `, [req.params.id]);
        if (head.rowCount === 0) throw new NotFoundError();

        const lines = await db.query(`
            SELECT el.id, el.article_id, a.code AS article_code, a.name AS article_name,
                   el.quantity, el.unit_price, el.subtotal, el.notes
            FROM expedition_lines el
            JOIN articles a ON a.id = el.article_id
            WHERE el.expedition_id = $1
            ORDER BY el.id
        `, [req.params.id]);

        res.json({ ...head.rows[0], lines: lines.rows });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { depot_id, partner_id, destination, vehicle_id, plate, driver_id,
                driver_name, weighing_id, expedition_date, notes, lines, custom_data } = req.body;
        if (!depot_id || !partner_id) throw new ValidationError('depot_id et partner_id requis');
        if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('Au moins une ligne requise');

        // -------- Application des paramètres configurables --------
        const cfg = await settings.getMany([
            'expedition.require_destination',
            'expedition.require_unit_price',
            'expedition.require_weighing',
        ], { depotId: depot_id });

        if (cfg['expedition.require_destination'] === true && !destination) {
            throw new ValidationError('La destination est obligatoire (paramétrage)');
        }
        if (cfg['expedition.require_weighing'] === true && !weighing_id) {
            throw new ValidationError('Une pesée pont-bascule est obligatoire (paramétrage)');
        }
        if (cfg['expedition.require_unit_price'] === true) {
            for (const l of lines) {
                if (!l.unit_price || Number(l.unit_price) <= 0) {
                    throw new ValidationError('Le prix unitaire est obligatoire sur chaque ligne (paramétrage)');
                }
            }
        }

        // -------- Validation des champs personnalisés --------
        const validatedCustom = await customFields.validate('expedition', custom_data, {
            depot_id, partner_id,
        });

        const result = await db.transaction(async (client) => {
            const prefRes = await client.query(`SELECT prefix_bl FROM company LIMIT 1`);
            const prefix = prefRes.rows[0]?.prefix_bl || 'BL';
            const number = await nextNumber('expeditions', prefix, client);

            let totalQty = 0, totalAmount = 0;
            for (const l of lines) {
                if (!l.article_id || !l.quantity) throw new ValidationError('article_id et quantity requis');
                totalQty += Number(l.quantity);
                totalAmount += Number(l.quantity) * Number(l.unit_price || 0);
            }

            const head = await client.query(`
                INSERT INTO expeditions
                  (number, expedition_date, depot_id, partner_id, destination,
                   vehicle_id, plate, driver_id, driver_name, weighing_id,
                   state, total_quantity, total_amount, user_id, notes, custom_data)
                VALUES ($1, COALESCE($2, NOW()), $3, $4, $5, $6, $7, $8, $9, $10,
                        'draft', $11, $12, $13, $14, $15::jsonb)
                RETURNING ${HEAD_FIELDS_RAW}
            `, [number, expedition_date || null, depot_id, partner_id, destination || null,
                vehicle_id || null, plate || null, driver_id || null, driver_name || null,
                weighing_id || null, totalQty, totalAmount, req.user.id, notes || null,
                JSON.stringify(validatedCustom)]);

            const expId = head.rows[0].id;
            for (const l of lines) {
                await client.query(`
                    INSERT INTO expedition_lines (expedition_id, article_id, quantity, unit_price, notes)
                    VALUES ($1, $2, $3, $4, $5)
                `, [expId, l.article_id, l.quantity, l.unit_price || 0, l.notes || null]);
            }
            return head.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'create_expedition', entity: 'expeditions', entityId: result.id, payload: { number: result.number }, ip: req.ip });
        broadcast('expedition.created', { id: result.id, number: result.number });
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

async function confirm(req, res, next) {
    try {
        const result = await db.transaction(async (client) => {
            const r = await client.query(`SELECT * FROM expeditions WHERE id = $1 FOR UPDATE`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            const exp = r.rows[0];
            if (exp.state !== 'draft') throw new ConflictError(`État ${exp.state} : non confirmable`);

            const lines = await client.query(`SELECT * FROM expedition_lines WHERE expedition_id = $1`, [exp.id]);

            // Vérifier dispo de toutes les lignes AVANT de toucher au stock
            for (const l of lines.rows) {
                await checkAvailable({
                    depotId: exp.depot_id,
                    articleId: l.article_id,
                    quantity: l.quantity,
                }, client);
            }
            // Décrémenter
            for (const l of lines.rows) {
                await applyMove({
                    depotId: exp.depot_id,
                    articleId: l.article_id,
                    quantity: l.quantity,
                    moveType: 'out',
                    sourceModel: 'expedition',
                    sourceId: exp.id,
                    userId: req.user.id,
                }, client);
            }

            const upd = await client.query(`UPDATE expeditions SET state='confirmed' WHERE id=$1 RETURNING ${HEAD_FIELDS_RAW}`, [exp.id]);
            return upd.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'confirm_expedition', entity: 'expeditions', entityId: result.id, ip: req.ip });
        broadcast('expedition.confirmed', { id: result.id, number: result.number });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const result = await db.transaction(async (client) => {
            const r = await client.query(`SELECT * FROM expeditions WHERE id = $1 FOR UPDATE`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            const exp = r.rows[0];
            if (exp.state === 'cancelled') throw new ConflictError('Déjà annulé');

            if (exp.state === 'confirmed') {
                await reverseDocument({ sourceModel: 'expedition', sourceId: exp.id }, client);
            }
            const upd = await client.query(`UPDATE expeditions SET state='cancelled' WHERE id=$1 RETURNING ${HEAD_FIELDS_RAW}`, [exp.id]);
            return upd.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'cancel_expedition', entity: 'expeditions', entityId: result.id, ip: req.ip });
        broadcast('expedition.cancelled', { id: result.id, number: result.number });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await db.transaction(async (client) => {
            const r = await client.query(`SELECT state FROM expeditions WHERE id = $1`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            if (r.rows[0].state !== 'draft') throw new ConflictError('Seul un brouillon peut être supprimé');
            await client.query(`DELETE FROM expeditions WHERE id = $1`, [req.params.id]);
        });
        await logAudit({ userId: req.user.id, action: 'delete_expedition', entity: 'expeditions', entityId: req.params.id, ip: req.ip });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { list, getOne, create, confirm, cancel, remove };
