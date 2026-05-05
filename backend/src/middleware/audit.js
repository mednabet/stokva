'use strict';

const db = require('../db/pool');

async function logAudit({ userId, action, entity, entityId, payload, ip }) {
    try {
        await db.query(
            `INSERT INTO audit_log (user_id, action, entity, entity_id, payload, ip)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [userId || null, action, entity || null, entityId || null, payload ? JSON.stringify(payload) : null, ip || null]
        );
    } catch (err) {
        console.error('[Audit] Failed to log:', err.message);
    }
}

module.exports = { logAudit };
