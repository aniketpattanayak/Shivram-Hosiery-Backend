const JobCard = require("../models/JobCard");
const Material = require("../models/Material");
const Product = require("../models/Product");

// @desc    Get Active Job Cards (Shop Floor)
// @route   GET /api/shopfloor
exports.getJobCards = async (req, res) => {
  try {
    const jobs = await JobCard.find({ status: { $ne: "Completed" } })
      .populate("productId")
      .populate("planId")
      .sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ msg: error.message });
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
// @desc    Issue Material (FIFO Logic + Transactional Check)
// @route   POST /api/shopfloor/issue
exports.issueMaterial = async (req, res) => {
  try {
    const { jobId } = req.body;
    
    const job = await JobCard.findOne({ jobId }).populate('productId');
    if (!job) return res.status(404).json({ msg: 'Job Card not found' });
    
    if (job.currentStep !== 'Material_Pending') {
        return res.status(400).json({ msg: 'Material already issued or invalid state' });
    }

    const product = job.productId;
    if (!product?.bom?.length) {
        return res.status(400).json({ msg: 'Product BOM is empty.' });
    }

    // PHASE 1: PRE-CHECK VALIDATION
    const missingItems = []; 

    for (const item of product.bom) {
        const material = await Material.findById(item.material);
        if (!material) {
             return res.status(404).json({ msg: `Material ID ${item.material} not found in DB` });
        }

        const requiredQty = item.qtyRequired * job.totalQty;
        
        if (material.stock.current < requiredQty) {
            missingItems.push(
                `${material.name} (Req: ${requiredQty}, Avail: ${material.stock.current})`
            );
        }
    }

    if (missingItems.length > 0) {
        return res.status(400).json({ 
            msg: `Insufficient Stock for:\n` + missingItems.join('\n') 
        });
    }

    // PHASE 2: EXECUTION
    let pickingList = []; 

    for (const item of product.bom) {
        const material = await Material.findById(item.material);
        const requiredQty = item.qtyRequired * job.totalQty;
        
        if (!material.stock.batches) material.stock.batches = [];
        material.stock.batches.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));

        const updatedBatches = [];
        let qtyToDeduct = requiredQty;
        
        for (const batch of material.stock.batches) {
            if (qtyToDeduct <= 0) {
                updatedBatches.push(batch); 
                continue;
            }

            let consumed = 0;
            if (batch.qty <= qtyToDeduct) {
                consumed = batch.qty;
                qtyToDeduct -= batch.qty; 
            } else {
                consumed = qtyToDeduct;
                batch.qty -= qtyToDeduct; 
                qtyToDeduct = 0;
                updatedBatches.push(batch); 
            }

            if (consumed > 0) {
                pickingList.push({
                    material: material.name,
                    lotNumber: batch.lotNumber,
                    qty: consumed
                });
            }
        }
        
        material.stock.batches = updatedBatches;
        material.stock.current -= requiredQty;
        await material.save();
    }

    job.issuedMaterials = pickingList.map(p => ({
        materialName: p.material,
        lotNumber: p.lotNumber,
        qtyIssued: p.qty
    }));

    job.currentStep = 'Cutting_Started';
    job.status = 'In_Progress';
    
    // 🟢 UPDATED: Push to 'timeline' for the new history modal
    if (!job.timeline) job.timeline = [];
    job.timeline.push({ 
        stage: 'Material Issue', 
        action: 'Fabric Issued',
        vendorName: 'Store Dept',
        details: 'Raw Material Issued from Inventory',
        timestamp: new Date(),
        performedBy: 'Store Manager'
    });

    await job.save();
    
    res.json({ 
        success: true, 
        msg: 'Material Issued Successfully', 
        job,
        pickingList 
    });

  } catch (error) {
    console.error("Issue Error:", error);
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