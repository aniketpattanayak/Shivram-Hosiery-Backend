// backend/routes/procurementRoutes.js
const express = require('express');
const router = express.Router();
const procurementController = require('../controllers/procurementController');
const purchaseController = require('../controllers/purchaseController'); // IMPORTANT: Imports the functions
const controller = require('../controllers/procurementController');

// This is the route for creating the PO (No stock added here)
// POST /api/procurement/purchase
router.post('/purchase', procurementController.createPurchase);

// --- NEW ROUTES FOR RECEIVING STOCK ---

// 1. GET /api/procurement/open-orders 
//    (Frontend uses this to load the list of pending orders)
router.get('/open-orders', purchaseController.getOpenOrders); 

// 2. PUT /api/procurement/receive/:id 
//    (Frontend uses this when you click "Confirm Receipt" - This is where the 404 was)
router.put('/receive/:id', purchaseController.receiveOrder); 
router.get('/trading', controller.getTradingRequests);
router.post('/create-trading-po', controller.createTradingPO);

module.exports = router;