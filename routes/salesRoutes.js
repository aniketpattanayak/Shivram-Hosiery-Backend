const express = require('express');
const router = express.Router();
const { 
  createOrder, getOrders, 
  getLeads, createLead, updateLeadActivity,
  getClients, createClient,
  updateClient // 🟢 Import the new function
} = require('../controllers/salesController');

// Orders
router.post('/orders', createOrder);
router.get('/orders', getOrders);

// Leads
router.get('/leads', getLeads);
router.post('/leads', createLead);
router.put('/leads/:id/activity', updateLeadActivity);

// Clients
router.get('/clients', getClients);
router.post('/clients', createClient);

// 🟢 NEW ROUTE: This fixes the 404 Error!
router.put('/clients/:id', updateClient);

module.exports = router;