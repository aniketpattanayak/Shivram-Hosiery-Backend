const express = require('express');
const router = express.Router();
const dispatchController = require('../controllers/dispatchController'); // Ensure this path is correct

// @route   POST /api/logistics/dispatch
// @desc    Ship an order (Updates status & transport details)
router.post('/dispatch', dispatchController.shipOrder);

// @route   GET /api/logistics/orders
// @desc    Get orders ready for dispatch (Optional, if you use it)
// router.get('/orders', dispatchController.getDispatchOrders); 

module.exports = router;