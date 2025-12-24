const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gstNumber: { type: String },
  address: { type: String }, // Main Address
  billToAddress: { type: String },
  shipToAddress: { type: String },
  
  // Contact Details
  contactPerson: { type: String },
  contactNumber: { type: String },
  email: { type: String },

  // Commercial Terms
  paymentTerms: { type: String }, // e.g., "30 Days"
  creditLimit: { type: Number, default: 0 }, // Max credit allowed
  creditPeriod: { type: Number, default: 0 }, // Days

  salesPerson: { type: String, required: true }, // Who owns this client?

  // 🟢 NEW: Store Multiple Interested Products
  interestedProducts: [{
    productName: String,
    category: String,
    subCategory: String,
    fabric: String,
    color: String,
    expectedQty: String,
    targetRate: String
  }],

  leadType: { 
    type: String, 
    default: 'Medium', 
    enum: ['High', 'Medium', 'Low'] 
  },
  
  // 🟢 CRM Fields (Status & History)
  status: { 
    type: String, 
    default: 'Active', 
    enum: ['Interested', 'Approach', 'Negotiation', 'Order Won', 'Order Lost', 'Cold Stage', 'Customer', 'Customer', 'Active'] 
  },
  
  // 🟢 UPDATED HISTORY LOG
  activityLog: [{
    updatedBy: { type: String }, // Stores "Admin" or "Pramod"
    status: { type: String },    // Stores snapshot of status
    type: { type: String },      // Call, Visit, Email, Update
    remark: { type: String },
    date: { type: Date, default: Date.now }
  }]

}, { timestamps: true });

module.exports = mongoose.model('Client', ClientSchema);