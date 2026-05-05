'use strict';

const router = require('express').Router();
const ctrl = require('./transfers.controller');
const { authenticate, requireRole } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('admin', 'responsable', 'operateur'), ctrl.create);
router.post('/:id/send', requireRole('admin', 'responsable', 'operateur'), ctrl.send);
router.post('/:id/receive', requireRole('admin', 'responsable', 'operateur'), ctrl.receive);
router.post('/:id/cancel', requireRole('admin', 'responsable'), ctrl.cancel);

module.exports = router;
