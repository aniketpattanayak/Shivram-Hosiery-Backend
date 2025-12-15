// backend/controllers/procurementController.js

const Material = require('../models/Material');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder'); // <--- CRITICAL: Ensure this import is at the top
const JobCard = require('../models/JobCard');

// @desc Process Purchase (CREATES ORDER ONLY - NO STOCK UPDATE)
exports.createPurchase = async (req, res) => {
    try {
        const { vendor, itemId, itemType, qty, unitPrice } = req.body;
        const totalAmount = Number(qty) * Number(unitPrice);
        
        let itemName = 'Unknown Item';
        
        // Try to fetch item name for display in the PO
        if (itemType === 'Raw Material') {
            const material = await Material.findById(itemId);
            if (material) itemName = material.name;
        } else if (itemType === 'Finished Good') {
            const product = await Product.findById(itemId);
            if (product) itemName = product.name;
        }


        // 1. Create the PurchaseOrder record (This is the critical line)
        const newPO = await PurchaseOrder.create({
            item_id: itemId, // Product or Material ID
            vendor_id: vendor,
            itemName: itemName, // Use the fetched name for clarity
            itemType: itemType,
            orderedQty: Number(qty),
            receivedQty: 0, 
            status: 'Pending'
        });

        // 2. Update Vendor Balance (This was the only other required action)
        await Vendor.findByIdAndUpdate(vendor, { $inc: { balance: totalAmount } });

        // NO STOCK UPDATE HERE!

        res.json({ success: true, msg: `Purchase Order ${newPO._id.toString().substring(18)} Created. Awaiting Receipt.` });

    } catch (error) {
        console.error("Purchase Order Creation Error:", error); // Log the error to your console
        res.status(500).json({ msg: `Failed to create Purchase Order: ${error.message}` });
    }
};


// @desc    Get Pending Trading Requests (Full-Buy Jobs)
// @route   GET /api/procurement/trading
exports.getTradingRequests = async (req, res) => {
    try {
        const requests = await JobCard.find({ 
            type: 'Full-Buy', 
            currentStep: 'Procurement_Pending' 
        })
        .populate('productId')
        .sort({ createdAt: -1 });
        
        res.json(requests);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

exports.createTradingPO = async (req, res) => {
    try {
        const { jobId, vendorId, costPerUnit } = req.body;
        
        const job = await JobCard.findById(jobId).populate('productId');
        if (!job) return res.status(404).json({ msg: "Request not found" });

        // 1. Create Purchase Order (Automatically)
        const po = await PurchaseOrder.create({
            po_id: `PO-TR-${Math.floor(1000 + Math.random() * 9000)}`,
            vendor_id: vendorId,
            item_id: job.productId._id, // Linking Product
            itemType: 'Finished Good',  // It's a finished good, not raw material
            orderedQty: job.totalQty,
            receivedQty: 0,
            unitCost: costPerUnit,
            totalAmount: job.totalQty * costPerUnit,
            status: 'Pending',
            expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // +7 Days default
        });

        // 2. Update Job Card Status
        job.currentStep = 'PO_Raised';
        job.status = 'In_Progress';
        job.history.push({ step: 'PO Created', status: 'PO_Raised', timestamp: new Date() });
        await job.save();

        res.json({ success: true, msg: "Purchase Order Created!", po });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: error.message });
    }
};

