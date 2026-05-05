'use strict';

const router = require('express').Router();
const { buildCrud } = require('../../utils/crud');
const { authenticate, requireRole } = require('../../middleware/auth');

const crud = buildCrud({
    table: 'partners',
    columns: [
        'id', 'code', 'name', 'type', 'address', 'city', 'phone', 'email',
        'ice', 'rc', 'if_number', 'contact_person', 'notes', 'active',
        'created_at', 'updated_at',
    ],
    required: ['name', 'type'],
    searchColumns: ['name', 'code', 'ice', 'phone', 'email'],
    orderBy: 'name ASC',
});

router.use(authenticate);
router.get('/', crud.list);
router.get('/:id', crud.getOne);
router.post('/', requireRole('admin', 'responsable'), crud.create);
router.put('/:id', requireRole('admin', 'responsable'), crud.update);
router.delete('/:id', requireRole('admin'), crud.remove);

module.exports = router;
