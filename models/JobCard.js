const mongoose = require('mongoose');

const JobCardSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true }, 
  
  // Links
  isBatch: { type: Boolean, default: false },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionPlan' },
  batchPlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductionPlan' }],
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  unitCost: { type: Number, default: 0 },

  type: { 
    type: String, 
    enum: ['In-House', 'Job-Work', 'Full-Buy'], 
    required: true 
  },

  totalQty: { type: Number, required: true },
  
  status: { 
    type: String, 
    enum: [
      'Pending', 'In_Progress', 'Completed', 
      'QC_Pending', 'QC_Passed', 'QC_Failed', 
      'QC_HOLD', 'QC_Rejected'
    ], 
    default: 'Pending' 
  },
  
  currentStep: { 
    type: String, 
    enum: [
      'Material_Pending',     // Kitting Stage
      'Cutting_Pending',      // Next Stage
      'Cutting_Started', 
      'Sewing_Started', 
      'Packaging_Started',
      'QC_Pending', 
      'QC_Completed',
      'Procurement_Pending', 
      'PO_Raised',
      'QC_Review_Needed',
      'Scrapped'
    ],
    default: 'Material_Pending' 
  },

  // KITTING & STORE DATA
  customBOM: [{ 
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' }, 
    materialName: String, 
    unit: String,
    requiredQty: Number 
  }],

  issuedMaterials: [{ 
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialName: String,
    qtyIssued: Number,
    issuedTo: String,   
    issuedBy: String,   
    role: String,     
    remarks: String,
    date: { type: Date, default: Date.now }
  }],

  // QC RESULT DATA 
  qcResult: {
    totalBatchQty: Number,
    sampleSize: Number,
    passedQty: Number,
    rejectedQty: Number,
    defectRate: String,
    inspectorName: String,
    status: String,
    notes: String,
    date: Date
  },

  // 🟢 FIXED ROUTING ENUMS (Allows both "Job Work" and "Job-Work")
  routing: {
    cutting: { 
      type: { type: String, enum: ['In-House', 'Job Work', 'Job-Work'] }, 
      vendorName: String 
    },
    stitching: { 
      type: { type: String, enum: ['In-House', 'Job Work', 'Job-Work'] }, 
      vendorName: String 
    },
    packing: { 
      type: { type: String, enum: ['In-House', 'Job Work', 'Job-Work'] }, 
      vendorName: String 
    }
  },

  timeline: [
    {
      stage: String,
      action: String,
      vendorName: String,
      details: String,
      timestamp: { type: Date, default: Date.now },
      performedBy: String
    }
  ],

  history: [{
    step: String,
    status: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('JobCard', JobCardSchema);