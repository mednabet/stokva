'use strict';

/**
 * Service de gestion des champs personnalisés.
 *
 * - Lister les définitions de champs pour une entité (reception, expedition, ...)
 * - Valider un objet `custom_data` contre ces définitions
 * - Cache mémoire (TTL 60s)
 */

const db = require('../db/pool');
const { ValidationError } = require('./errors');

const TTL_MS = 60_000;
const cache = new Map(); // entity → { defs, expiresAt }

/**
 * Récupère les définitions actives pour une entité.
 */
async function getDefs(entity) {
    const now = Date.now();
    const cached = cache.get(entity);
    if (cached && cached.expiresAt > now) return cached.defs;

    const r = await db.query(`
        SELECT id, entity, code, label, field_type, required,
               min_value, max_value, min_length, max_length,
               pattern, options, required_when, default_value,
               help_text, display_order
        FROM custom_fields
        WHERE entity = $1 AND active = TRUE
        ORDER BY display_order, id
    `, [entity]);

    cache.set(entity, { defs: r.rows, expiresAt: now + TTL_MS });
    return r.rows;
}

function invalidate(entity) {
    if (entity) cache.delete(entity);
    else cache.clear();
}

/**
 * Valide un objet custom_data contre les définitions de l'entité.
 *
 * @param {string} entity      - 'reception' | 'expedition' | ...
 * @param {Object} data        - { code: value, ... }
 * @param {Object} [context]   - { depot_id, article_id, ... } pour required_when
 * @returns {Object}           - data nettoyé (avec defaults appliqués)
 * @throws {ValidationError}   - si une règle est violée
 */
async function validate(entity, data, context = {}) {
    const defs = await getDefs(entity);
    const out = {};
    const errors = [];

    for (const def of defs) {
        let raw = data ? data[def.code] : undefined;

        // 1) Default si non fourni
        if ((raw === undefined || raw === null || raw === '') && def.default_value !== null) {
            raw = def.default_value;
        }

        // 2) required (statique)
        let isRequired = def.required;
        // 2bis) required_when (conditionnel)
        if (def.required_when) {
            isRequired = isRequired || matchCondition(def.required_when, context);
        }

        if (raw === undefined || raw === null || raw === '') {
            if (isRequired) {
                errors.push({ code: def.code, message: `Champ requis : ${def.label}` });
            }
            continue;
        }

        // 3) Validation par type
        try {
            out[def.code] = validateValue(def, raw);
        } catch (err) {
            errors.push({ code: def.code, message: err.message });
        }
    }

    // Champs inconnus → on les rejette (sécurité)
    const knownCodes = new Set(defs.map((d) => d.code));
    if (data) {
        for (const k of Object.keys(data)) {
            if (!knownCodes.has(k)) {
                errors.push({ code: k, message: `Champ inconnu : ${k}` });
            }
        }
    }

    if (errors.length) {
        throw new ValidationError('Champs personnalisés invalides', errors);
    }
    return out;
}

function validateValue(def, value) {
    const t = def.field_type;

    if (t === 'text') {
        const s = String(value);
        if (def.min_length != null && s.length < def.min_length) throw new Error(`min ${def.min_length} caractères`);
        if (def.max_length != null && s.length > def.max_length) throw new Error(`max ${def.max_length} caractères`);
        if (def.pattern) {
            const re = new RegExp(def.pattern);
            if (!re.test(s)) throw new Error(`format invalide`);
        }
        return s;
    }

    if (t === 'number') {
        const n = Number(value);
        if (Number.isNaN(n)) throw new Error('nombre invalide');
        if (def.min_value != null && n < Number(def.min_value)) throw new Error(`min ${def.min_value}`);
        if (def.max_value != null && n > Number(def.max_value)) throw new Error(`max ${def.max_value}`);
        return n;
    }

    if (t === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === '1' || value === 1) return true;
        if (value === 'false' || value === '0' || value === 0) return false;
        throw new Error('booléen invalide');
    }

    if (t === 'date' || t === 'datetime') {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) throw new Error('date invalide');
        return t === 'date' ? d.toISOString().slice(0, 10) : d.toISOString();
    }

    if (t === 'select') {
        const options = def.options || [];
        if (!options.includes(value)) throw new Error(`valeur hors choix (${options.join('|')})`);
        return value;
    }

    if (t === 'multiselect') {
        if (!Array.isArray(value)) throw new Error('liste attendue');
        const options = def.options || [];
        for (const v of value) {
            if (!options.includes(v)) throw new Error(`valeur hors choix : ${v}`);
        }
        return value;
    }

    throw new Error(`type non supporté : ${t}`);
}

/**
 * Vérifie une condition simple {field: expected} contre le contexte.
 * Si toutes les paires correspondent, la condition est vraie.
 */
function matchCondition(condition, context) {
    if (!condition || typeof condition !== 'object') return false;
    for (const [k, expected] of Object.entries(condition)) {
        if (context[k] !== expected) return false;
    }
    return true;
}

module.exports = { getDefs, invalidate, validate };
