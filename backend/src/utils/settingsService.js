'use strict';

/**
 * Service de paramètres avec cache.
 *
 * Toutes les lectures de paramètres passent par ici. La cache est invalidée
 * dès qu'une écriture est faite via PUT /api/config (voir config.routes.js)
 * et automatiquement par TTL (60s) en cas d'écriture concurrente.
 */

const db = require('../db/pool');
const { ValidationError } = require('./errors');

const TTL_MS = 60_000;
const cache = new Map(); // key: `${key}|${depotId||''}|${articleId||''}` → { val, expiresAt }

function cacheKey(key, depotId, articleId) {
    return `${key}|${depotId || ''}|${articleId || ''}`;
}

/**
 * Récupère un paramètre avec cascade Article > Dépôt > Société.
 *
 * @param {string} key - clé du paramètre (ex: 'stock.allow_negative')
 * @param {Object} [opts]
 * @param {number} [opts.depotId]
 * @param {number} [opts.articleId]
 * @param {*}      [opts.defaultValue]
 * @param {Object} [opts.client] - pg client si transaction
 * @returns {Promise<*>} valeur déserialisée (boolean, number, string, array, object)
 */
async function get(key, opts = {}) {
    const { depotId = null, articleId = null, defaultValue = null, client = null } = opts;
    const ck = cacheKey(key, depotId, articleId);
    const now = Date.now();

    if (!client) {
        const cached = cache.get(ck);
        if (cached && cached.expiresAt > now) return cached.val;
    }

    const exec = client ? client.query.bind(client) : db.query;
    const r = await exec(
        `SELECT get_setting($1, $2, $3, $4) AS v`,
        [key, depotId, articleId, JSON.stringify(defaultValue)]
    );
    const v = r.rows[0].v;
    if (!client) cache.set(ck, { val: v, expiresAt: now + TTL_MS });
    return v;
}

/**
 * Récupère plusieurs paramètres en une fois.
 * @param {string[]} keys
 */
async function getMany(keys, opts = {}) {
    const out = {};
    for (const k of keys) {
        out[k] = await get(k, opts);
    }
    return out;
}

/**
 * Définit un paramètre. Invalide le cache pour cette clé.
 *
 * @param {string} scope     - 'company' | 'depot' | 'article'
 * @param {?number} scopeId  - id (null si scope=company)
 * @param {string} key
 * @param {*} value          - sera sérialisé en JSON
 * @param {Object} [opts]
 * @param {number} [opts.userId]
 * @param {string} [opts.description]
 */
async function set(scope, scopeId, key, value, opts = {}) {
    if (!['company', 'depot', 'article'].includes(scope)) {
        throw new ValidationError('scope invalide (company|depot|article)');
    }
    if (scope === 'company' && scopeId !== null && scopeId !== undefined) {
        throw new ValidationError('scope_id doit être null pour scope=company');
    }
    if (scope !== 'company' && !scopeId) {
        throw new ValidationError('scope_id requis pour scope=' + scope);
    }

    // Deux index uniques partiels (cf migration 005) :
    // - uniq_settings_company sur (scope, key) WHERE scope_id IS NULL
    // - uniq_settings_scoped  sur (scope, scope_id, key) WHERE scope_id IS NOT NULL
    const conflictTarget = scope === 'company'
        ? '(scope, key) WHERE scope_id IS NULL'
        : '(scope, scope_id, key) WHERE scope_id IS NOT NULL';

    await db.query(`
        INSERT INTO settings (scope, scope_id, key, value, description, updated_by)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        ON CONFLICT ${conflictTarget} DO UPDATE
        SET value = EXCLUDED.value,
            description = COALESCE(EXCLUDED.description, settings.description),
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
    `, [scope, scope === 'company' ? null : scopeId, key, JSON.stringify(value),
        opts.description || null, opts.userId || null]);

    invalidate(key);
}

/**
 * Supprime un override (revient au niveau parent).
 */
async function unset(scope, scopeId, key) {
    await db.query(
        `DELETE FROM settings WHERE scope = $1 AND scope_id IS NOT DISTINCT FROM $2 AND key = $3`,
        [scope, scope === 'company' ? null : scopeId, key]
    );
    invalidate(key);
}

/**
 * Vide le cache pour une clé donnée (toutes ses combinaisons).
 */
function invalidate(key) {
    for (const ck of cache.keys()) {
        if (ck.startsWith(key + '|')) cache.delete(ck);
    }
}

function clearCache() {
    cache.clear();
}

/**
 * Liste tous les paramètres définis pour un scope donné.
 */
async function listForScope(scope, scopeId) {
    const r = await db.query(
        `SELECT key, value, description, updated_at FROM settings
         WHERE scope = $1 AND scope_id IS NOT DISTINCT FROM $2
         ORDER BY key`,
        [scope, scope === 'company' ? null : scopeId]
    );
    return r.rows;
}

/**
 * Liste tous les overrides effectifs (toutes lignes de settings).
 */
async function listAll() {
    const r = await db.query(`
        SELECT s.scope, s.scope_id, s.key, s.value, s.description, s.updated_at,
               CASE s.scope
                   WHEN 'depot'   THEN (SELECT name FROM depots   WHERE id = s.scope_id)
                   WHEN 'article' THEN (SELECT name FROM articles WHERE id = s.scope_id)
                   ELSE NULL
               END AS scope_label
        FROM settings s
        ORDER BY s.scope, s.scope_id NULLS FIRST, s.key
    `);
    return r.rows;
}

module.exports = {
    get, getMany, set, unset, listForScope, listAll, invalidate, clearCache,
};
