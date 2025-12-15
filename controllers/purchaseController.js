const PurchaseOrder = require('../models/PurchaseOrder'); 
const Product = require('../models/Product');
const Material = require('../models/Material');

exports.getOpenOrders = async (req, res) => {
  try {
      const openOrders = await PurchaseOrder.find({ status: { $ne: 'Completed' } })
          .populate('vendor_id', 'name') // Populate the vendor name
          // Note: item_id is challenging because it links to two collections. We'll use the 'itemName' text field for now.
          .sort({ created_at: -1 });
      res.json(openOrders);
  } catch (error) {
      res.status(500).json({ msg: error.message });
  }
};
// This function is called when you click "Receive" in the frontend
// backend/controllers/purchaseController.js

// ... (existing imports and getOpenOrders function) ...

// Corrected receiveOrder function
// backend/controllers/purchaseController.js

// ... (existing imports and getOpenOrders function) ...

// backend/controllers/purchaseController.js

// ... (existing imports and getOpenOrders function) ...

// backend/controllers/purchaseController.js

// ... (imports) ...

exports.receiveOrder = async (req, res) => {
    try {
        const { id } = req.params; 
        // 1. GET LOT NUMBER FROM FRONTEND
        const { qtyReceived, itemType, lotNumber } = req.body; 
        const numericQty = Number(qtyReceived);

        // 2. Validate Order
        const order = await PurchaseOrder.findById(id); 
        if (!order) return res.status(404).json({ msg: "Purchase Order not found" });

        if (order.receivedQty + numericQty > order.orderedQty) {
            return res.status(400).json({ msg: "Cannot receive more than ordered." });
        }
        
        // 3. Update Order Status
        order.receivedQty += numericQty;
        order.status = (order.receivedQty >= order.orderedQty) ? "Completed" : "Partial";
        await order.save();

        // 4. GENERATE BATCH NUMBER (If user left it blank)
        // Format: LOT-[DATE]-[RANDOM]
        const finalLot = lotNumber && lotNumber.trim() !== '' 
            ? lotNumber 
            : `LOT-${new Date().toISOString().split('T')[0]}-${Math.floor(Math.random()*1000)}`;

        // 5. UPDATE INVENTORY & BATCHES
        if (itemType === 'Raw Material') {
            const material = await Material.findById(order.item_id);
            if (material) {
                // A. Update Total Counter
                material.stock.current += numericQty;
                
                // B. Push to Batches Array
                material.stock.batches.push({
                    lotNumber: finalLot,
                    qty: numericQty,
                    addedAt: new Date() // Sets priority for FCFO
                });
                
                await material.save();
            } else {
                 console.warn(`Material not found: ${order.item_id}`);
            }
        } else if (itemType === 'Finished Good') {
            const product = await Product.findById(order.item_id);
            if (product) {
                // A. Update Total Counter
                product.stock.warehouse += numericQty;
                
                // B. Push to Batches Array
                product.stock.batches.push({
                    lotNumber: finalLot,
                    qty: numericQty,
                    date: new Date()
                });
                
                await product.save();
            } else {
                 console.warn(`Product not found: ${order.item_id}`);
            }
        } else {
            console.error("Unknown Item Type:", itemType);
        }
    
        res.status(200).json({ message: "Stock & Batch Updated Successfully", batch: finalLot });

    } catch (error) {
        console.error("Receive Error:", error); 
        res.status(500).json({ error: error.message });
    }
};