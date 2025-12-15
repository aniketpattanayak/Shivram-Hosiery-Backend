const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportsController');

router.get('/sales', controller.getSalesReport);
router.get('/production', controller.getProductionReport);
router.get('/inventory', controller.getInventoryReport);

module.exports = router;