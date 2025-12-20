const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Vendor = require('../models/Vendor'); // 🟢 Required for Vendor Sync

// ==========================================
// 🟢 SECTION 1: PRODUCT MANAGEMENT
// ==========================================

// @desc    Get All Products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().populate('bom.material').sort({ createdAt: -1 }); 
    res.json(products);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Create New Product (with Recipe & Price)
exports.createProduct = async (req, res) => {
  try {
    const { 
        name, sku, category, subCategory, fabricType, color, 
        costPerUnit, sellingPrice, bom 
    } = req.body;
    
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const productId = `PROD-${name.substring(0,3).toUpperCase()}-${suffix}`;

    const product = await Product.create({
      productId,
      sku,           
      name,
      category,
      subCategory,
      fabricType,
      color,         
      costPerUnit: Number(costPerUnit),   
      sellingPrice: Number(sellingPrice), 
      bom, 
      stock: { warehouse: 0, reserved: 0, batches: [] }
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Delete a Product
exports.deleteProduct = async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ msg: 'Product not found' });
  
      await product.deleteOne();
      res.json({ success: true, msg: 'Product removed' });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
};

// ==========================================
// 🟢 SECTION 2: PRODUCTION PLANNING (The Fix for Sync)
// ==========================================

// @desc    Get Pending Production Plans
exports.getPendingPlans = async (req, res) => {
  try {
    const plans = await ProductionPlan.find({ 
      status: 'Pending Strategy' 
    })
      .populate('orderId') 
      .populate('product')
      .sort({ createdAt: -1 });
      
    res.json(plans);
  } catch (error) {
    console.error("Error fetching pending plans:", error);
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Confirm Strategy (FIXED DATA SAVING)
exports.confirmStrategy = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, planIds, splits } = req.body; 

    // 🟢 1. LOG THE DATA (Check your terminal when you click confirm)
    console.log("🔥 DATA RECEIVED FROM FRONTEND:", JSON.stringify(splits, null, 2));

    const isBatch = Array.isArray(planIds) && planIds.length > 0;
    const targetIds = isBatch ? planIds : [planId];

    if (!targetIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
      throw new Error(`Invalid Plan ID format detected.`);
    }

    const plans = await ProductionPlan.find({ _id: { $in: targetIds } }).populate('product').session(session);
    
    if (plans.length !== targetIds.length) {
        throw new Error('One or more Production Plans not found');
    }

    let totalQty = 0;
    let productRef = null;

    for (const plan of plans) {
        if (!plan.product) throw new Error(`Product definition missing for plan ${plan._id}`);
        if (!productRef) productRef = plan.product;
        totalQty += plan.totalQtyToMake;
    }

    const totalSplitQty = splits.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
    if (totalSplitQty !== totalQty) {
        throw new Error(`Total assigned (${totalSplitQty}) does not match required Qty (${totalQty})`);
    }

    const createdJobs = [];

    for (const split of splits) {
      if (split.qty <= 0) continue;

      const mode = split.mode || split.type; 

      // 🟢 2. SIMPLIFIED ASSIGNMENT LOGIC
      // We take whatever the frontend gives us.
      let finalVendorId = split.vendorId || null;
      let finalCost = Number(split.cost) || 0;

      console.log(`🔹 Processing Split: Mode=${mode}, Vendor=${finalVendorId}, Cost=${finalCost}`);

      const suffix = Math.floor(1000 + Math.random() * 9000);
      let prefix = mode === 'Full-Buy' ? 'TR-REQ' : 'JC-IN'; 
      if (mode === 'Manufacturing' && split.routing?.cutting?.type === 'Job Work') prefix = 'JC-JW';

      let initialStep = mode === 'Full-Buy' ? 'Procurement_Pending' : 'Material_Pending';
      let typeForDb = mode === 'Full-Buy' ? 'Full-Buy' : (mode === 'Manufacturing' ? 'In-House' : 'Job-Work');

      const jobId = `${prefix}-${suffix}`;
      
      const newJobData = {
        jobId,
        isBatch: isBatch,
        planId: isBatch ? null : plans[0]._id, 
        orderId: isBatch ? null : plans[0].orderId, 
        batchPlans: isBatch ? targetIds : [], 
        productId: productRef._id, 
        totalQty: split.qty, 
        type: typeForDb,
        
        // 🟢 3. FORCE SAVE VALUES
        vendorId: finalVendorId, 
        unitCost: finalCost,        

        status: 'Pending',
        currentStep: initialStep,
        timeline: [{ 
            stage: 'Created', 
            action: 'Job Card Generated', 
            timestamp: new Date(), 
            performedBy: 'Admin' 
        }]
      };

      if (mode === 'Manufacturing' && split.routing) {
          newJobData.routing = split.routing;
      }

      const job = await JobCard.create([newJobData], { session });
      createdJobs.push(job[0]);
    }

    await ProductionPlan.updateMany(
        { _id: { $in: targetIds } },
        { $set: { status: 'Scheduled', splits: splits } },
        { session }
    );

    await session.commitTransaction();
    console.log("✅ JOB CARDS CREATED SUCCESSFULLY");
    res.json({ success: true, msg: 'Strategy Confirmed', jobs: createdJobs });

  } catch (error) {
    await session.abortTransaction();
    console.error("Strategy Error:", error);
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    Get Active Jobs
exports.getActiveJobs = async (req, res) => {
  try {
    const jobs = await JobCard.find({ currentStep: { $ne: 'QC_Completed' } })
      .populate('productId') 
      .populate({ path: 'planId', populate: { path: 'product' } }) 
      .populate('batchPlans') 
      .sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Delete Plan
exports.deletePlan = async (req, res) => {
  try {
    const result = await ProductionPlan.findByIdAndDelete(req.params.id);
    if (!result) await ProductionPlan.deleteOne({ _id: req.params.id });
    res.json({ success: true, msg: 'Plan deleted' });
  } catch (error) {
    try {
        await ProductionPlan.deleteOne({ _id: req.params.id });
        return res.json({ success: true, msg: 'Plan force deleted' });
    } catch (e) {
        res.status(500).json({ msg: error.message });
    }
  }
};