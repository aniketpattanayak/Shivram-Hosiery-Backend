const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// @desc    Get Pending Production Plans
// @route   GET /api/production/pending
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
}

// @desc    Confirm Strategy (Handles Single & Batch with Hybrid Routing)
// @route   POST /api/production/confirm-strategy
exports.confirmStrategy = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, planIds, splits } = req.body; 

    // 1. Determine if this is a Batch or Single operation
    const isBatch = Array.isArray(planIds) && planIds.length > 0;
    const targetIds = isBatch ? planIds : [planId];

    // Safety Check for Bad IDs
    if (!targetIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
      throw new Error(`Invalid Plan ID format detected.`);
    }

    // 2. Fetch all related plans
    const plans = await ProductionPlan.find({ _id: { $in: targetIds } }).populate('product').session(session);
    
    if (plans.length !== targetIds.length) {
        throw new Error('One or more Production Plans not found');
    }

    // 3. Validation & Aggregation
    let totalQty = 0;
    let productRef = null;

    for (const plan of plans) {
        if (!plan.product) throw new Error(`Product definition missing for plan ${plan._id}`);
        
        // Ensure all plans in a batch are for the same product
        if (!productRef) productRef = plan.product;
        else if (productRef._id.toString() !== plan.product._id.toString()) {
            throw new Error("Cannot batch different products together.");
        }

        totalQty += plan.totalQtyToMake;
    }

    // Validate Total Split Qty vs Required Qty
    const totalSplitQty = splits.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
    if (totalSplitQty !== totalQty) {
        throw new Error(`Total assigned (${totalSplitQty}) does not match required Qty (${totalQty})`);
    }

    const createdJobs = [];

    // 4. Create Job Cards based on Splits
    for (const split of splits) {
      if (split.qty <= 0) continue;

      const mode = split.mode || split.type; 
      if (!mode) throw new Error("Error: Split mode/type is missing.");

      // Generate ID
      const suffix = Math.floor(1000 + Math.random() * 9000);
      let prefix = 'JC-IN'; 
      
      let initialStep = 'Material_Pending';
      let typeForDb = 'In-House'; 

      // Determine Prefix based on Cutting Strategy
      if (mode === 'Manufacturing') {
          if (split.routing?.cutting?.type === 'Job Work') {
              prefix = 'JC-JW';
          }
          typeForDb = 'Job-Work'; 
          if (split.routing?.cutting?.type === 'In-House' && split.routing?.stitching?.type === 'In-House') {
            typeForDb = 'In-House';
          }
      } 
      else if (mode === 'Full-Buy') {
          prefix = 'TR-REQ'; 
          typeForDb = 'Full-Buy';
          initialStep = 'Procurement_Pending'; 
      }

      const jobId = `${prefix}-${suffix}`;

      // 🟢 PREPARE DETAILED HISTORY TEXT (Includes Packaging & Vendors)
      let historyDetails = 'Direct Purchase Request Created';
      
      if (mode === 'Manufacturing') {
          const r = split.routing;
          // Helper to format "Type (Vendor)"
          const fmt = (stage) => {
              const type = r[stage]?.type || 'N/A';
              const vend = r[stage]?.vendorName ? `(${r[stage].vendorName})` : '';
              return `${type} ${vend}`;
          };

          historyDetails = `Production Strategy defined:\n1. Cutting: ${fmt('cutting')}\n2. Stitching: ${fmt('stitching')}\n3. Packing: ${fmt('packing')}`;
      }

      // Create Job Card Object
      const newJobData = {
        jobId,
        isBatch: isBatch,
        planId: isBatch ? null : plans[0]._id, 
        orderId: isBatch ? null : plans[0].orderId, 
        batchPlans: isBatch ? targetIds : [], 
        productId: productRef._id, 
        totalQty: split.qty, 
        
        type: typeForDb,
        status: 'Pending',
        currentStep: initialStep,
        
        // 🟢 FIXED: Timeline now contains full details including Packaging
        timeline: [{ 
            stage: 'Created', 
            action: 'Job Card Generated',
            details: historyDetails,
            timestamp: new Date(), 
            performedBy: 'Admin'
        }]
      };

      // Add Routing Data if Manufacturing
      if (mode === 'Manufacturing' && split.routing) {
          newJobData.routing = {
              cutting: {
                  type: split.routing.cutting.type,
                  vendorName: split.routing.cutting.vendorName
              },
              stitching: {
                  type: split.routing.stitching.type,
                  vendorName: split.routing.stitching.vendorName
              },
              packing: {
                  type: split.routing.packing.type,
                  vendorName: split.routing.packing.vendorName
              }
          };
      }

      const job = await JobCard.create([newJobData], { session });
      createdJobs.push(job[0]);
    }

    // 5. Update Status of ALL original Production Plans
    await ProductionPlan.updateMany(
        { _id: { $in: targetIds } },
        { 
            $set: { 
                status: 'Scheduled',
                splits: splits 
            }
        },
        { session }
    );

    await session.commitTransaction();
    res.json({ success: true, msg: isBatch ? 'Batch Jobs Created' : 'Job Cards Created', jobs: createdJobs });

  } catch (error) {
    await session.abortTransaction();
    console.error("Strategy Error:", error);
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    Get Active Job Cards
// @route   GET /api/production/jobs
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

// @desc    Delete Production Plan
// @route   DELETE /api/production/:id
exports.deletePlan = async (req, res) => {
  try {
    const result = await ProductionPlan.findByIdAndDelete(req.params.id);
    if (!result) {
        await ProductionPlan.deleteOne({ _id: req.params.id });
    }
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