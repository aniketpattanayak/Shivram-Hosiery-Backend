const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');

// @desc    Get Orders Ready for Dispatch
exports.getDispatchOrders = async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: 'Dispatched' } })
      .populate('items.product')
      // 🟢 FIX: Use strictPopulate: false to prevent 500 Error if schema field is missing
      .populate({ path: 'clientId', strictPopulate: false }); 
      
    res.json(orders);
  } catch (error) {
    console.error("Dispatch Error:", error); 
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Dispatch Order (Warehouse -> Customer)
exports.shipOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 🟢 Receiving transportDetails which now contains driver info & packing list
    const { orderId, transportDetails } = req.body;
    
    // Find using the readable orderId string (e.g., SO-1234)
    const order = await Order.findOne({ orderId }).session(session);
    if (!order) throw new Error('Order not found');

    // Deduct Stock based on Allocation
    for (const item of order.items) {
      const product = await Product.findById(item.product).session(session);
      
      // Safety check in case product is missing
      if (product) {
        // Deduct from Warehouse and Reserved logic
        // Note: Ensure item.qtyAllocated is populated correctly in your workflow
        const qtyToDeduct = item.qtyAllocated || item.qtyOrdered; 
        
        product.stock.warehouse -= qtyToDeduct; 
        product.stock.reserved -= qtyToDeduct;
        
        await product.save({ session });
      }
    }

    order.status = 'Dispatched';
    
    // 🟢 SAVE DISPATCH DETAILS
    // The spread operator (...) automatically copies vehicleNo, trackingId, driverName, etc.
    order.dispatchDetails = {
        ...transportDetails,
        dispatchedAt: new Date()
    };
    
    await order.save({ session });

    await session.commitTransaction();
    res.json({ success: true, msg: 'Order Dispatched' });
  } catch (error) {
    await session.abortTransaction();
    console.error("Ship Error:", error);
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
  }
};