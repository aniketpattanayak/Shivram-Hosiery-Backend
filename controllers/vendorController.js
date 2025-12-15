const Vendor = require('../models/Vendor');

// @desc Get All Vendors
exports.getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ createdAt: -1 });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc Add New Vendor
exports.createVendor = async (req, res) => {
  try {
    const vendor = await Vendor.create(req.body);
    res.status(201).json({ success: true, vendor });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc Delete Vendor
exports.deleteVendor = async (req, res) => {
    try {
      await Vendor.findByIdAndDelete(req.params.id);
      res.json({ success: true, msg: 'Vendor removed' });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  };