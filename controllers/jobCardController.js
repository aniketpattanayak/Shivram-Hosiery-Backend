const JobCard = require("../models/JobCard");
const Material = require("../models/Material");
const Product = require("../models/Product");

// @desc    Get Active Job Cards (Shop Floor)
// @route   GET /api/shopfloor
// @desc    Get Job Cards (Filtered by Vendor if applicable)
// @route   GET /api/shopfloor
// backend/controllers/jobCardController.js

exports.getJobCards = async (req, res) => {
  try {
    let query = {};
    
    // 🟢 SAFE CHECK: Ensure req.user exists before accessing role
    if (!req.user) {
        return res.status(401).json({ msg: "Not authorized, no user data" });
    }

    if (req.user.role === "Vendor") {
      if (!req.user.vendorId) {
        return res.status(403).json({ msg: "Vendor profile not linked to this account." });
      }
      query = { vendorId: req.user.vendorId };
    }

    const jobs = await JobCard.find(query)
      .populate("productId", "name sku color")
      .populate("vendorId", "name")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get Job Cards for the Logged-in Vendor
// @route   GET /api/vendors/my-jobs
exports.getVendorJobs = async (req, res) => {
  try {
    // If Admin, show everything. If Vendor, filter by their vendorId from their user profile.
    const query = req.user.role === "Admin" ? {} : { vendorId: req.user.vendorId };

    const jobs = await JobCard.find(query)
      .populate("productId", "name sku")
      .populate("vendorId", "name")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: "Error loading vendor jobs" });
  }
};

// @desc    Get Jobs Ready for QC
// @route   GET /api/shopfloor/qc
exports.getQCJobs = async (req, res) => {
  try {
    const jobs = await JobCard.find({ currentStep: "QC_Pending" })
      .populate("productId")
      .populate("planId")
      .sort({ updatedAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// ---------------------------------------------------------
// 🛠️ FIXED TRANSACTIONAL ISSUE MATERIAL FUNCTION
// ---------------------------------------------------------
// @route   POST /api/shopfloor/issue
exports.issueMaterial = async (req, res) => {
  try {
    const { jobId } = req.body;
    
    // 1. Find Job and Populate Product BOM
    const job = await JobCard.findOne({ jobId }).populate('productId');
    if (!job) return res.status(404).json({ msg: 'Job Card not found' });
    
    if (job.currentStep !== 'Material_Pending') {
        return res.status(400).json({ msg: 'Material already issued or invalid state' });
    }

    // 2. Identification: Who is the Vendor for the first stage (Cutting)?
    const routingName = job.routing?.cutting?.vendorName || "Internal";
    const assignedVendor = await Vendor.findOne({ name: routingName });
    
    // 🔗 Auto-link the vendorId to the Job Card if found
    if (assignedVendor) {
      job.vendorId = assignedVendor._id;
    }

    // 3. Execution & FIFO Lot Picking (Simplified for clarity)
    let pickingList = [];
    const product = job.productId;

    for (const item of product.bom) {
        const material = await Material.findById(item.material);
        if (!material) continue;

        const requiredQty = item.qtyRequired * job.totalQty;
        
        // FIFO Logic: Deduct from oldest batches first
        if (!material.stock.batches) material.stock.batches = [];
        material.stock.batches.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));

        let remainingToIssue = requiredQty;
        const updatedBatches = [];
        
        for (const batch of material.stock.batches) {
            if (remainingToIssue <= 0) {
                updatedBatches.push(batch);
                continue;
            }

            if (batch.qty <= remainingToIssue) {
                pickingList.push({
                    materialId: material._id,
                    materialName: material.name,
                    lotNumber: batch.lotNumber,
                    qty: batch.qty
                });
                remainingToIssue -= batch.qty;
            } else {
                pickingList.push({
                    materialId: material._id,
                    materialName: material.name,
                    lotNumber: batch.lotNumber,
                    qty: remainingToIssue
                });
                batch.qty -= remainingToIssue;
                remainingToIssue = 0;
                updatedBatches.push(batch);
            }
        }
        
        material.stock.batches = updatedBatches;
        material.stock.current -= requiredQty;
        await material.save();
    }

    // 4. Update Job Card with Handover Data
    job.issuedMaterials = pickingList.map(p => ({
        materialId: p.materialId,
        materialName: p.materialName,
        lotNumber: p.lotNumber, 
        qtyIssued: p.qty,
        issuedBy: req.user.name,
        date: new Date()
    }));

    // Move to next stage
    job.currentStep = 'Cutting_Pending'; 
    job.status = 'In_Progress';
    
    // 🟢 AUDIT TRAIL: Record the Handover
    job.timeline.push({ 
        stage: 'Kitting', 
        action: 'Handover to Vendor',
        vendorName: routingName,
        details: `Materials issued to ${routingName}. Lot Tracking Active.`,
        performedBy: req.user.name
    });

    await job.save();
    
    res.json({ 
        success: true, 
        msg: `Materials handed over to ${routingName} successfully.`,
        job 
    });

  } catch (error) {
    console.error("Issue Error:", error);
    res.status(500).json({ msg: error.message });
  }
};


// @desc    Vendor: Report work done, production qty, and wastage
// @route   POST /api/vendors/dispatch
// @desc    Vendor: Report Work Done & Wastage
// @route   POST /api/vendors/dispatch
exports.dispatchJob = async (req, res) => {
  try {
    const { jobId, actualQty, wastage } = req.body;

    const job = await JobCard.findOne({ jobId: jobId });
    if (!job) return res.status(404).json({ msg: "Job not found" });

    // 🟢 Security: Ensure Rakesh is only updating his own job
    if (req.user.role === 'Vendor' && job.vendorId.toString() !== req.user.vendorId.toString()) {
      return res.status(403).json({ msg: "Unauthorized access to this job" });
    }

    // Capture Vendor's Claim
    job.productionData.vendorDispatch = {
      isReady: true,
      actualQtyProduced: Number(actualQty),
      wastageQty: Number(wastage),
      dispatchDate: new Date()
    };
    
    job.currentStep = 'QC_Pending';
    job.status = 'QC_Pending';

    job.timeline.push({
      stage: 'Vendor Dispatch',
      action: `Vendor reported ${actualQty} pcs ready`,
      details: `Reported Wastage: ${wastage}kg. Awaiting Admin Verification.`,
      performedBy: req.user.name
    });

    await job.save();
    res.json({ success: true, msg: "Production data submitted to Admin." });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Admin: Final Verification & Stock Receipt
// @route   POST /api/shopfloor/receive-v2
// @desc    Admin: Final Verification & New Lot Generation
// @route   POST /api/shopfloor/receive-v2
exports.receiveProcessV2 = async (req, res) => {
  try {
    const { jobId, finalQty, qcStatus, remarks } = req.body;
    const job = await JobCard.findOne({ jobId: jobId });

    if (!job) return res.status(404).json({ msg: "Job not found" });

    // 🟢 1. GENERATE FINISHED GOODS LOT
    // Example: STITCH-9946 (Stage + Job ID suffix)
    const newLot = `FG-${job.jobId.split('-').pop()}`;

    job.productionData.adminReceipt = {
      isReceived: true,
      finalQtyReceived: Number(finalQty),
      newLotNumber: newLot,
      receivedAt: new Date(),
      qcStatus: qcStatus
    };

    // 🟢 2. UPDATE WAREHOUSE STOCK (Accountability)
    if (qcStatus === 'Pass') {
      const product = await Product.findById(job.productId);
      if (product) {
        product.stock.warehouse += Number(finalQty);
        
        // Record where these pieces came from in the Product's history
        if (!product.stock.batches) product.stock.batches = [];
        product.stock.batches.push({
          lotNumber: newLot,
          qty: Number(finalQty),
          date: new Date()
        });
        await product.save();
      }
    }

    job.currentStep = 'QC_Completed';
    job.status = qcStatus === 'Pass' ? 'Completed' : 'QC_HOLD';

    job.timeline.push({
      stage: 'Final Verification',
      action: `Admin verified ${finalQty} units`,
      details: `Finished Goods Lot: ${newLot}. Wastage recorded: ${job.productionData.vendorDispatch.wastageQty}kg`,
      performedBy: req.user.name
    });

    await job.save();
    res.json({ success: true, msg: `Stock updated. Lot ${newLot} created.` });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};


// backend/controllers/jobCardController.js

// @desc    Vendor updates the current production stage
// @route   POST /api/vendors/update-stage
exports.updateJobStage = async (req, res) => {
  try {
      const { jobId, stageResult } = req.body;
      const job = await JobCard.findOne({ jobId });

      if (!job) return res.status(404).json({ msg: "Job card not found" });

      // Logic to progress the 'currentStep' based on vendor action
      if (stageResult === 'Cutting_Completed') {
          job.currentStep = 'Stitching_Pending';
      } else if (stageResult === 'Stitching_Completed') {
          job.currentStep = 'Packaging_Pending';
      }

      // Add to history for Material Accountability
      job.history.push({
          step: stageResult.replace('_', ' '),
          status: job.currentStep,
          timestamp: new Date(),
          note: `Stage updated by ${req.user.name}`
      });

      await job.save();
      res.json({ success: true, msg: "Stage updated successfully", nextStep: job.currentStep });
  } catch (error) {
      console.error("Update Stage Error:", error);
      res.status(500).json({ msg: error.message });
  }
};
// ---------------------------------------------------------
// 🟢 FIXED: RECEIVE PROCESS WITH HISTORY LOGGING
// ---------------------------------------------------------
// @desc    Move Job to Next Stage (Receive Process)
// @route   POST /api/shopfloor/receive
exports.receiveProcess = async (req, res) => {
  try {
    const { jobId, nextStage } = req.body;

    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: "Job not found" });

    // 🟢 1. CALCULATE HISTORY LOG BEFORE MOVING STAGE
    // We check where the job IS right now to know what was just finished.
    let historyLog = {
      stage: '',
      action: 'Completed',
      vendorName: 'In-House',
      timestamp: new Date(),
      details: '',
      performedBy: 'Production Mgr'
    };

    // If currently at Cutting -> We are finishing Cutting
    if (job.currentStep === 'Cutting_Started') {
        historyLog.stage = 'Cutting';
        historyLog.action = 'Cutting Completed';
        historyLog.vendorName = job.routing?.cutting?.vendorName || 'In-House';
        historyLog.details = `Cut Panels Received from ${historyLog.vendorName}`;
    } 
    // If currently at Sewing -> We are finishing Sewing
    else if (job.currentStep === 'Sewing_Started') {
        historyLog.stage = 'Stitching';
        historyLog.action = 'Stitching Completed';
        historyLog.vendorName = job.routing?.stitching?.vendorName || 'In-House';
        historyLog.details = `Garments Received from ${historyLog.vendorName}`;
    }
    // If currently at Packaging -> We are finishing Packaging
    else if (job.currentStep === 'Packaging_Started') {
        historyLog.stage = 'Packaging';
        historyLog.action = 'Packaging Completed';
        historyLog.vendorName = job.routing?.packing?.vendorName || 'In-House';
        historyLog.details = `Packed Goods Ready for QC`;
    }

    // 🟢 2. PUSH TO TIMELINE (New Standard)
    if (historyLog.stage) {
        if (!job.timeline) job.timeline = [];
        job.timeline.push(historyLog);
    }

    // 3. Update Stage
    job.currentStep = nextStage;
    if (nextStage === "QC_Pending") job.status = "QC_Pending";

    await job.save();
    res.json({ success: true, msg: `Moved to ${nextStage}`, job });
    
  } catch (error) {
    console.error("Receive Error:", error);
    res.status(500).json({ msg: error.message });
  }
};