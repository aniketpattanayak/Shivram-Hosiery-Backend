const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // 🟢 Import the file you just created

const { 
  createOrder, getOrders, 
  getLeads, createLead, updateLeadActivity,
  getClients, createClient,
  updateClient 
} = require('../controllers/salesController');

// Orders
router.post('/orders', auth, createOrder);
router.get('/orders', auth, getOrders);

// Leads
router.get('/leads', auth, getLeads);
router.post('/leads', auth, createLead);
router.put('/leads/:id/activity', auth, updateLeadActivity);

// Clients
// 🟢 The 'auth' here reads Pramod's ID card before showing clients
router.get('/clients', auth, getClients); 
router.post('/clients', auth, createClient);
router.put('/clients/:id', auth, updateClient);

module.exports = router;