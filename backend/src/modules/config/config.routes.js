'use strict';

const router = require('express').Router();
const db = require('../../db/pool');
const settings = require('../../utils/settingsService');
const customFields = require('../../utils/customFieldsService');
const { authenticate, requireRole } = require('../../middleware/auth');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');
const { broadcast } = require('../../websocket/hub');

router.use(authenticate);

// ==============================================================
//  SETTINGS — paramètres à 3 niveaux
// ==============================================================

/**
 * GET /api/config/settings
 * Liste tous les paramètres (tous scopes), avec libellé scope.
 */
router.get('/settings', async (req, res, next) => {
    try {
        const all = await settings.listAll();
        res.json({ items: all });
    } catch (err) { next(err); }
});

/**
 * GET /api/config/settings/effective-all?depot_id=...&article_id=...
 * Pour chaque clé société, renvoie la valeur effective + le scope qui l'a fournie.
 * Idéal pour une UI de paramétrage par contexte.
 */
router.get('/settings/effective-all', async (req, res, next) => {
    try {
        const depotId = req.query.depot_id ? parseInt(req.query.depot_id, 10) : null;
        const articleId = req.query.article_id ? parseInt(req.query.article_id, 10) : null;

        const r = await db.query(`
            SELECT key, value AS company_value, description
            FROM settings WHERE scope = 'company'
            ORDER BY key
        `);
        const out = [];
        for (const row of r.rows) {
            let source = 'company';
            let effective = row.company_value;

            if (depotId) {
                const d = await db.query(
                    `SELECT value FROM settings WHERE scope='depot' AND scope_id=$1 AND key=$2`,
                    [depotId, row.key]
                );
                if (d.rowCount) { source = 'depot'; effective = d.rows[0].value; }
            }
            if (articleId) {
                const a = await db.query(
                    `SELECT value FROM settings WHERE scope='article' AND scope_id=$1 AND key=$2`,
                    [articleId, row.key]
                );
                if (a.rowCount) { source = 'article'; effective = a.rows[0].value; }
            }

            out.push({
                key: row.key,
                value: effective,
                source,
                companyValue: row.company_value,
                description: row.description,
            });
        }
        res.json({ depotId, articleId, items: out });
    } catch (err) { next(err); }
});

/**
 * GET /api/config/settings/effective?key=...&depot_id=...&article_id=...
 * Renvoie la valeur effective après cascade Article > Dépôt > Société.
 */
router.get('/settings/effective', async (req, res, next) => {
    try {
        const { key, depot_id, article_id } = req.query;
        if (!key) throw new ValidationError('paramètre key requis');
        const v = await settings.get(key, {
            depotId: depot_id ? parseInt(depot_id, 10) : null,
            articleId: article_id ? parseInt(article_id, 10) : null,
        });
        res.json({ key, value: v });
    } catch (err) { next(err); }
});

/**
 * GET /api/config/settings/:scope/:scopeId?
 * Liste les paramètres d'un scope donné.
 */
router.get('/settings/:scope/:scopeId?', async (req, res, next) => {
    try {
        const scope = req.params.scope;
        if (!['company', 'depot', 'article'].includes(scope)) {
            throw new ValidationError('scope invalide');
        }
        const scopeId = scope === 'company' ? null : parseInt(req.params.scopeId, 10);
        const items = await settings.listForScope(scope, scopeId);
        res.json({ scope, scopeId, items });
    } catch (err) { next(err); }
});

/**
 * PUT /api/config/settings/:scope/:scopeId?
 * body : { key: "stock.allow_negative", value: true, description: "..." }
 */
router.put('/settings/:scope/:scopeId?', requireRole('admin'), async (req, res, next) => {
    try {
        const scope = req.params.scope;
        const scopeId = scope === 'company' ? null
            : (req.params.scopeId ? parseInt(req.params.scopeId, 10) : null);
        const { key, value, description } = req.body;
        if (!key) throw new ValidationError('key requis');

        await settings.set(scope, scopeId, key, value, {
            userId: req.user.id, description,
        });

        await logAudit({
            userId: req.user.id, action: 'set_setting', entity: 'settings',
            payload: { scope, scopeId, key, value }, ip: req.ip,
        });
        broadcast('config.changed', { scope, scopeId, key });

        res.json({ ok: true, scope, scopeId, key, value });
    } catch (err) { next(err); }
});

/**
 * DELETE /api/config/settings/:scope/:scopeId?/:key
 * Supprime un override pour revenir au niveau parent.
 */
router.delete('/settings/:scope/:scopeIdOrKey/:key?', requireRole('admin'), async (req, res, next) => {
    try {
        const scope = req.params.scope;
        let scopeId, key;
        if (scope === 'company') {
            scopeId = null;
            key = req.params.scopeIdOrKey;
        } else {
            scopeId = parseInt(req.params.scopeIdOrKey, 10);
            key = req.params.key;
        }
        if (!key) throw new ValidationError('clé manquante');

        await settings.unset(scope, scopeId, key);
        await logAudit({
            userId: req.user.id, action: 'unset_setting', entity: 'settings',
            payload: { scope, scopeId, key }, ip: req.ip,
        });
        broadcast('config.changed', { scope, scopeId, key });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

/**
 * POST /api/config/cache/clear
 * Vide manuellement le cache (utile après import en masse).
 */
router.post('/cache/clear', requireRole('admin'), async (req, res, next) => {
    try {
        settings.clearCache();
        customFields.invalidate();
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ==============================================================
//  CUSTOM FIELDS — champs personnalisés
// ==============================================================

/**
 * GET /api/config/custom-fields?entity=reception
 */
router.get('/custom-fields', async (req, res, next) => {
    try {
        const where = [];
        const params = [];
        if (req.query.entity) {
            params.push(req.query.entity);
            where.push(`entity = $${params.length}`);
        }
        const r = await db.query(
            `SELECT * FROM custom_fields ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY entity, display_order, id`,
            params
        );
        res.json({ items: r.rows });
    } catch (err) { next(err); }
});

/**
 * GET /api/config/custom-fields/by-entity/:entity
 * Renvoie uniquement les définitions actives.
 */
router.get('/custom-fields/by-entity/:entity', async (req, res, next) => {
    try {
        const defs = await customFields.getDefs(req.params.entity);
        res.json({ entity: req.params.entity, items: defs });
    } catch (err) { next(err); }
});

const ALLOWED_ENTITIES = ['reception','expedition','transfer','weighing','partner','article','vehicle'];
const ALLOWED_TYPES = ['text','number','date','datetime','boolean','select','multiselect'];

/**
 * POST /api/config/custom-fields
 */
router.post('/custom-fields', requireRole('admin'), async (req, res, next) => {
    try {
        const b = req.body;
        if (!ALLOWED_ENTITIES.includes(b.entity)) throw new ValidationError('entity invalide');
        if (!ALLOWED_TYPES.includes(b.field_type)) throw new ValidationError('field_type invalide');
        if (!b.code || !b.label) throw new ValidationError('code et label requis');

        const r = await db.query(`
            INSERT INTO custom_fields
              (entity, code, label, field_type, required,
               min_value, max_value, min_length, max_length,
               pattern, options, required_when, default_value,
               help_text, display_order, active)
            VALUES ($1,$2,$3,$4,COALESCE($5,FALSE),$6,$7,$8,$9,$10,
                    $11::jsonb,$12::jsonb,$13::jsonb,$14,COALESCE($15,100),COALESCE($16,TRUE))
            RETURNING *
        `, [
            b.entity, b.code, b.label, b.field_type, b.required,
            b.min_value || null, b.max_value || null, b.min_length || null, b.max_length || null,
            b.pattern || null,
            b.options ? JSON.stringify(b.options) : null,
            b.required_when ? JSON.stringify(b.required_when) : null,
            b.default_value !== undefined ? JSON.stringify(b.default_value) : null,
            b.help_text || null, b.display_order, b.active,
        ]);

        customFields.invalidate(b.entity);
        await logAudit({ userId: req.user.id, action: 'create_custom_field', entity: 'custom_fields', entityId: r.rows[0].id, payload: { entity: b.entity, code: b.code }, ip: req.ip });
        broadcast('config.changed', { type: 'custom_field', entity: b.entity });
        res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
});

router.put('/custom-fields/:id', requireRole('admin'), async (req, res, next) => {
    try {
        const allowed = ['label','field_type','required','min_value','max_value','min_length','max_length',
                         'pattern','options','required_when','default_value','help_text','display_order','active'];
        const sets = [], values = [];
        for (const f of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) {
                values.push(['options','required_when','default_value'].includes(f) && req.body[f] !== null
                    ? JSON.stringify(req.body[f]) : req.body[f]);
                sets.push(`${f} = $${values.length}${['options','required_when','default_value'].includes(f) ? '::jsonb' : ''}`);
            }
        }
        if (!sets.length) throw new ValidationError('Aucun champ à mettre à jour');
        values.push(req.params.id);

        const r = await db.query(`
            UPDATE custom_fields SET ${sets.join(', ')}
            WHERE id = $${values.length}
            RETURNING *
        `, values);
        if (r.rowCount === 0) throw new NotFoundError();

        customFields.invalidate(r.rows[0].entity);
        await logAudit({ userId: req.user.id, action: 'update_custom_field', entity: 'custom_fields', entityId: r.rows[0].id, ip: req.ip });
        res.json(r.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/custom-fields/:id', requireRole('admin'), async (req, res, next) => {
    try {
        const r = await db.query(`DELETE FROM custom_fields WHERE id = $1 RETURNING entity`, [req.params.id]);
        if (r.rowCount === 0) throw new NotFoundError();
        customFields.invalidate(r.rows[0].entity);
        await logAudit({ userId: req.user.id, action: 'delete_custom_field', entity: 'custom_fields', entityId: req.params.id, ip: req.ip });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

module.exports = router;
