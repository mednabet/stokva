'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

function signAccessToken(payload) {
    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function signRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.refreshExpiresIn });
}

function verifyToken(token) {
    return jwt.verify(token, config.jwt.secret);
}

/**
 * Express middleware: requires Bearer token in Authorization header.
 * Attaches req.user = { id, username, role }
 */
function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return next(new UnauthorizedError('Token manquant'));

    try {
        const decoded = verifyToken(m[1]);
        req.user = {
            id: decoded.sub,
            username: decoded.username,
            role: decoded.role,
        };
        next();
    } catch (err) {
        next(new UnauthorizedError('Token invalide ou expiré'));
    }
}

/**
 * RBAC: restrict route to certain roles.
 * Usage: router.post('/', authenticate, requireRole('admin','responsable'), handler)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return next(new UnauthorizedError());
        if (!roles.includes(req.user.role)) {
            return next(new ForbiddenError(`Rôle requis : ${roles.join(' ou ')}`));
        }
        next();
    };
}

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyToken,
    authenticate,
    requireRole,
};
