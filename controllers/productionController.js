const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Vendor = require('../models/Vendor');

// @desc    Get All Products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().populate('bom.material').sort({ createdAt: -1 }); 
    res.json(products);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Create New Product
exports.createProduct = async (req, res) => {
  try {
    const { name, sku, category, subCategory, fabricType, color, costPerUnit, sellingPrice, bom } = req.body;
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const productId = `PROD-${name.substring(0,3).toUpperCase()}-${suffix}`;
    const product = await Product.create({
      productId, sku, name, category, subCategory, fabricType, color,         
      costPerUnit: Number(costPerUnit), sellingPrice: Number(sellingPrice), bom, 
      stock: { warehouse: 0, reserved: 0, batches: [] }
    });
    res.status(201).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Delete Product
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

// @desc    Get Pending Plans (Includes Partially Planned)
exports.getPendingPlans = async (req, res) => {
  try {
    // 🟢 Fetch 'Pending Strategy' AND 'Partially Planned'
    const plans = await ProductionPlan.find({ 
      status: { $in: ['Pending Strategy', 'Partially Planned'] } 
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

// @desc    Confirm Strategy (PARTIAL PLANNING ENABLED)
exports.confirmStrategy = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, splits } = req.body; 

    // 1. Fetch Plan
    const plan = await ProductionPlan.findById(planId).populate('product').session(session);
    if (!plan) throw new Error('Production Plan not found');

    // 2. Calculate Limits
    const currentQtyToPlan = splits.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
    const alreadyPlanned = plan.plannedQty || 0;
    const remainingQty = plan.totalQtyToMake - alreadyPlanned;

    // 🟢 VALIDATION: Cannot plan more than pending
    if (currentQtyToPlan > remainingQty) {
        throw new Error(`Invalid Qty: You are trying to plan ${currentQtyToPlan}, but only ${remainingQty} units are remaining.`);
    }

    const createdJobs = [];
    const newJobIds = []; // To store IDs like "JC-IN-1001"

    // 3. Create Job Cards for this Partial Plan
    for (const split of splits) {
      if (split.qty <= 0) continue;

      const mode = split.mode || split.type; 
      let finalVendorId = split.vendorId || null;
      let finalCost = Number(split.unitCost || split.cost) || 0;

      const suffix = Math.floor(1000 + Math.random() * 9000);
      let prefix = mode === 'Full-Buy' ? 'TR-REQ' : 'JC-IN'; 
      if (mode === 'Manufacturing' && split.routing?.cutting?.type === 'Job Work') prefix = 'JC-JW';

      let initialStep = mode === 'Full-Buy' ? 'Procurement_Pending' : 'Material_Pending';
      let typeForDb = mode === 'Full-Buy' ? 'Full-Buy' : (mode === 'Manufacturing' ? 'In-House' : 'Job-Work');

      const jobId = `${prefix}-${suffix}`;
      
      const newJobData = {
        jobId,
        isBatch: false,
        planId: plan._id, 
        orderId: plan.orderId, 
        productId: plan.product._id, 
        totalQty: split.qty, 
        type: typeForDb,
        vendorId: finalVendorId, 
        unitCost: finalCost,        
        status: 'Pending',
        currentStep: initialStep,
        timeline: [{ 
            stage: 'Created', 
            action: `Partial Plan Created (${split.qty})`, 
            timestamp: new Date(), 
            performedBy: 'Admin' 
        }]
      };

      if (mode === 'Manufacturing' && split.routing) {
          newJobData.routing = split.routing;
      }

      const job = await JobCard.create([newJobData], { session });
      createdJobs.push(job[0]);
      newJobIds.push(jobId);
    }

    // 4. Update Production Plan Tracking
    const newPlannedTotal = alreadyPlanned + currentQtyToPlan;
    const isFullyPlanned = newPlannedTotal >= plan.totalQtyToMake;

    // 🟢 Update Fields
    plan.plannedQty = newPlannedTotal;
    plan.status = isFullyPlanned ? 'Scheduled' : 'Partially Planned';
    
    // Push new job IDs to the existing array
    if(newJobIds.length > 0) {
        plan.linkedJobIds.push(...newJobIds);
    }
    
    // Add these splits to history
    splits.forEach(s => plan.splits.push({ 
        qty: s.qty, 
        mode: s.mode || s.type, 
        createdAt: new Date() 
    }));

    await plan.save({ session });

    await session.commitTransaction();
    console.log(`✅ Partial Planning: ${currentQtyToPlan} units planned. Remaining: ${plan.totalQtyToMake - newPlannedTotal}`);
    
    res.json({ 
        success: true, 
        msg: isFullyPlanned ? 'Order Fully Scheduled' : 'Partial Plan Created Successfully', 
        jobs: createdJobs 
    });

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
    res.status(500).json({ msg: error.message });
  }
};