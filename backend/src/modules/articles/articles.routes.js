'use strict';

const router = require('express').Router();
const db = require('../../db/pool');
const { buildCrud } = require('../../utils/crud');
const { authenticate, requireRole } = require('../../middleware/auth');

const crud = buildCrud({
    table: 'articles',
    columns: [
        'id', 'code', 'name', 'description', 'unit', 'stock_min', 'unit_price',
        'category', 'active', 'created_at', 'updated_at',
    ],
    required: ['code', 'name'],
    searchColumns: ['name', 'code', 'category'],
    orderBy: 'name ASC',
});

router.use(authenticate);

// IMPORTANT: routes spécifiques AVANT routes paramétriques /:id
// Articles en alerte (stock < stock_min)
router.get('/alerts/low-stock', async (req, res, next) => {
    try {
        const r = await db.query(`
            SELECT a.id, a.code, a.name, a.stock_min, a.unit,
                   COALESCE(SUM(sl.quantity), 0) AS total_stock
            FROM articles a
            LEFT JOIN stock_levels sl ON sl.article_id = a.id
            WHERE a.active = TRUE
            GROUP BY a.id
            HAVING COALESCE(SUM(sl.quantity), 0) < a.stock_min
            ORDER BY (a.stock_min - COALESCE(SUM(sl.quantity), 0)) DESC
        `);
        res.json({ items: r.rows });
    } catch (err) {
        next(err);
    }
});

// Stock par article : tous dépôts confondus
router.get('/:id/stock', async (req, res, next) => {
    try {
        const r = await db.query(
            `SELECT sl.depot_id, d.name AS depot_name, sl.quantity, sl.updated_at
             FROM stock_levels sl
             JOIN depots d ON d.id = sl.depot_id
             WHERE sl.article_id = $1
             ORDER BY d.name`,
            [req.params.id]
        );
        const total = r.rows.reduce((s, row) => s + Number(row.quantity), 0);
        res.json({ total, byDepot: r.rows });
    } catch (err) {
        next(err);
    }
});

// CRUD générique
router.get('/', crud.list);
router.get('/:id', crud.getOne);
router.post('/', requireRole('admin', 'responsable'), crud.create);
router.put('/:id', requireRole('admin', 'responsable'), crud.update);
router.delete('/:id', requireRole('admin'), crud.remove);

module.exports = router;
