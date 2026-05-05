'use strict';

/**
 * Seed script — initial bootstrap of the database.
 * - Creates default company (NETPROCESS-branded placeholder)
 * - Creates default admin user (admin / admin)
 * - Creates one demo depot, one article, one partner so the UI isn't empty
 *
 * Idempotent: ON CONFLICT DO NOTHING on natural keys.
 */

const bcrypt = require('bcrypt');
const db = require('../src/db/pool');

async function seed() {
    console.log('[Seed] Starting...');

    // Company
    const companyExists = await db.query(`SELECT id FROM company LIMIT 1`);
    if (companyExists.rowCount === 0) {
        await db.query(`
            INSERT INTO company (name, address, city, country, currency,
                                 prefix_br, prefix_bl, prefix_pb, prefix_tr)
            VALUES ('Société STOKVA', 'Adresse du siège', 'Casablanca', 'Maroc', 'MAD',
                    'BR', 'BL', 'PB', 'TR')
        `);
        console.log('[Seed] Company created');
    }

    // Admin user (admin / admin) — change in production!
    const adminExists = await db.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (adminExists.rowCount === 0) {
        const hash = await bcrypt.hash('admin', 10);
        await db.query(`
            INSERT INTO users (username, password_hash, full_name, role, active)
            VALUES ('admin', $1, 'Administrateur', 'admin', TRUE)
        `, [hash]);
        console.log('[Seed] Admin user created (admin / admin) — CHANGE PASSWORD!');
    }

    // Sample depot
    await db.query(`
        INSERT INTO depots (code, name, address, capacity, capacity_unit)
        VALUES ('D001', 'Dépôt Principal', 'Casablanca', 1000, 'T')
        ON CONFLICT (code) DO NOTHING
    `);

    // Sample article
    await db.query(`
        INSERT INTO articles (code, name, unit, stock_min, unit_price)
        VALUES ('ART001', 'Article démo', 'T', 0, 100)
        ON CONFLICT (code) DO NOTHING
    `);

    // Sample partner
    await db.query(`
        INSERT INTO partners (code, name, type, city)
        VALUES ('P001', 'Partenaire démo', 'mixte', 'Casablanca')
        ON CONFLICT (code) DO NOTHING
    `);

    console.log('[Seed] Done.');
    await db.close();
}

seed().catch((err) => {
    console.error('[Seed] FAILED:', err);
    process.exit(1);
});
