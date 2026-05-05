'use strict';

/**
 * DANGER: Drops ALL tables in the public schema and re-runs migrations.
 * Use only in dev. Pass --force to skip confirmation prompt.
 *
 * Note: requires superuser privileges on the database to drop the schema.
 * Set PG_SUPERUSER and PG_SUPERUSER_PASSWORD env vars if your app user
 * doesn't have schema-drop rights (typical in production).
 */

const { execSync } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const config = require('../src/config');

async function reset() {
    if (!process.argv.includes('--force')) {
        console.error('Refus : ajoutez --force pour confirmer la destruction des données.');
        process.exit(1);
    }

    // Use superuser if provided, else fallback to app user
    const pool = new Pool({
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: process.env.PG_SUPERUSER || config.db.user,
        password: process.env.PG_SUPERUSER_PASSWORD || config.db.password,
    });

    console.log('[Reset] Dropping schema...');
    try {
        await pool.query(`DROP SCHEMA IF EXISTS public CASCADE`);
        await pool.query(`CREATE SCHEMA public`);
        // Grant rights back to app user
        await pool.query(`GRANT ALL ON SCHEMA public TO ${config.db.user}`);
    } catch (err) {
        console.error('[Reset] Drop/create failed.');
        console.error('Hint: si l\'erreur est "must be owner of schema public",');
        console.error('définissez PG_SUPERUSER=postgres PG_SUPERUSER_PASSWORD=... avant de lancer.');
        throw err;
    } finally {
        await pool.end();
    }

    console.log('[Reset] Running migrations...');
    execSync('node ' + path.join(__dirname, 'migrate.js'), { stdio: 'inherit' });

    console.log('[Reset] Running seed...');
    execSync('node ' + path.join(__dirname, 'seed.js'), { stdio: 'inherit' });

    console.log('[Reset] Done.');
}

reset().catch((err) => {
    console.error('[Reset] FAILED:', err.message);
    process.exit(1);
});
