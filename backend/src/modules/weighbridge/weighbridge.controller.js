'use strict';

const db = require('../../db/pool');
const { nextNumber } = require('../../utils/sequence');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');
const { broadcast } = require('../../websocket/hub');
const settings = require('../../utils/settingsService');
const customFields = require('../../utils/customFieldsService');
const wb = require('./weighbridge.service');

/**
 * Modes supportés (configurables via setting `weighing.modes_enabled`) :
 *
 * - simple              : pesage libre (1 mesure isolée, pas de tare requise)
 * - manuel              : opérateur saisit brut + tare manuellement
 * - tare_enregistree    : utilise la tare déjà enregistrée sur le véhicule
 * - 2_passes            : workflow classique brut → tare (état first_pass → done)
 * - simulation / serial : conservés pour compat (proviennent du port série)
 */

// =====================================================================
//  Live + lecture
// =====================================================================

async function live(req, res) {
    res.json({
        weight: wb.getCurrentWeight(),
        ...wb.getStatus(),
    });
}

async function list(req, res, next) {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const offset = parseInt(req.query.offset || '0', 10);
        const where = [];
        const params = [];

        if (req.query.state) { params.push(req.query.state); where.push(`w.state = $${params.length}`); }
        if (req.query.mode)  { params.push(req.query.mode);  where.push(`w.mode = $${params.length}`); }
        if (req.query.date_from) { params.push(req.query.date_from); where.push(`w.weighing_date >= $${params.length}`); }
        if (req.query.date_to)   { params.push(req.query.date_to);   where.push(`w.weighing_date <= $${params.length}`); }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        params.push(offset);

        const r = await db.query(`
            SELECT w.*, p.name AS partner_name, a.name AS article_name, v.plate AS vehicle_plate,
                   COUNT(*) OVER() AS total_count
            FROM weighings w
            LEFT JOIN partners p ON p.id = w.partner_id
            LEFT JOIN articles a ON a.id = w.article_id
            LEFT JOIN vehicles v ON v.id = w.vehicle_id
            ${whereSql}
            ORDER BY w.weighing_date DESC, w.id DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const total = r.rows[0]?.total_count ? parseInt(r.rows[0].total_count, 10) : 0;
        res.json({
            items: r.rows.map(({ total_count, ...rest }) => rest),
            total, limit, offset,
        });
    } catch (err) { next(err); }
}

async function getOne(req, res, next) {
    try {
        const r = await db.query(`
            SELECT w.*, p.name AS partner_name, a.name AS article_name, v.plate AS vehicle_plate, v.tare AS vehicle_tare
            FROM weighings w
            LEFT JOIN partners p ON p.id = w.partner_id
            LEFT JOIN articles a ON a.id = w.article_id
            LEFT JOIN vehicles v ON v.id = w.vehicle_id
            WHERE w.id = $1
        `, [req.params.id]);
        if (r.rowCount === 0) throw new NotFoundError();
        res.json(r.rows[0]);
    } catch (err) { next(err); }
}

// =====================================================================
//  Helpers : validation paramétrée
// =====================================================================

/**
 * Vérifie les règles métier paramétrables sur une pesée :
 * - mode autorisé
 * - poids min/max
 * - tolérance entre tare mesurée et tare véhicule
 * - champs requis (vehicle, driver, partner)
 */
async function _validateWeighing(payload, mode) {
    const cfg = await settings.getMany([
        'weighing.modes_enabled',
        'weighing.min_weight',
        'weighing.max_weight',
        'weighing.tare_tolerance_pct',
        'weighing.require_vehicle',
        'weighing.require_driver',
        'weighing.require_partner',
    ]);

    // Mode autorisé ?
    const enabledModes = Array.isArray(cfg['weighing.modes_enabled']) ? cfg['weighing.modes_enabled'] : [];
    if (enabledModes.length && !enabledModes.includes(mode)) {
        throw new ValidationError(
            `Mode de pesage "${mode}" désactivé. Modes autorisés : ${enabledModes.join(', ')}`
        );
    }

    // Limites de poids
    const min = Number(cfg['weighing.min_weight'] ?? 0);
    const max = Number(cfg['weighing.max_weight'] ?? Number.POSITIVE_INFINITY);
    if (payload.gross_weight !== undefined && payload.gross_weight !== null) {
        const g = Number(payload.gross_weight);
        if (g < min) throw new ValidationError(`Poids brut ${g} sous le minimum autorisé (${min} kg)`);
        if (g > max) throw new ValidationError(`Poids brut ${g} au-dessus du maximum autorisé (${max} kg)`);
    }

    // Champs requis
    if (cfg['weighing.require_vehicle'] === true && !payload.vehicle_id && !payload.plate) {
        throw new ValidationError('Véhicule (id ou plaque) obligatoire (paramétrage)');
    }
    if (cfg['weighing.require_driver'] === true && !payload.driver_id && !payload.driver_name) {
        throw new ValidationError('Chauffeur obligatoire (paramétrage)');
    }
    if (cfg['weighing.require_partner'] === true && !payload.partner_id) {
        throw new ValidationError('Partenaire obligatoire (paramétrage)');
    }

    return cfg;
}

/**
 * Vérifie la tolérance entre tare mesurée et tare véhicule enregistrée.
 * Renvoie un warning si écart > tolérance, ne bloque pas.
 */
async function _checkTareTolerance(vehicleId, measuredTare, tolerancePct) {
    if (!vehicleId || !tolerancePct || tolerancePct <= 0) return null;
    const v = await db.query(`SELECT tare FROM vehicles WHERE id = $1`, [vehicleId]);
    if (v.rowCount === 0 || !v.rows[0].tare) return null;
    const refTare = Number(v.rows[0].tare);
    if (refTare === 0) return null;
    const deviation = Math.abs(measuredTare - refTare);
    const pct = (deviation / refTare) * 100;
    if (pct > tolerancePct) {
        return {
            warning: 'TARE_OUT_OF_TOLERANCE',
            measuredTare, referenceTare: refTare, deviationPct: pct, tolerancePct,
            message: `Tare mesurée (${measuredTare}) s'écarte de ${pct.toFixed(1)}% de la tare véhicule (${refTare}). Tolérance : ${tolerancePct}%`,
        };
    }
    return null;
}

// =====================================================================
//  Création de pesées par mode
// =====================================================================

/**
 * POST /api/weighbridge/weighings
 * Mode '2_passes' : capture le brut, état first_pass.
 * (compat ancien : si pas de mode fourni, utilise 2_passes)
 */
async function firstPass(req, res, next) {
    try {
        const payload = req.body;
        const mode = payload.mode || '2_passes';
        if (!payload.gross_weight) throw new ValidationError('gross_weight requis');

        await _validateWeighing(payload, mode);
        const validatedCustom = await customFields.validate('weighing', payload.custom_data);

        const prefRes = await db.query(`SELECT prefix_pb FROM company LIMIT 1`);
        const prefix = prefRes.rows[0]?.prefix_pb || 'PB';
        const number = await nextNumber('weighings', prefix);

        const r = await db.query(`
            INSERT INTO weighings
              (number, vehicle_id, plate, driver_id, driver_name, partner_id, article_id,
               gross_weight, mode, state, operation_type, user_id, notes, custom_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'first_pass', $10, $11, $12, $13::jsonb)
            RETURNING *
        `, [number, payload.vehicle_id || null, payload.plate || null,
            payload.driver_id || null, payload.driver_name || null,
            payload.partner_id || null, payload.article_id || null,
            payload.gross_weight, mode, payload.operation_type || null,
            req.user.id, payload.notes || null, JSON.stringify(validatedCustom)]);

        await logAudit({ userId: req.user.id, action: 'weighbridge_first_pass', entity: 'weighings',
                         entityId: r.rows[0].id, payload: { number }, ip: req.ip });
        broadcast('weighing.first_pass', r.rows[0]);
        res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
}

/**
 * POST /api/weighbridge/weighings/:id/second-pass
 * Mode '2_passes' : capture la tare, calcul auto du net.
 */
async function secondPass(req, res, next) {
    try {
        const { tare_weight } = req.body;
        if (tare_weight === undefined || tare_weight === null) {
            throw new ValidationError('tare_weight requis');
        }

        const r = await db.query(`SELECT * FROM weighings WHERE id = $1`, [req.params.id]);
        if (r.rowCount === 0) throw new NotFoundError();
        const w = r.rows[0];
        if (w.state !== 'first_pass') throw new ConflictError('Pesée non en attente de tare');
        if (Number(tare_weight) > Number(w.gross_weight)) {
            throw new ValidationError('Tare > poids brut');
        }

        // Vérification tolérance tare (warning, pas blocage)
        const tolerancePct = await settings.get('weighing.tare_tolerance_pct');
        const tareWarning = await _checkTareTolerance(w.vehicle_id, Number(tare_weight), Number(tolerancePct));

        const upd = await db.query(`
            UPDATE weighings SET tare_weight = $1, state = 'done'
            WHERE id = $2 RETURNING *
        `, [tare_weight, req.params.id]);

        await logAudit({ userId: req.user.id, action: 'weighbridge_second_pass', entity: 'weighings',
                         entityId: upd.rows[0].id, ip: req.ip });
        broadcast('weighing.done', upd.rows[0]);
        res.json({ ...upd.rows[0], tareWarning: tareWarning || undefined });
    } catch (err) { next(err); }
}

/**
 * POST /api/weighbridge/weighings/single
 * Mode 'manuel' : opérateur saisit brut + tare en un seul appel.
 */
async function single(req, res, next) {
    try {
        const payload = req.body;
        const mode = payload.mode || 'manuel';
        if (!payload.gross_weight) throw new ValidationError('gross_weight requis');
        if (payload.tare_weight === undefined) throw new ValidationError('tare_weight requis');
        if (Number(payload.tare_weight) > Number(payload.gross_weight)) {
            throw new ValidationError('Tare > poids brut');
        }

        const cfg = await _validateWeighing(payload, mode);
        const validatedCustom = await customFields.validate('weighing', payload.custom_data);

        // Tolérance tare
        const tareWarning = await _checkTareTolerance(payload.vehicle_id, Number(payload.tare_weight),
                                                       Number(cfg['weighing.tare_tolerance_pct']));

        const prefRes = await db.query(`SELECT prefix_pb FROM company LIMIT 1`);
        const prefix = prefRes.rows[0]?.prefix_pb || 'PB';
        const number = await nextNumber('weighings', prefix);

        const r = await db.query(`
            INSERT INTO weighings
              (number, vehicle_id, plate, driver_id, driver_name, partner_id, article_id,
               gross_weight, tare_weight, mode, state, operation_type, user_id, notes, custom_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'done', $11, $12, $13, $14::jsonb)
            RETURNING *
        `, [number, payload.vehicle_id || null, payload.plate || null,
            payload.driver_id || null, payload.driver_name || null,
            payload.partner_id || null, payload.article_id || null,
            payload.gross_weight, payload.tare_weight, mode,
            payload.operation_type || null, req.user.id, payload.notes || null,
            JSON.stringify(validatedCustom)]);

        await logAudit({ userId: req.user.id, action: 'weighbridge_single', entity: 'weighings',
                         entityId: r.rows[0].id, payload: { number, mode }, ip: req.ip });
        broadcast('weighing.done', r.rows[0]);
        res.status(201).json({ ...r.rows[0], tareWarning: tareWarning || undefined });
    } catch (err) { next(err); }
}

/**
 * POST /api/weighbridge/weighings/with-vehicle-tare
 * Mode 'tare_enregistree' : utilise la tare déjà connue sur le véhicule.
 */
async function withVehicleTare(req, res, next) {
    try {
        const payload = req.body;
        const mode = 'tare_enregistree';
        if (!payload.gross_weight) throw new ValidationError('gross_weight requis');
        if (!payload.vehicle_id) throw new ValidationError('vehicle_id requis pour ce mode');

        await _validateWeighing(payload, mode);

        const v = await db.query(`SELECT plate, tare FROM vehicles WHERE id = $1`, [payload.vehicle_id]);
        if (v.rowCount === 0) throw new NotFoundError('Véhicule introuvable');
        const tare = Number(v.rows[0].tare || 0);
        if (tare <= 0) {
            throw new ValidationError('Le véhicule n\'a pas de tare enregistrée. Configurez sa tare ou utilisez un autre mode.');
        }
        if (tare >= Number(payload.gross_weight)) {
            throw new ValidationError(`Tare véhicule (${tare}) >= poids brut (${payload.gross_weight})`);
        }

        const validatedCustom = await customFields.validate('weighing', payload.custom_data);

        const prefRes = await db.query(`SELECT prefix_pb FROM company LIMIT 1`);
        const prefix = prefRes.rows[0]?.prefix_pb || 'PB';
        const number = await nextNumber('weighings', prefix);

        const r = await db.query(`
            INSERT INTO weighings
              (number, vehicle_id, plate, driver_id, driver_name, partner_id, article_id,
               gross_weight, tare_weight, mode, state, operation_type, user_id, notes, custom_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'done', $11, $12, $13, $14::jsonb)
            RETURNING *
        `, [number, payload.vehicle_id, v.rows[0].plate,
            payload.driver_id || null, payload.driver_name || null,
            payload.partner_id || null, payload.article_id || null,
            payload.gross_weight, tare, mode,
            payload.operation_type || null, req.user.id, payload.notes || null,
            JSON.stringify(validatedCustom)]);

        await logAudit({ userId: req.user.id, action: 'weighbridge_vehicle_tare', entity: 'weighings',
                         entityId: r.rows[0].id, payload: { number, vehicleTare: tare }, ip: req.ip });
        broadcast('weighing.done', r.rows[0]);
        res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
}

/**
 * POST /api/weighbridge/weighings/simple
 * Mode 'simple' : pesage libre, une seule mesure sans tare.
 * Le 'gross_weight' représente directement le poids mesuré.
 * Utile pour : pesées d'inventaire, contrôles ponctuels, marchandises diverses.
 */
async function simple(req, res, next) {
    try {
        const payload = req.body;
        const mode = 'simple';
        if (!payload.gross_weight) throw new ValidationError('gross_weight (poids mesuré) requis');

        await _validateWeighing(payload, mode);
        const validatedCustom = await customFields.validate('weighing', payload.custom_data);

        const prefRes = await db.query(`SELECT prefix_pb FROM company LIMIT 1`);
        const prefix = prefRes.rows[0]?.prefix_pb || 'PB';
        const number = await nextNumber('weighings', prefix);

        // Pour mode simple : tare=0 → net = gross
        const r = await db.query(`
            INSERT INTO weighings
              (number, vehicle_id, plate, driver_id, driver_name, partner_id, article_id,
               gross_weight, tare_weight, mode, state, operation_type, user_id, notes, custom_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 'done', $10, $11, $12, $13::jsonb)
            RETURNING *
        `, [number, payload.vehicle_id || null, payload.plate || null,
            payload.driver_id || null, payload.driver_name || null,
            payload.partner_id || null, payload.article_id || null,
            payload.gross_weight, mode,
            payload.operation_type || null, req.user.id, payload.notes || null,
            JSON.stringify(validatedCustom)]);

        await logAudit({ userId: req.user.id, action: 'weighbridge_simple', entity: 'weighings',
                         entityId: r.rows[0].id, payload: { number }, ip: req.ip });
        broadcast('weighing.done', r.rows[0]);
        res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
}

async function cancel(req, res, next) {
    try {
        const r = await db.query(`UPDATE weighings SET state='cancelled' WHERE id=$1 RETURNING *`, [req.params.id]);
        if (r.rowCount === 0) throw new NotFoundError();
        await logAudit({ userId: req.user.id, action: 'weighbridge_cancel', entity: 'weighings',
                         entityId: r.rows[0].id, ip: req.ip });
        broadcast('weighing.cancelled', r.rows[0]);
        res.json(r.rows[0]);
    } catch (err) { next(err); }
}

module.exports = { live, list, getOne, firstPass, secondPass, single, withVehicleTare, simple, cancel };
