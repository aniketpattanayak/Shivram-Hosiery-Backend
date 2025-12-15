const mongoose = require('mongoose');

const ProductionPlanSchema = new mongoose.Schema({
  // --- ADDED THIS FIELD ---
  planId: { type: String, required: true, unique: true }, 

  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  totalQtyToMake: { type: Number, required: true },
  
  status: { 
    type: String, 
    enum: ['Pending Strategy', 'Planned', 'In Progress', 'Completed'], 
    default: 'Pending Strategy' 
  },

  splits: [
    {
      type: { type: String, enum: ['In-House', 'Job-Work', 'Full-Buy'], required: true },
      qty: { type: Number, required: true },
      cost: { type: Number, default: 0 },
      vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
      referenceId: { type: String }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('ProductionPlan', ProductionPlanSchema);