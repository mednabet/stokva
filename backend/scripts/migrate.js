'use strict';

/**
 * Migration runner.
 * Reads .sql files from migrations/ and applies them in alphabetical order.
 * Tracks applied migrations in `_migrations` table.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/db/pool');

async function ensureMigrationTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id        SERIAL PRIMARY KEY,
            filename  VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
}

async function getApplied() {
    const r = await db.query(`SELECT filename FROM _migrations ORDER BY id`);
    return new Set(r.rows.map(x => x.filename));
}

async function run() {
    console.log('[Migrate] Connecting to DB...');
    await ensureMigrationTable();
    const applied = await getApplied();

    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

    for (const f of files) {
        if (applied.has(f)) {
            console.log(`[Migrate] Skip (already applied): ${f}`);
            continue;
        }
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        console.log(`[Migrate] Applying ${f}...`);
        await db.transaction(async (client) => {
            await client.query(sql);
            await client.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [f]);
        });
        console.log(`[Migrate] OK ${f}`);
    }

    console.log('[Migrate] Done.');
    await db.close();
}

run().catch((err) => {
    console.error('[Migrate] FAILED:', err);
    process.exit(1);
});
