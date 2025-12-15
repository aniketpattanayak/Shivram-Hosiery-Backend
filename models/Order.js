const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  
  // Keep your existing field
  customerName: { type: String, required: true },

  // 🟢 NEW: Added to support .populate('clientId')
  // This prevents the "Schema hasn't been registered" or "path invalid" errors
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      productName: String,
      qtyOrdered: Number,
      qtyAllocated: Number,
      qtyToProduce: Number
    }
  ],
  deliveryDate: Date,
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  
  status: { 
    type: String, 
    enum: ['Pending', 'Production_Queued', 'Ready_Dispatch', 'Dispatched'], 
    default: 'Pending' 
  },

  // 🟢 NEW: Added to store Transport details so shipOrder() doesn't crash
  dispatchDetails: {
      vehicleNo: String,
      trackingId: String,
      dispatchedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);