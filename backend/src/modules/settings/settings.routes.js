'use strict';

const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../../db/pool');
const { authenticate, requireRole } = require('../../middleware/auth');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');

router.use(authenticate);

// ----------------------------- Company -----------------------------
router.get('/company', async (req, res, next) => {
    try {
        const r = await db.query(`SELECT * FROM company LIMIT 1`);
        res.json(r.rows[0] || null);
    } catch (err) { next(err); }
});

router.put('/company', requireRole('admin'), async (req, res, next) => {
    try {
        const allowed = [
            'name', 'address', 'city', 'country', 'phone', 'email',
            'ice', 'rc', 'if_number', 'cnss', 'patente', 'logo_url',
            'currency', 'prefix_br', 'prefix_bl', 'prefix_pb', 'prefix_tr',
        ];
        const data = {};
        for (const f of allowed) if (Object.prototype.hasOwnProperty.call(req.body, f)) data[f] = req.body[f];
        const fields = Object.keys(data);
        if (!fields.length) throw new ValidationError('Aucun champ fourni');

        const existing = await db.query(`SELECT id FROM company LIMIT 1`);
        let r;
        if (existing.rowCount === 0) {
            const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
            r = await db.query(
                `INSERT INTO company (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`,
                fields.map((f) => data[f])
            );
        } else {
            const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(',');
            const values = fields.map((f) => data[f]);
            values.push(existing.rows[0].id);
            r = await db.query(`UPDATE company SET ${sets} WHERE id = $${values.length} RETURNING *`, values);
        }
        await logAudit({ userId: req.user.id, action: 'update_company', entity: 'company', entityId: r.rows[0].id, ip: req.ip });
        res.json(r.rows[0]);
    } catch (err) { next(err); }
});

// ----------------------------- Users -----------------------------
router.get('/users', requireRole('admin'), async (req, res, next) => {
    try {
        const r = await db.query(`
            SELECT id, username, full_name, email, role, active, last_login, created_at
            FROM users ORDER BY username
        `);
        res.json({ items: r.rows });
    } catch (err) { next(err); }
});

router.post('/users', requireRole('admin'), async (req, res, next) => {
    try {
        const { username, password, full_name, email, role, active } = req.body;
        if (!username || !password || !role) throw new ValidationError('username, password, role requis');
        if (!['admin', 'responsable', 'operateur', 'consultation'].includes(role)) {
            throw new ValidationError('Rôle invalide');
        }
        if (password.length < 6) throw new ValidationError('Mot de passe trop court');

        const hash = await bcrypt.hash(password, 10);
        const r = await db.query(`
            INSERT INTO users (username, password_hash, full_name, email, role, active)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
            RETURNING id, username, full_name, email, role, active, created_at
        `, [username, hash, full_name || null, email || null, role, active]);

        await logAudit({ userId: req.user.id, action: 'create_user', entity: 'users', entityId: r.rows[0].id, payload: { username }, ip: req.ip });
        res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
});

router.put('/users/:id', requireRole('admin'), async (req, res, next) => {
    try {
        const allowed = ['full_name', 'email', 'role', 'active'];
        const data = {};
        for (const f of allowed) if (Object.prototype.hasOwnProperty.call(req.body, f)) data[f] = req.body[f];

        if (req.body.password) {
            if (req.body.password.length < 6) throw new ValidationError('Mot de passe trop court');
            data.password_hash = await bcrypt.hash(req.body.password, 10);
        }

        const fields = Object.keys(data);
        if (!fields.length) throw new ValidationError('Aucun champ à mettre à jour');
        const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(',');
        const values = fields.map((f) => data[f]);
        values.push(req.params.id);
        const r = await db.query(`
            UPDATE users SET ${sets} WHERE id = $${values.length}
            RETURNING id, username, full_name, email, role, active, last_login
        `, values);
        if (r.rowCount === 0) throw new NotFoundError();
        await logAudit({ userId: req.user.id, action: 'update_user', entity: 'users', entityId: req.params.id, ip: req.ip });
        res.json(r.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/users/:id', requireRole('admin'), async (req, res, next) => {
    try {
        if (parseInt(req.params.id, 10) === req.user.id) {
            throw new ValidationError('Impossible de se supprimer soi-même');
        }
        const r = await db.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        if (r.rowCount === 0) throw new NotFoundError();
        await logAudit({ userId: req.user.id, action: 'delete_user', entity: 'users', entityId: req.params.id, ip: req.ip });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ----------------------------- Audit log (admin only) -----------------------------
router.get('/audit', requireRole('admin'), async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const r = await db.query(`
            SELECT al.id, al.action, al.entity, al.entity_id, al.payload, al.ip, al.created_at,
                   u.username
            FROM audit_log al
            LEFT JOIN users u ON u.id = al.user_id
            ORDER BY al.created_at DESC
            LIMIT $1
        `, [limit]);
        res.json({ items: r.rows });
    } catch (err) { next(err); }
});

module.exports = router;
