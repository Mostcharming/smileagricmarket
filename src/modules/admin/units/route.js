const express = require('express');
const router = express.Router();
const Units = require('./controller');

// CRUD for units
router.post('/', Units.createUnit);
router.get('/list', Units.listUnits);
router.get('/:id', Units.getUnit);
router.put('/:id', Units.updateUnit);
router.delete('/:id', Units.deleteUnit);

module.exports = router;
