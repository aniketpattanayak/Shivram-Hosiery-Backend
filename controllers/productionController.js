const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductionPlan = require('../models/ProductionPlan');
const JobCard = require('../models/JobCard');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material'); // 🟢 Required for Kitting

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

    if (currentQtyToPlan > remainingQty) {
        throw new Error(`Invalid Qty: You are trying to plan ${currentQtyToPlan}, but only ${remainingQty} units are remaining.`);
    }

    const createdJobs = [];
    const newJobIds = []; 

    // 3. Create Job Cards
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
        currentStep: initialStep, // <--- Starts at 'Material_Pending' for Kitting
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

    plan.plannedQty = newPlannedTotal;
    plan.status = isFullyPlanned ? 'Scheduled' : 'Partially Planned';
    
    if(newJobIds.length > 0) {
        plan.linkedJobIds.push(...newJobIds);
    }
    
    splits.forEach(s => plan.splits.push({ 
        qty: s.qty, 
        mode: s.mode || s.type, 
        createdAt: new Date() 
    }));

    await plan.save({ session });

    await session.commitTransaction();
    console.log(`✅ Partial Planning: ${currentQtyToPlan} units planned.`);
    
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


// 🟢 STRICT UPDATE: Hide 'Material_Pending' from Shop Floor
exports.getActiveJobs = async (req, res) => {
  try {
    const jobs = await JobCard.find({ 
        currentStep: { 
            // 🟢 ONLY show steps that happen AFTER Kitting
            $in: [
                'Cutting_Pending', 'Cutting_Started', 'Cutting_Completed',
                'Sewing_Pending', 'Sewing_Started', 'Sewing_Completed',
                'Packaging_Started', 'QC_Pending', 'QC_Review_Needed', 
                'QC_Completed'
            ] 
        } 
    })
      .populate('productId') 
      .populate({ path: 'planId', populate: { path: 'product' } }) 
      .populate('batchPlans') 
      .sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// ... (keep the rest of the file same)

// 🟢 NEW: Get Jobs for Kitting (Material_Pending)
// backend/controllers/productionController.js

// ... (Keep existing imports)

// 🟢 NEW: Get Kitting Jobs (Updated to ensure BOM is fully loaded)
exports.getKittingJobs = async (req, res) => {
  try {
    const jobs = await JobCard.find({ currentStep: 'Material_Pending' })
      .populate('orderId') // Get Order Details
      .populate({
          path: 'productId',
          populate: { path: 'bom.material' } // Deep populate to get stock & batches
      })
      .sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// 🟢 NEW: Issue Materials with LOT MANAGEMENT
exports.issueMaterials = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { jobId, customBOM, materialsToIssue, sendToFloor, issuerName, issuerRole } = req.body;
    
    const job = await JobCard.findOne({ jobId }).session(session);
    if (!job) throw new Error('Job not found');

    // 1. Update Custom BOM
    if (customBOM && customBOM.length > 0) {
        job.customBOM = customBOM; 
    }

    // 2. Process Issues (Inventory Deduction FROM BATCHES)
    if (materialsToIssue && materialsToIssue.length > 0) {
        for (const item of materialsToIssue) {
            const materialDoc = await Material.findById(item.materialId).session(session);
            if (!materialDoc) throw new Error(`Material not found: ${item.materialName}`);

            // 🔴 Check Global Stock
            if (materialDoc.stock.current < item.issueQty) {
                throw new Error(`Insufficient Stock for ${materialDoc.name}. Available: ${materialDoc.stock.current}`);
            }

            // 🔴 DEDUCT FROM SPECIFIC BATCH (If provided) or FIFO
            let remainingToDeduct = Number(item.issueQty);
            let batchInfo = "FIFO"; 

            if (item.lotNumber) {
               // Deduct from specific batch
               const batchIndex = materialDoc.stock.batches.findIndex(b => b.lotNumber === item.lotNumber);
               if (batchIndex > -1) {
                  if(materialDoc.stock.batches[batchIndex].qty >= remainingToDeduct) {
                      materialDoc.stock.batches[batchIndex].qty -= remainingToDeduct;
                      batchInfo = item.lotNumber;
                  } else {
                      throw new Error(`Batch ${item.lotNumber} only has ${materialDoc.stock.batches[batchIndex].qty}, but you tried to issue ${remainingToDeduct}`);
                  }
               }
            } else {
               // FIFO Logic: Deduct from oldest batches first (optional, for now we just deduct global count if no lot selected)
               // You can expand this logic later.
            }

            // Update Global Count
            materialDoc.stock.current -= remainingToDeduct;
            
            // Clean up empty batches
            materialDoc.stock.batches = materialDoc.stock.batches.filter(b => b.qty > 0);

            await materialDoc.save({ session });

            // Log to Job History
            job.issuedMaterials.push({
                materialId: item.materialId,
                materialName: item.materialName,
                qtyIssued: Number(item.issueQty),
                lotNumber: item.lotNumber || "General Stock", // <--- Save Lot Number
                issuedTo: item.issuedTo,
                issuedBy: issuerName || "Store Manager",
                role: issuerRole || "Store",
                remarks: item.remarks,
                date: new Date()
            });
        }
    }

    // 3. Move to Shop Floor (If Requested)
    if (sendToFloor) {
        job.currentStep = 'Cutting_Pending';
        job.history.push({
            step: 'Kitting',
            status: 'Materials Issued',
            details: `Full Materials issued by ${issuerName}. Sent to Cutting Floor.`,
            timestamp: new Date()
        });
    }

    await job.save({ session });
    await session.commitTransaction();

    res.json({ 
        success: true, 
        msg: sendToFloor ? 'Job Sent to Cutting Floor! ✂️' : 'Partial Issue Saved ✅',
        jobId: job.jobId
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Kitting Error:", error);
    res.status(500).json({ msg: error.message });
  } finally {
    session.endSession();
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