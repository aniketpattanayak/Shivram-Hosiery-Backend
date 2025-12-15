// backend/models/JobCard.js
const mongoose = require('mongoose');

const JobCardSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true }, 
  
  // ... (Batch fields) ...
  isBatch: { type: Boolean, default: false },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionPlan' },
  batchPlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductionPlan' }],
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  
  // 🚨 Type Enum
  type: { 
    type: String, 
    enum: ['In-House', 'Job-Work', 'Full-Buy'], 
    required: true 
  },

  totalQty: { type: Number, required: true },
  
  status: { 
    type: String, 
    enum: ['Pending', 'In_Progress', 'Completed', 'QC_Pending', 'QC_Passed', 'QC_Failed'], 
    default: 'Pending' 
  },
  
  currentStep: { 
    type: String, 
    enum: ['Material_Pending', 'Cutting_Started', 'Sewing_Started', 'QC_Pending', 'QC_Completed','Procurement_Pending', 'PO_Raised'],
    default: 'Material_Pending' 
  },

  // 🚨 NEW FIELD: Store the Picking List Permanently 🚨
  issuedMaterials: [
      {
          materialName: String,
          lotNumber: String, // The specific Lot used
          qtyIssued: Number,
          issuedAt: { type: Date, default: Date.now }
      }
  ],
  
  history: [{
    step: String,
    status: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('JobCard', JobCardSchema);