'use strict';

const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: config.db.max,
    idleTimeoutMillis: config.db.idleTimeoutMillis,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err);
});

/**
 * Execute a query with automatic connection management
 * @param {string} text - SQL query (with $1, $2 placeholders)
 * @param {Array} params - Query parameters
 * @returns {Promise<QueryResult>}
 */
async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.env === 'development' && duration > 200) {
        console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 80));
    }
    return res;
}

/**
 * Execute multiple queries inside a transaction
 * @param {Function} callback - async (client) => { ... }
 */
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function close() {
    await pool.end();
}

module.exports = { pool, query, transaction, close };
