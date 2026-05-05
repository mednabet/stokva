'use strict';

const db = require('../db/pool');

/**
 * Generate next document number atomically.
 * Format: PREFIX/YYYY/NNNNN
 * Uses table_name + prefix to find max number for current year.
 */
async function nextNumber(table, prefix, client = null) {
    const exec = client ? client.query.bind(client) : db.query;
    const year = new Date().getFullYear();
    const pattern = `${prefix}/${year}/%`;

    const r = await exec(
        `SELECT COALESCE(MAX(CAST(split_part(number, '/', 3) AS INTEGER)), 0) AS maxn
         FROM ${table}
         WHERE number LIKE $1`,
        [pattern]
    );
    const next = (r.rows[0].maxn || 0) + 1;
    return `${prefix}/${year}/${String(next).padStart(5, '0')}`;
}

module.exports = { nextNumber };
