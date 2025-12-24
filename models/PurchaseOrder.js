const mongoose = require('mongoose');

const PurchaseOrderSchema = new mongoose.Schema({
  item_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    refPath: 'itemTypeModel' // Dynamic reference based on itemType
  },
  vendor_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor', 
    required: true 
  },
  itemName: String, 
  itemType: {
    type: String,
    enum: ['Raw Material', 'Finished Good'],
    required: true
  },
  
  // 🟢 NEW: Financials & Flags
  orderedQty: { type: Number, required: true },
  receivedQty: { type: Number, default: 0 }, 
  unitPrice: { type: Number, default: 0 },     // Added
  totalAmount: { type: Number, default: 0 },   // Added
  isDirectEntry: { type: Boolean, default: false }, // To distinguish PO vs Direct

  status: { 
    type: String, 
    enum: ['Pending', 'Partial', 'Completed'], 
    default: 'Pending' 
  },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PurchaseOrder', PurchaseOrderSchema);