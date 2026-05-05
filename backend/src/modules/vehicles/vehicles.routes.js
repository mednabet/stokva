'use strict';

const router = require('express').Router();
const { buildCrud } = require('../../utils/crud');
const { authenticate, requireRole } = require('../../middleware/auth');

// Véhicules
const vehiclesCrud = buildCrud({
    table: 'vehicles',
    columns: [
        'id', 'plate', 'brand', 'model', 'tare', 'max_load',
        'default_driver_id', 'partner_id', 'active', 'notes',
        'created_at', 'updated_at',
    ],
    required: ['plate'],
    searchColumns: ['plate', 'brand', 'model'],
    orderBy: 'plate ASC',
});

// Chauffeurs
const driversCrud = buildCrud({
    table: 'drivers',
    columns: [
        'id', 'full_name', 'cin', 'license_number', 'phone', 'active', 'created_at',
    ],
    required: ['full_name'],
    searchColumns: ['full_name', 'cin', 'license_number', 'phone'],
    orderBy: 'full_name ASC',
});

router.use(authenticate);

// IMPORTANT: routes /drivers/* AVANT /:id sinon Express interprète "drivers" comme un id
// Drivers (sous-routes)
router.get('/drivers/list', driversCrud.list);
router.post('/drivers', requireRole('admin', 'responsable'), driversCrud.create);
router.get('/drivers/:id', driversCrud.getOne);
router.put('/drivers/:id', requireRole('admin', 'responsable'), driversCrud.update);
router.delete('/drivers/:id', requireRole('admin'), driversCrud.remove);

// Vehicles (CRUD principal)
router.get('/', vehiclesCrud.list);
router.post('/', requireRole('admin', 'responsable'), vehiclesCrud.create);
router.get('/:id', vehiclesCrud.getOne);
router.put('/:id', requireRole('admin', 'responsable'), vehiclesCrud.update);
router.delete('/:id', requireRole('admin'), vehiclesCrud.remove);

module.exports = router;
