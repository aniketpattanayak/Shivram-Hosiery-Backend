const mongoose = require('mongoose');

const ProductionPlanSchema = new mongoose.Schema({
  planId: { type: String, required: true, unique: true }, 
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  totalQtyToMake: { type: Number, required: true },
  
  status: { 
    type: String, 
    enum: ['Pending Strategy', 'Scheduled', 'In Progress', 'Completed'], 
    default: 'Pending Strategy' 
  },

  // 🟢 IMPORTANT: Ensure this says 'mode', NOT 'type'
  splits: [
    {
      _id: false,
      qty: { type: Number, required: true },
      
      // 👇 This is the field causing the error. It must be 'mode'.
      mode: { type: String, enum: ['Manufacturing', 'Full-Buy'], required: true }, 
      
      // If Full-Buy
      vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
      cost: { type: Number, default: 0 },

      // If Manufacturing
      routing: {
        cutting: { 
          type: { type: String, enum: ['In-House', 'Job Work'], default: 'In-House' },
          vendorName: { type: String, default: '' }
        },
        stitching: { 
          type: { type: String, enum: ['In-House', 'Job Work'], default: 'In-House' },
          vendorName: { type: String, default: '' }
        },
        packing: { 
          type: { type: String, enum: ['In-House', 'Job Work'], default: 'In-House' },
          vendorName: { type: String, default: '' }
        }
      }
    }
  ],

  batchNumber: String,
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ProductionPlan', ProductionPlanSchema);