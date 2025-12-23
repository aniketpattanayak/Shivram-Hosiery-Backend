const express = require('express');
const router = express.Router();
const Material = require('../models/Material'); // Ensure path is correct
const Vendor = require('../models/Vendor');     // Ensure path is correct

// @route   GET /api/inventory/materials
// @desc    Get simple list of materials for dropdowns
router.get('/materials', async (req, res) => {
    try {
        const materials = await Material.find().select('name unit stock');
        res.json(materials);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
});

// @route   GET /api/procurement/vendors
// @desc    Get simple list of vendors for dropdowns
router.get('/vendors', async (req, res) => {
    try {
        const vendors = await Vendor.find().select('name type');
        res.json(vendors);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
});

module.exports = router;