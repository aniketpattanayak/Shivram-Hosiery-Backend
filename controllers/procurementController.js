const Material = require('../models/Material');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder'); 
const JobCard = require('../models/JobCard');

// @desc Process Purchase (Manual - Raw Material or Finished Good)
exports.createPurchase = async (req, res) => {
    try {
        const { vendor, itemId, itemType, qty, unitPrice } = req.body;
        const totalAmount = Number(qty) * Number(unitPrice);
        
        let itemName = 'Unknown Item';
        let fetchedItem = null;

        if (itemType === 'Raw Material') {
            fetchedItem = await Material.findById(itemId);
            if (fetchedItem) itemName = fetchedItem.name;
        } 
        else if (itemType === 'Finished Good') {
            fetchedItem = await Product.findById(itemId);
            if (fetchedItem) itemName = fetchedItem.name; 
        }

        if (!fetchedItem) {
            return res.status(404).json({ msg: 'Item not found' });
        }

        const newPO = await PurchaseOrder.create({
            item_id: itemId,
            vendor_id: vendor,
            itemName: itemName, // <--- This was working fine here
            itemType: itemType,
            orderedQty: Number(qty),
            receivedQty: 0,
            unitPrice: Number(unitPrice),
            status: 'Pending'
        });

        await Vendor.findByIdAndUpdate(vendor, { $inc: { balance: totalAmount } });

        res.status(201).json({ 
            success: true, 
            msg: `Purchase Order Created Successfully.`, 
            order: newPO 
        });

    } catch (error) {
        console.error("Purchase Order Creation Error:", error); 
        res.status(500).json({ msg: `Failed to create PO: ${error.message}` });
    }
};

// @desc    Get Pending Trading Requests (Full-Buy Jobs)
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

// @desc    Create Trading PO from Job Card (THE FIX IS HERE)
exports.createTradingPO = async (req, res) => {
    try {
        const { jobId, vendorId, costPerUnit } = req.body;
        
        // 1. Fetch Job and Populate Product to get the Name
        const job = await JobCard.findById(jobId).populate('productId');
        if (!job) return res.status(404).json({ msg: "Request not found" });

        // 🟢 FIX: Ensure we have a valid name, fallback to 'Unknown' if missing
        const validItemName = job.productId ? job.productId.name : "Unknown Product";

        const po = await PurchaseOrder.create({
            po_id: `PO-TR-${Math.floor(1000 + Math.random() * 9000)}`,
            vendor_id: vendorId,
            item_id: job.productId._id, 
            
            // 🟢 CRITICAL FIX: Save the Name!
            itemName: validItemName, 
            
            itemType: 'Finished Good',  
            orderedQty: job.totalQty,
            receivedQty: 0,
            unitCost: costPerUnit,
            totalAmount: job.totalQty * costPerUnit,
            status: 'Pending',
            expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
        });

        // 2. Update Job Card Status
        job.currentStep = 'PO_Raised';
        job.status = 'In_Progress';
        job.history.push({ step: 'PO Created', status: 'PO_Raised', timestamp: new Date() });
        await job.save();

        // 3. Update Vendor Balance
        await Vendor.findByIdAndUpdate(vendorId, { $inc: { balance: (job.totalQty * costPerUnit) } });

        res.json({ success: true, msg: "Purchase Order Created!", po });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: error.message });
    }
};