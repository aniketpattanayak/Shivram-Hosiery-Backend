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
}, { timestamps: true });

module.exports = mongoose.model('Client', ClientSchema);