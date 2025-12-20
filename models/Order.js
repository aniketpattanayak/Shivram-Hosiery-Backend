// backend/models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  
  customerName: { type: String, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }, // Changed ref to Client (if you have a Client model) or User
  
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      productName: String,
      qtyOrdered: Number,
      qtyAllocated: Number,
      qtyToProduce: Number,
      
      // 🟢 NEW: Financial Fields
      unitPrice: { type: Number, default: 0 },
      itemTotal: { type: Number, default: 0 } 
    }
  ],

  // 🟢 NEW: Order Total
  grandTotal: { type: Number, default: 0 },

  deliveryDate: Date,
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  
  status: { 
    type: String, 
    enum: ['Pending', 'Production_Queued', 'Ready_Dispatch', 'Dispatched'], 
    default: 'Pending' 
  },

  dispatchDetails: {
      vehicleNo: String,
      trackingId: String,
      dispatchedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);