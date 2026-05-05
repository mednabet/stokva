'use strict';

const router = require('express').Router();
const db = require('../../db/pool');
const { buildCrud } = require('../../utils/crud');
const { authenticate, requireRole } = require('../../middleware/auth');

const crud = buildCrud({
    table: 'depots',
    columns: [
        'id', 'code', 'name', 'address', 'capacity', 'capacity_unit',
        'manager_id', 'active', 'notes', 'created_at', 'updated_at',
    ],
    required: ['code', 'name'],
    searchColumns: ['name', 'code', 'address'],
    orderBy: 'name ASC',
});

router.use(authenticate);
router.get('/', crud.list);
router.get('/:id', crud.getOne);
router.post('/', requireRole('admin', 'responsable'), crud.create);
router.put('/:id', requireRole('admin', 'responsable'), crud.update);
router.delete('/:id', requireRole('admin'), crud.remove);

// Stock global d'un dépôt
router.get('/:id/stock', async (req, res, next) => {
    try {
        const r = await db.query(`
            SELECT sl.article_id, a.code, a.name, a.unit, a.stock_min,
                   sl.quantity, sl.updated_at
            FROM stock_levels sl
            JOIN articles a ON a.id = sl.article_id
            WHERE sl.depot_id = $1
            ORDER BY a.name
        `, [req.params.id]);
        res.json({ items: r.rows });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
