const express = require('express');
const router = express.Router();

// Import Logic from Inventory Controller
const { 
  issueMaterial, 
  approveQC, 
  getStock, 
  createMaterial 
} = require('../controllers/inventoryController');

// Import Logic from Dispatch Controller
const { 
  shipOrder, 
  getDispatchOrders 
} = require('../controllers/dispatchController');

// --- Routes ---

// 1. Inventory Management
router.get('/stock', getStock);              
router.post('/materials', createMaterial);   
router.post('/issue-material', issueMaterial); 
router.post('/qc-pass', approveQC);          

// 2. Dispatch / Logistics
router.get('/orders', getDispatchOrders);    
router.post('/ship', shipOrder);             

module.exports = router;