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

  splits: [
    {
      _id: false, // Prevents creating a sub-ID for every split to keep it clean
      qty: { type: Number, required: true },
      
      // 'mode' determines if it is Manufacturing or Buying
      mode: { type: String, enum: ['Manufacturing', 'Full-Buy'], required: true }, 
      
      // 🟢 CRITICAL: Fields for Full-Buy (Trading)
      vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
      cost: { type: Number, default: 0 },

      // Fields for Manufacturing Routing
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