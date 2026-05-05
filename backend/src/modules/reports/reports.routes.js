'use strict';

const router = require('express').Router();
const ctrl = require('./reports.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/g0', ctrl.g0Register);
router.get('/stats', ctrl.stats);
router.get('/dashboard', ctrl.dashboard);

module.exports = router;
