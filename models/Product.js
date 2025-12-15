const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  // System Generated ID
  productId: { type: String, required: true, unique: true },
  
  // User Defined Fields
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true }, // <--- NEW
  
  category: { type: String, required: true },
  subCategory: { type: String },
  fabricType: { type: String },
  color: { type: String }, // <--- NEW
  
  costPerUnit: { type: Number, default: 0 }, // <--- NEW (Mfg Cost)
  sellingPrice: { type: Number, default: 0 }, 
  
  bom: [
    {
      material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
      qtyRequired: { type: Number, required: true }
    }
  ],
  
  stock: {
    warehouse: { type: Number, default: 0 }, // Total Counter
    reserved: { type: Number, default: 0 },
    
    // --- BATCH TRACKING FOR FG ---
    batches: [
        {
            lotNumber: { type: String, required: true }, 
            qty: { type: Number, required: true },
            date: { type: Date, default: Date.now }
        }
    ]
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);