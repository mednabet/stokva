'use strict';

const db = require('../../db/pool');
const { nextNumber } = require('../../utils/sequence');
const { applyMove, reverseDocument } = require('../../utils/stockService');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');
const { broadcast } = require('../../websocket/hub');
const settings = require('../../utils/settingsService');
const customFields = require('../../utils/customFieldsService');

const HEAD_FIELDS = `
    r.id, r.number, r.reception_date, r.depot_id, r.partner_id, r.vehicle_id,
    r.plate, r.driver_id, r.driver_name, r.weighing_id, r.state,
    r.total_quantity, r.total_amount, r.user_id, r.notes, r.custom_data,
    r.created_at, r.updated_at
`;
const HEAD_FIELDS_RAW = HEAD_FIELDS.replace(/r\./g, '');

async function list(req, res, next) {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const offset = parseInt(req.query.offset || '0', 10);
        const where = [];
        const params = [];

        if (req.query.state) {
            params.push(req.query.state);
            where.push(`r.state = $${params.length}`);
        }
        if (req.query.depot_id) {
            params.push(parseInt(req.query.depot_id, 10));
            where.push(`r.depot_id = $${params.length}`);
        }
        if (req.query.partner_id) {
            params.push(parseInt(req.query.partner_id, 10));
            where.push(`r.partner_id = $${params.length}`);
        }
        if (req.query.date_from) {
            params.push(req.query.date_from);
            where.push(`r.reception_date >= $${params.length}`);
        }
        if (req.query.date_to) {
            params.push(req.query.date_to);
            where.push(`r.reception_date <= $${params.length}`);
        }
        if (req.query.q) {
            params.push(`%${req.query.q}%`);
            where.push(`(r.number ILIKE $${params.length} OR r.plate ILIKE $${params.length} OR r.driver_name ILIKE $${params.length})`);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        params.push(offset);

        const r = await db.query(`
            SELECT ${HEAD_FIELDS}, p.name AS partner_name, d.name AS depot_name,
                   COUNT(*) OVER() AS total_count
            FROM receptions r
            JOIN partners p ON p.id = r.partner_id
            JOIN depots   d ON d.id = r.depot_id
            ${whereSql}
            ORDER BY r.reception_date DESC, r.id DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const total = r.rows[0]?.total_count ? parseInt(r.rows[0].total_count, 10) : 0;
        res.json({
            items: r.rows.map(({ total_count, ...rest }) => rest),
            total,
            limit,
            offset,
        });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const head = await db.query(`
            SELECT ${HEAD_FIELDS}, p.name AS partner_name, d.name AS depot_name
            FROM receptions r
            JOIN partners p ON p.id = r.partner_id
            JOIN depots   d ON d.id = r.depot_id
            WHERE r.id = $1
        `, [req.params.id]);
        if (head.rowCount === 0) throw new NotFoundError();

        const lines = await db.query(`
            SELECT rl.id, rl.article_id, a.code AS article_code, a.name AS article_name,
                   rl.quantity, rl.unit_price, rl.subtotal, rl.notes
            FROM reception_lines rl
            JOIN articles a ON a.id = rl.article_id
            WHERE rl.reception_id = $1
            ORDER BY rl.id
        `, [req.params.id]);

        res.json({ ...head.rows[0], lines: lines.rows });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { depot_id, partner_id, vehicle_id, plate, driver_id, driver_name,
                weighing_id, reception_date, notes, lines, custom_data } = req.body;
        if (!depot_id || !partner_id) throw new ValidationError('depot_id et partner_id requis');
        if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('Au moins une ligne requise');

        // -------- Application des paramètres configurables --------
        const cfg = await settings.getMany([
            'reception.require_weighing',
            'reception.require_unit_price',
            'reception.auto_confirm',
        ], { depotId: depot_id });

        if (cfg['reception.require_weighing'] === true && !weighing_id) {
            throw new ValidationError('Une pesée pont-bascule est obligatoire (paramétrage)');
        }
        if (cfg['reception.require_unit_price'] === true) {
            for (const l of lines) {
                if (!l.unit_price || Number(l.unit_price) <= 0) {
                    throw new ValidationError('Le prix unitaire est obligatoire sur chaque ligne (paramétrage)');
                }
            }
        }

        // -------- Validation des champs personnalisés --------
        const validatedCustom = await customFields.validate('reception', custom_data, {
            depot_id, partner_id,
        });

        const result = await db.transaction(async (client) => {
            const prefRes = await client.query(`SELECT prefix_br FROM company LIMIT 1`);
            const prefix = prefRes.rows[0]?.prefix_br || 'BR';
            const number = await nextNumber('receptions', prefix, client);

            let totalQty = 0, totalAmount = 0;
            for (const l of lines) {
                if (!l.article_id || !l.quantity) throw new ValidationError('article_id et quantity requis sur chaque ligne');
                totalQty += Number(l.quantity);
                totalAmount += Number(l.quantity) * Number(l.unit_price || 0);
            }

            const head = await client.query(`
                INSERT INTO receptions
                  (number, reception_date, depot_id, partner_id, vehicle_id, plate,
                   driver_id, driver_name, weighing_id, state, total_quantity, total_amount,
                   user_id, notes, custom_data)
                VALUES ($1, COALESCE($2, NOW()), $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, $12, $13, $14::jsonb)
                RETURNING ${HEAD_FIELDS_RAW}
            `, [number, reception_date || null, depot_id, partner_id, vehicle_id || null, plate || null,
                driver_id || null, driver_name || null, weighing_id || null,
                totalQty, totalAmount, req.user.id, notes || null,
                JSON.stringify(validatedCustom || {})]);

            const recId = head.rows[0].id;
            for (const l of lines) {
                await client.query(`
                    INSERT INTO reception_lines (reception_id, article_id, quantity, unit_price, notes)
                    VALUES ($1, $2, $3, $4, $5)
                `, [recId, l.article_id, l.quantity, l.unit_price || 0, l.notes || null]);
            }

            return head.rows[0];
        });

        // -------- Auto-confirm si paramétré --------
        let final = result;
        if (cfg['reception.auto_confirm'] === true) {
            final = await _confirmReception(result.id, req.user.id);
        }

        await logAudit({
            userId: req.user.id,
            action: 'create_reception',
            entity: 'receptions',
            entityId: final.id,
            payload: { number: final.number, autoConfirmed: cfg['reception.auto_confirm'] === true },
            ip: req.ip,
        });
        broadcast('reception.created', { id: final.id, number: final.number, state: final.state });

        res.status(201).json(final);
    } catch (err) {
        next(err);
    }
}

/**
 * Internal helper: confirms a reception inside its own transaction.
 * Used by both the explicit /confirm route and auto_confirm setting.
 */
async function _confirmReception(receptionId, userId) {
    return db.transaction(async (client) => {
        const r = await client.query(`SELECT * FROM receptions WHERE id = $1 FOR UPDATE`, [receptionId]);
        if (r.rowCount === 0) throw new NotFoundError();
        const rec = r.rows[0];
        if (rec.state !== 'draft') throw new ConflictError(`État ${rec.state} : non confirmable`);

        // Vérification paramétrée : pesée obligatoire ?
        const requireWeighing = await settings.get('reception.require_weighing', { depotId: rec.depot_id, client });
        if (requireWeighing === true && !rec.weighing_id) {
            throw new ValidationError('Une pesée pont-bascule est obligatoire avant confirmation (paramétrage)');
        }

        const lines = await client.query(`SELECT * FROM reception_lines WHERE reception_id = $1`, [rec.id]);

        for (const l of lines.rows) {
            await applyMove({
                depotId: rec.depot_id,
                articleId: l.article_id,
                quantity: l.quantity,
                moveType: 'in',
                sourceModel: 'reception',
                sourceId: rec.id,
                userId,
            }, client);
        }

        const upd = await client.query(`
            UPDATE receptions SET state = 'confirmed' WHERE id = $1
            RETURNING ${HEAD_FIELDS_RAW}
        `, [rec.id]);
        return upd.rows[0];
    });
}

async function confirm(req, res, next) {
    try {
        const result = await _confirmReception(req.params.id, req.user.id);

        await logAudit({ userId: req.user.id, action: 'confirm_reception', entity: 'receptions', entityId: result.id, ip: req.ip });
        broadcast('reception.confirmed', { id: result.id, number: result.number });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const result = await db.transaction(async (client) => {
            const r = await client.query(`SELECT * FROM receptions WHERE id = $1 FOR UPDATE`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            const rec = r.rows[0];
            if (rec.state === 'cancelled') throw new ConflictError('Déjà annulé');

            if (rec.state === 'confirmed') {
                // Vérifier que l'annulation ne créera pas un stock négatif
                // (la marchandise reçue a peut-être déjà été expédiée ou transférée)
                const lines = await client.query(`SELECT article_id, quantity FROM reception_lines WHERE reception_id = $1`, [rec.id]);
                for (const l of lines.rows) {
                    const s = await client.query(
                        `SELECT COALESCE(quantity, 0) AS qty FROM stock_levels WHERE depot_id = $1 AND article_id = $2`,
                        [rec.depot_id, l.article_id]
                    );
                    const current = s.rowCount ? Number(s.rows[0].qty) : 0;
                    if (current < Number(l.quantity)) {
                        throw new ConflictError(
                            `Annulation impossible : stock actuel ${current} < quantité à retirer ${l.quantity}. ` +
                            `Une partie de cette réception a probablement déjà été expédiée ou transférée.`
                        );
                    }
                }
                await reverseDocument({ sourceModel: 'reception', sourceId: rec.id }, client);
            }
            const upd = await client.query(`
                UPDATE receptions SET state = 'cancelled' WHERE id = $1
                RETURNING ${HEAD_FIELDS_RAW}
            `, [rec.id]);
            return upd.rows[0];
        });

        await logAudit({ userId: req.user.id, action: 'cancel_reception', entity: 'receptions', entityId: result.id, ip: req.ip });
        broadcast('reception.cancelled', { id: result.id, number: result.number });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await db.transaction(async (client) => {
            const r = await client.query(`SELECT state FROM receptions WHERE id = $1`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            if (r.rows[0].state !== 'draft') throw new ConflictError('Seul un brouillon peut être supprimé');
            await client.query(`DELETE FROM receptions WHERE id = $1`, [req.params.id]);
        });
        await logAudit({ userId: req.user.id, action: 'delete_reception', entity: 'receptions', entityId: req.params.id, ip: req.ip });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { list, getOne, create, confirm, cancel, remove };
