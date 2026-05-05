'use strict';

const bcrypt = require('bcrypt');
const db = require('../../db/pool');
const { signAccessToken, signRefreshToken, verifyToken } = require('../../middleware/auth');
const { UnauthorizedError, ValidationError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');

const REFRESH_DAYS = 7;

async function login(req, res, next) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            throw new ValidationError('username et password requis');
        }

        const r = await db.query(
            `SELECT id, username, password_hash, full_name, email, role, active
             FROM users WHERE username = $1`,
            [username]
        );
        if (r.rowCount === 0) throw new UnauthorizedError('Identifiants incorrects');

        const u = r.rows[0];
        if (!u.active) throw new UnauthorizedError('Compte désactivé');

        const ok = await bcrypt.compare(password, u.password_hash);
        if (!ok) throw new UnauthorizedError('Identifiants incorrects');

        const payload = { sub: u.id, username: u.username, role: u.role };
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000);
        await db.query(
            `INSERT INTO user_sessions (user_id, refresh_token, user_agent, ip, expires_at)
             VALUES ($1,$2,$3,$4,$5)`,
            [u.id, refreshToken, req.get('user-agent') || null, req.ip, expiresAt]
        );

        await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [u.id]);
        await logAudit({ userId: u.id, action: 'login', entity: 'users', entityId: u.id, ip: req.ip });

        res.json({
            accessToken,
            refreshToken,
            user: {
                id: u.id,
                username: u.username,
                fullName: u.full_name,
                email: u.email,
                role: u.role,
            },
        });
    } catch (err) {
        next(err);
    }
}

async function refresh(req, res, next) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) throw new ValidationError('refreshToken requis');

        let decoded;
        try {
            decoded = verifyToken(refreshToken);
        } catch {
            throw new UnauthorizedError('Refresh token invalide');
        }

        const r = await db.query(
            `SELECT s.id, s.expires_at, u.id AS user_id, u.username, u.role, u.active
             FROM user_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.refresh_token = $1`,
            [refreshToken]
        );
        if (r.rowCount === 0) throw new UnauthorizedError('Session inconnue');
        const s = r.rows[0];
        if (new Date(s.expires_at) < new Date()) throw new UnauthorizedError('Session expirée');
        if (!s.active) throw new UnauthorizedError('Compte désactivé');

        const payload = { sub: s.user_id, username: s.username, role: s.role };
        const newAccess = signAccessToken(payload);
        res.json({ accessToken: newAccess });
    } catch (err) {
        next(err);
    }
}

async function logout(req, res, next) {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            await db.query(`DELETE FROM user_sessions WHERE refresh_token = $1`, [refreshToken]);
        }
        if (req.user) {
            await logAudit({ userId: req.user.id, action: 'logout', ip: req.ip });
        }
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

async function me(req, res, next) {
    try {
        const r = await db.query(
            `SELECT id, username, full_name, email, role, last_login, created_at
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (r.rowCount === 0) throw new UnauthorizedError();
        const u = r.rows[0];
        res.json({
            id: u.id,
            username: u.username,
            fullName: u.full_name,
            email: u.email,
            role: u.role,
            lastLogin: u.last_login,
            createdAt: u.created_at,
        });
    } catch (err) {
        next(err);
    }
}

async function changePassword(req, res, next) {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword || newPassword.length < 6) {
            throw new ValidationError('Mot de passe trop court (min 6 caractères)');
        }
        const r = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
        if (r.rowCount === 0) throw new UnauthorizedError();
        const ok = await bcrypt.compare(oldPassword, r.rows[0].password_hash);
        if (!ok) throw new UnauthorizedError('Ancien mot de passe incorrect');

        const hash = await bcrypt.hash(newPassword, 10);
        await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.user.id]);
        await db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [req.user.id]);
        await logAudit({ userId: req.user.id, action: 'change_password', ip: req.ip });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { login, refresh, logout, me, changePassword };
