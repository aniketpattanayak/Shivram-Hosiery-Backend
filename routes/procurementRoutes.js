const express = require('express');
const router = express.Router();
const procurementController = require('../controllers/procurementController');
const purchaseController = require('../controllers/purchaseController'); 

// Standard PO
router.post('/purchase', procurementController.createPurchase);

// 🟢 NEW: Direct Stock Entry Routes
router.post('/direct-entry', procurementController.createDirectEntry);
router.get('/direct-entry', procurementController.getDirectHistory);

// Receipt Logic
router.get('/open-orders', purchaseController.getOpenOrders); 
router.put('/receive/:id', purchaseController.receiveOrder); 

// Trading Logic
router.get('/trading', procurementController.getTradingRequests);
router.post('/create-trading-po', procurementController.createTradingPO);

module.exports = router;