const SurplusLedger = require('../models/SurplusLedger');
const Material = require('../models/Material');
const Product = require('../models/Product');
const mongoose = require('mongoose');

exports.getSurplusReport = async (req, res) => {
    try {
        const surplusEntries = await SurplusLedger.find().sort({ receivedAt: -1 });
        const detailedReport = [];

        for (const entry of surplusEntries) {
            let currentLotQty = 0;
            let found = false;

            // 🟢 ARCHITECT FIX 1: Ensure we are searching with a proper ObjectId
            const searchId = new mongoose.Types.ObjectId(entry.itemId);

            if (entry.itemType === 'Raw Material') {
                const mat = await Material.findById(searchId);
                // 🟢 ARCHITECT FIX 2: Check specifically within mat.stock.batches
                if (mat && mat.stock && mat.stock.batches) {
                    const batch = mat.stock.batches.find(b => b.lotNumber === entry.lotNumber);
                    if (batch) {
                        currentLotQty = batch.qty;
                        found = true;
                    }
                }
            } 
            else if (entry.itemType === 'Finished Good') {
                const prod = await Product.findById(searchId);
                // 🟢 ARCHITECT FIX 3: Finished Goods often have a different structure
                if (prod && prod.stock && prod.stock.batches) {
                    const batch = prod.stock.batches.find(b => b.lotNumber === entry.lotNumber);
                    if (batch) {
                        currentLotQty = batch.qty;
                        found = true;
                    }
                }
            }

            // 🟢 ARCHITECT FIX 4: Use Logic "B" (Surplus stays until main stock is gone)
            // Remaining Surplus = Min(Original Surplus Added, Current Stock in Lot)
            let remainingSurplus = 0;
            if (found) {
                remainingSurplus = Math.min(entry.surplusAdded, currentLotQty);
            }

            detailedReport.push({
                _id: entry._id,
                lotNumber: entry.lotNumber,
                vendorName: entry.vendorName,
                itemName: entry.itemName,
                itemType: entry.itemType,
                orderedQty: entry.orderedQty,
                receivedQty: entry.receivedQty,
                originalSurplus: entry.surplusAdded,
                currentTotalInLot: currentLotQty, // 🎯 If this is 0, the batch ID wasn't found
                remainingSurplus: remainingSurplus,
                receivedAt: entry.receivedAt
            });
        }

        res.json(detailedReport);
    } catch (error) {
        console.error("Surplus Report Error:", error);
        res.status(500).json({ msg: error.message });
    }
};