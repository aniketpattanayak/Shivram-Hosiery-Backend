const mongoose = require('mongoose');

const PurchaseOrderSchema = new mongoose.Schema({
  item_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', // Link to your Product/Stock collection
    required: true 
  },
  vendor_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor', 
    required: true 
  },
  itemName: String, // Optional, for easier display
  itemType: {
    type: String,
    enum: ['Raw Material', 'Finished Good'],
    required: true
  },
  orderedQty: { type: Number, required: true },
  receivedQty: { type: Number, default: 0 }, // Starts at 0
  status: { 
    type: String, 
    enum: ['Pending', 'Partial', 'Completed'], 
    default: 'Pending' 
  },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PurchaseOrder', PurchaseOrderSchema);