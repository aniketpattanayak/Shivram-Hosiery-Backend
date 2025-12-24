const express = require('express');
const router = express.Router();
const procurementController = require('../controllers/procurementController');
const purchaseController = require('../controllers/purchaseController'); 

// Standard PO
router.post('/purchase', procurementController.createPurchase);
router.post('/direct-entry', procurementController.createDirectEntry);
router.get('/direct-entry', procurementController.getDirectHistory);

// Receipt Logic
router.get('/open-orders', purchaseController.getOpenOrders); 

// 🟢 NEW: Add this line here to connect the Admin Page!
router.get('/qc-review-list', purchaseController.getQCReviewList); 

router.get('/received-history', purchaseController.getCompletedHistory);
router.put('/receive/:id', purchaseController.receiveOrder); 

// Trading Logic
router.get('/trading', procurementController.getTradingRequests);
router.post('/create-trading-po', procurementController.createTradingPO);
// 🟢 NEW: Add this line to fix the 404 on button click
router.post('/qc-decision', purchaseController.processQCDecision);
module.exports = router;