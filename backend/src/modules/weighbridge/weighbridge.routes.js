'use strict';

const router = require('express').Router();
const ctrl = require('./weighbridge.controller');
const { authenticate, requireRole } = require('../../middleware/auth');

router.use(authenticate);

// Live reading
router.get('/live', ctrl.live);

// IMPORTANT : routes spécifiques avant /:id
router.get('/weighings', ctrl.list);
router.post('/weighings', requireRole('admin', 'responsable', 'operateur'), ctrl.firstPass);
router.post('/weighings/single', requireRole('admin', 'responsable', 'operateur'), ctrl.single);
router.post('/weighings/simple', requireRole('admin', 'responsable', 'operateur'), ctrl.simple);
router.post('/weighings/with-vehicle-tare', requireRole('admin', 'responsable', 'operateur'), ctrl.withVehicleTare);

// /:id en dernier
router.get('/weighings/:id', ctrl.getOne);
router.post('/weighings/:id/second-pass', requireRole('admin', 'responsable', 'operateur'), ctrl.secondPass);
router.post('/weighings/:id/cancel', requireRole('admin', 'responsable'), ctrl.cancel);

module.exports = router;
