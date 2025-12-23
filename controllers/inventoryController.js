const mongoose = require('mongoose');
const Material = require('../models/Material');
const Product = require('../models/Product');
const JobCard = require('../models/JobCard');
const ProductionPlan = require('../models/ProductionPlan');

// @desc    Issue Raw Material (Store -> Floor)
exports.issueMaterial = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { jobId } = req.body;
    const job = await JobCard.findOne({ jobId }).populate('planId').session(session);
    if (!job) throw new Error('Job Card not found');

    const plan = await ProductionPlan.findById(job.planId).populate('product').session(session);
    // Find the specific split strategy for this job
    const jobSplit = plan.splits.find(s => s.referenceId === jobId);
    
    if (!jobSplit) throw new Error('Job split reference not found');

    const qtyToMake = jobSplit.qty;
    const bom = plan.product.bom;

    for (const item of bom) {
      const material = await Material.findById(item.material).session(session);
      if (!material) continue; // Skip if material deleted
      
      const qtyNeeded = item.qtyRequired * qtyToMake;
      material.stock.current -= qtyNeeded;
      material.stock.reserved -= qtyNeeded;
      
      await material.save({ session });
    }

    job.currentStep = 'Cutting_Started';
    job.history.push({ step: 'Material Issued', timestamp: new Date(), status: 'Completed' });
    await job.save({ session });

    await session.commitTransaction();
    res.json({ success: true, msg: 'Material Issued.' });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    QC Approval (Factory -> Finished Goods)
exports.approveQC = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { jobId, qtyPassed, qtyRejected } = req.body;
    const job = await JobCard.findOne({ jobId }).populate('planId').session(session);
    
    job.currentStep = 'QC_Completed';
    job.history.push({ step: 'QC', status: 'Completed', timestamp: new Date(), note: `Passed: ${qtyPassed}` });
    await job.save({ session });

    const plan = await ProductionPlan.findById(job.planId).session(session);
    const product = await Product.findById(plan.product).session(session);

    product.stock.warehouse += qtyPassed; // Add to stock
    await product.save({ session });

    await session.commitTransaction();
    res.json({ success: true, msg: 'QC Approved.' });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    Get Live Stock (For Inventory Page)
exports.getStock = async (req, res) => {
  try {
    const materials = await Material.find().sort({ name: 1 });
    res.json(materials);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Add New Raw Material
exports.addMaterial = async (req, res) => {
  try {
    const { 
      materialId, name, materialType, unit, 
      costPerUnit, reorderLevel, openingStock,
      batchNumber,
      // New Metrics
      avgConsumption, leadTime, safetyStock 
    } = req.body;
    
    // Check for Duplicate ID
    const existing = await Material.findOne({ materialId });
    if (existing) return res.status(400).json({ msg: 'Material ID already exists' });

    // Prepare Batches
    let initialBatches = [];
    if (Number(openingStock) > 0) {
      initialBatches.push({
          lotNumber: batchNumber || "OPENING-STOCK", 
          qty: Number(openingStock),
          addedAt: new Date()
      });
    }

    const material = await Material.create({
      materialId,
      name,
      materialType,
      unit,
      costPerUnit: Number(costPerUnit) || 0,
      
      // Save Metrics
      avgConsumption: Number(avgConsumption) || 0,
      leadTime: Number(leadTime) || 0,
      safetyStock: Number(safetyStock) || 0,

      stock: { 
          current: Number(openingStock) || 0, 
          reserved: 0, 
          reorderLevel: Number(reorderLevel) || 100,
          batches: initialBatches
      }
    });

    res.status(201).json({ success: true, material });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// 🟢 NEW: FORCE RECALCULATION (Fixes the Calculation Discrepancy)
exports.recalculateAll = async (req, res) => {
  try {
    const materials = await Material.find();
    
    // Loop through every material and save it.
    // This triggers the 'pre-save' hook in the Model, applying the new Math.
    for (const mat of materials) {
        await mat.save();
    }

    res.json({ success: true, msg: `Recalculated ${materials.length} items with new formula.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: error.message });
  }
};

// Aliases
exports.createMaterial = exports.addMaterial;
exports.getAllStock = exports.getStock; // Ensure compatibility