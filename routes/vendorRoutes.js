const express = require('express');
const router = express.Router();
const { getVendors, createVendor, deleteVendor } = require('../controllers/vendorController');

router.get('/', getVendors);
router.post('/', createVendor);
router.delete('/:id', deleteVendor); // <--- Add this

module.exports = router;