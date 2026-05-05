'use strict';

const { AppError } = require('../utils/errors');

function notFoundHandler(req, res, next) {
    res.status(404).json({
        error: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} introuvable`,
    });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
        return res.status(err.status).json({
            error: err.code || 'ERROR',
            message: err.message,
            details: err.details || undefined,
        });
    }

    // PostgreSQL unique violation
    if (err.code === '23505') {
        return res.status(409).json({
            error: 'CONFLICT',
            message: 'Doublon détecté (contrainte unique)',
            detail: err.detail,
        });
    }
    // PostgreSQL foreign key
    if (err.code === '23503') {
        return res.status(409).json({
            error: 'FK_VIOLATION',
            message: 'Référence invalide (clé étrangère)',
            detail: err.detail,
        });
    }
    // PostgreSQL check
    if (err.code === '23514') {
        return res.status(400).json({
            error: 'CHECK_VIOLATION',
            message: 'Valeur invalide',
            detail: err.detail,
        });
    }

    console.error('[UnhandledError]', err);
    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Erreur interne du serveur',
    });
}

module.exports = { notFoundHandler, errorHandler };
