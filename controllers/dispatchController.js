const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan'); // 🟢 Required to update plan

// @desc    Get Orders Ready for Dispatch
exports.getDispatchOrders = async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: 'Dispatched' } })
      .populate('items.product')
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
    const { orderId, transportDetails } = req.body;
    
    // Find Order
    const order = await Order.findOne({ orderId }).session(session);
    if (!order) throw new Error('Order not found');

    for (const item of order.items) {
      const product = await Product.findById(item.product).session(session);
      
      if (product) {
        const qtyShipped = item.qtyOrdered; 

        // 1. Deduct Stock (Simple Reduction)
        // Note: No reservation check. We simply reduce physical stock.
        product.stock.warehouse -= qtyShipped;
        await product.save({ session });

        // 2. UPDATE PRODUCTION PLAN 🟢
        // This is the key logic change. Dispatching satisfies the plan.
        const plan = await ProductionPlan.findOne({ 
            orderId: order._id, 
            product: product._id 
        }).session(session);

        if (plan) {
            // Update dispatched count
            plan.dispatchedQty = (plan.dispatchedQty || 0) + qtyShipped;
            
            // If Planned + Dispatched >= Total, mark as done
            const completed = (plan.plannedQty || 0) + plan.dispatchedQty;
            
            if (completed >= plan.totalQtyToMake) {
                plan.status = 'Fulfilled_By_Stock'; 
            }
            await plan.save({ session });
        }
      }
    }

    order.status = 'Dispatched';
    order.dispatchDetails = {
        ...transportDetails,
        dispatchedAt: new Date()
    };
    
    await order.save({ session });

    await session.commitTransaction();
    res.json({ success: true, msg: 'Order Dispatched & Production Plan Updated.' });

  } catch (error) {
    await session.abortTransaction();
    console.error("Ship Error:", error);
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
  }
};