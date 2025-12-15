const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// @desc    Get Pending Production Plans
// @route   GET /api/production/pending
exports.getPendingPlans = async (req, res) => {
  try {
    // FIX: Only fetch 'Pending Strategy'. 
    // Once we plan it, the status becomes 'In Production', so it will vanish from this list.
    const plans = await ProductionPlan.find({ 
      status: 'Pending Strategy' 
    })
      .populate('orderId') 
      .populate('product')
      .sort({ createdAt: -1 }); // Show newest first
      
    res.json(plans);
  } catch (error) {
    console.error("Error fetching pending plans:", error);
    res.status(500).json({ msg: error.message });
  }
}

// @desc    Confirm Strategy (Handles Single & Batch)
exports.confirmStrategy = async (req, res) => {
  try {
    // We now accept 'planIds' (Array) for batch, OR 'planId' (String) for single
    const { planId, planIds, splits } = req.body; 

    // 1. Determine if this is a Batch or Single operation
    const isBatch = Array.isArray(planIds) && planIds.length > 0;
    const targetIds = isBatch ? planIds : [planId];

    // Safety Check for Bad IDs
    if (!targetIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ msg: `Invalid Plan ID format detected.` });
    }

    // 2. Fetch all related plans
    const plans = await ProductionPlan.find({ _id: { $in: targetIds } }).populate('product');
    
    if (plans.length !== targetIds.length) {
        return res.status(404).json({ msg: 'One or more Production Plans not found' });
    }

    // 3. Validation & Aggregation
    let totalQty = 0;
    let productRef = null;

    for (const plan of plans) {
        if (!plan.product) return res.status(400).json({ msg: `Product definition missing for plan ${plan._id}` });
        
        // Ensure all plans in a batch are for the same product
        if (!productRef) productRef = plan.product;
        else if (productRef._id.toString() !== plan.product._id.toString()) {
            return res.status(400).json({ msg: "Cannot batch different products together." });
        }

        totalQty += plan.totalQtyToMake;
    }

    const createdJobs = [];

    // 4. Create Job Cards based on Splits
    // backend/controllers/productionController.js

// ... inside confirmStrategy function ...

    // 4. Create Job Cards based on Splits
    for (const split of splits) {
      if (!split.type) return res.status(400).json({ msg: "Error: Split type is missing." });
      if (split.qty <= 0) continue;

      const suffix = Math.floor(1000 + Math.random() * 9000);
      
      // Determine Prefix based on Type
      let prefix = 'JC-IN';
      if (split.type === 'Job-Work') prefix = 'JC-JW';
      if (split.type === 'Full-Buy') prefix = 'TR-REQ'; // TR = Trading Request

      const jobId = `${prefix}-${suffix}`;

      // --- LOGIC CHANGE: Redirect Full-Buy to Procurement ---
      let initialStep = 'Material_Pending';
      if (split.type === 'Full-Buy') {
          initialStep = 'Procurement_Pending'; // <--- Goes to Procurement Page
      }

      // Create One Job Card
      const job = await JobCard.create({
        jobId,
        isBatch: isBatch,
        planId: isBatch ? null : plans[0]._id, 
        orderId: isBatch ? null : plans[0].orderId, 
        batchPlans: isBatch ? targetIds : [], 
        productId: productRef._id, 
        totalQty: split.qty, 
        type: split.type,
        status: 'Pending',
        currentStep: initialStep, // <--- Use variable here
        history: [{ step: 'Created', timestamp: new Date(), status: 'Pending' }]
      });
      
      createdJobs.push(job);
    }
// ...

    // 5. Update Status of ALL original Production Plans
    await ProductionPlan.updateMany(
        { _id: { $in: targetIds } },
        { 
            status: 'In Production', 
            splits: splits // Save the split strategy to history
        }
    );

    res.json({ success: true, msg: isBatch ? 'Batch Job Created' : 'Job Card Created', jobs: createdJobs });
  } catch (error) {
    console.error("Strategy Error:", error);
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get Active Job Cards
exports.getActiveJobs = async (req, res) => {
  try {
    const jobs = await JobCard.find({ currentStep: { $ne: 'QC_Completed' } })
      .populate('productId') // CRITICAL: Populate Product directly for Batch Jobs
      .populate({ path: 'planId', populate: { path: 'product' } }) // Populate for Single Jobs (Legacy support)
      .populate('batchPlans') // Populate batch details if needed
      .sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Delete Production Plan (For Cleaning Bad Data)
exports.deletePlan = async (req, res) => {
  try {
    // Try standard delete
    const result = await ProductionPlan.findByIdAndDelete(req.params.id);
    
    // If standard failed (maybe text ID), try generic delete
    if (!result) {
        await ProductionPlan.deleteOne({ _id: req.params.id });
    }
    
    res.json({ success: true, msg: 'Plan deleted' });
  } catch (error) {
    // Force delete even if cast error occurs
    try {
        await ProductionPlan.deleteOne({ _id: req.params.id });
        return res.json({ success: true, msg: 'Plan force deleted' });
    } catch (e) {
        res.status(500).json({ msg: error.message });
    }
  }
};