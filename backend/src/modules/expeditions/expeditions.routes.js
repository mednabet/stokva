'use strict';

const router = require('express').Router();
const ctrl = require('./expeditions.controller');
const { authenticate, requireRole } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('admin', 'responsable', 'operateur'), ctrl.create);
router.post('/:id/confirm', requireRole('admin', 'responsable', 'operateur'), ctrl.confirm);
router.post('/:id/cancel', requireRole('admin', 'responsable'), ctrl.cancel);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
