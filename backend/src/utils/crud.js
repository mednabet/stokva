'use strict';

const db = require('../db/pool');
const { NotFoundError, ValidationError } = require('./errors');

/**
 * Build a generic CRUD controller for a table.
 *
 * @param {Object} opts
 * @param {string} opts.table - Table name
 * @param {Array<string>} opts.columns - Columns selectable / writable
 * @param {Array<string>} [opts.required] - Required columns on create
 * @param {Array<string>} [opts.searchColumns] - Columns to use for ?q= search
 * @param {string} [opts.orderBy='id DESC']
 * @param {Function} [opts.transform] - (row) => returned object
 */
function buildCrud(opts) {
    const {
        table,
        columns,
        required = [],
        searchColumns = [],
        orderBy = 'id DESC',
        transform = (row) => row,
    } = opts;

    const colList = columns.join(', ');

    function pick(body) {
        const out = {};
        for (const c of columns) {
            if (Object.prototype.hasOwnProperty.call(body, c)) out[c] = body[c];
        }
        return out;
    }

    async function list(req, res, next) {
        try {
            const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
            const offset = parseInt(req.query.offset || '0', 10);
            const q = req.query.q ? `%${req.query.q}%` : null;
            const active = req.query.active;

            const where = [];
            const params = [];

            if (q && searchColumns.length) {
                const parts = searchColumns.map((c) => {
                    params.push(q);
                    return `${c} ILIKE $${params.length}`;
                });
                where.push('(' + parts.join(' OR ') + ')');
            }
            if (active !== undefined && columns.includes('active')) {
                params.push(active === 'true' || active === '1');
                where.push(`active = $${params.length}`);
            }

            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
            params.push(limit);
            params.push(offset);

            const r = await db.query(
                `SELECT ${colList}, COUNT(*) OVER() AS total_count
                 FROM ${table}
                 ${whereSql}
                 ORDER BY ${orderBy}
                 LIMIT $${params.length - 1} OFFSET $${params.length}`,
                params
            );

            const total = r.rows[0]?.total_count ? parseInt(r.rows[0].total_count, 10) : 0;
            res.json({
                items: r.rows.map((row) => {
                    const { total_count, ...rest } = row;
                    return transform(rest);
                }),
                total,
                limit,
                offset,
            });
        } catch (err) {
            next(err);
        }
    }

    async function getOne(req, res, next) {
        try {
            const r = await db.query(`SELECT ${colList} FROM ${table} WHERE id = $1`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            res.json(transform(r.rows[0]));
        } catch (err) {
            next(err);
        }
    }

    async function create(req, res, next) {
        try {
            const data = pick(req.body);
            for (const f of required) {
                if (data[f] === undefined || data[f] === null || data[f] === '') {
                    throw new ValidationError(`Champ requis : ${f}`);
                }
            }
            const fields = Object.keys(data);
            if (!fields.length) throw new ValidationError('Aucun champ fourni');
            const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
            const r = await db.query(
                `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})
                 RETURNING ${colList}`,
                fields.map((f) => data[f])
            );
            res.status(201).json(transform(r.rows[0]));
        } catch (err) {
            next(err);
        }
    }

    async function update(req, res, next) {
        try {
            const data = pick(req.body);
            const fields = Object.keys(data);
            if (!fields.length) throw new ValidationError('Aucun champ à mettre à jour');
            const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(',');
            const values = fields.map((f) => data[f]);
            values.push(req.params.id);
            const r = await db.query(
                `UPDATE ${table} SET ${sets} WHERE id = $${values.length}
                 RETURNING ${colList}`,
                values
            );
            if (r.rowCount === 0) throw new NotFoundError();
            res.json(transform(r.rows[0]));
        } catch (err) {
            next(err);
        }
    }

    async function remove(req, res, next) {
        try {
            const r = await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
            if (r.rowCount === 0) throw new NotFoundError();
            res.json({ ok: true });
        } catch (err) {
            next(err);
        }
    }

    return { list, getOne, create, update, remove };
}

module.exports = { buildCrud };
