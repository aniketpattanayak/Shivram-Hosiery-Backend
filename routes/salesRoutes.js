const express = require('express');
const router = express.Router();
const { 
  createOrder, getOrders, 
  getLeads, createLead, updateLeadActivity,
  getClients, createClient
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

module.exports = router;