const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  
  customerName: { type: String, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }, 
  
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      productName: String,
      qtyOrdered: Number,
      qtyAllocated: Number,
      qtyToProduce: Number,
      
      // Financial Fields
      unitPrice: { type: Number, default: 0 },
      itemTotal: { type: Number, default: 0 } 
    }
  ],

  // Order Total
  grandTotal: { type: Number, default: 0 },

  deliveryDate: Date,
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  
  status: { 
    type: String, 
    enum: ['Pending', 'Production_Queued', 'Ready_Dispatch', 'Dispatched', 'Partially_Dispatched'], 
    default: 'Pending' 
  },

  // 🟢 UPDATED: Added new logistics fields
  dispatchDetails: {
      vehicleNo: String,
      trackingId: String,
      
      // New Fields for Driver & Packaging
      driverName: String,
      driverPhone: String,
      packagingNote: String, 

      dispatchedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);