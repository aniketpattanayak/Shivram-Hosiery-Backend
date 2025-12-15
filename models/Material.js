const mongoose = require("mongoose");

const MaterialSchema = new mongoose.Schema(
  {
    materialId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    materialType: { type: String, required: true },
    unit: { type: String, required: true },
    costPerUnit: { type: Number, default: 0 },

    // 🟢 NEW INVENTORY METRICS
    avgConsumption: { type: Number, default: 0 }, // e.g., Units per day
    leadTime: { type: Number, default: 0 }, // e.g., Days to arrive
    safetyStock: { type: Number, default: 0 }, // Buffer stock
    stockAtLeast: { type: Number, default: 0 }, // Calculated Minimum Level

    stock: {
      current: { type: Number, default: 0 },
      reserved: { type: Number, default: 0 },
      reorderLevel: { type: Number, default: 100 }, // We can keep this or replace with stockAtLeast

      batches: [
        {
          lotNumber: { type: String, required: true },
          qty: { type: Number, required: true },
          addedAt: { type: Date, default: Date.now },
        },
      ],
    },

    status: { type: String, default: "HEALTHY" },
  },
  { timestamps: true }
);

// 🟢 PRE-SAVE: Auto-Calculate Status based on your NEW Rules
MaterialSchema.pre("save", function (next) {
  // 1. Calculate Stock At Least (Reorder Point)
  // Formula: (Avg Daily Consumption * Lead Time) + Safety Stock
  this.stockAtLeast = this.avgConsumption * this.leadTime + this.safetyStock;

  // 2. Calculate Health % (Current vs Safety Stock)
  // Protect against division by zero
  const buffer = this.safetyStock > 0 ? this.safetyStock : 1;
  const ratio = (this.stock.current / buffer) * 100;

  // 3. Determine Status based on User's % Rules
  if (ratio < 33) {
    this.status = "CRITICAL";
  } else if (ratio >= 33 && ratio < 66) {
    this.status = "MEDIUM";
  } else if (ratio >= 66 && ratio <= 100) {
    this.status = "OPTIMAL";
  } else {
    this.status = "EXCESS";
  }

  if (typeof next === "function") {
    next();
  }
});

module.exports = mongoose.model("Material", MaterialSchema);
