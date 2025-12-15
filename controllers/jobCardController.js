const JobCard = require("../models/JobCard");
const Material = require("../models/Material");
const Product = require("../models/Product");

// @desc    Get Active Job Cards (Shop Floor)
// @route   GET /api/shopfloor
exports.getJobCards = async (req, res) => {
  try {
    // Fetch all jobs that are not fully completed
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

    // ==================================================
    // 🛑 PHASE 1: PRE-CHECK VALIDATION (Collect ALL Errors)
    // ==================================================
    const missingItems = []; // <--- We store errors here

    for (const item of product.bom) {
        const material = await Material.findById(item.material);
        if (!material) {
             return res.status(404).json({ msg: `Material ID ${item.material} not found in DB` });
        }

        const requiredQty = item.qtyRequired * job.totalQty;
        
        // Instead of stopping, we push to the list
        if (material.stock.current < requiredQty) {
            missingItems.push(
                `${material.name} (Req: ${requiredQty}, Avail: ${material.stock.current})`
            );
        }
    }

    // NOW we check if there were any errors
    if (missingItems.length > 0) {
        return res.status(400).json({ 
            msg: `Insufficient Stock for:\n` + missingItems.join('\n') 
        });
    }

    // ==================================================
    // ✅ PHASE 2: EXECUTION (Deduct & Save)
    // ==================================================
    
    let pickingList = []; 

    for (const item of product.bom) {
        const material = await Material.findById(item.material);
        const requiredQty = item.qtyRequired * job.totalQty;
        
        // FIFO Logic
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

    // 🚨 NEW STEP: Save the Picking List into the Job Card permanently 🚨
    job.issuedMaterials = pickingList.map(p => ({
        materialName: p.material,
        lotNumber: p.lotNumber,
        qtyIssued: p.qty
    }));

    job.currentStep = 'Cutting_Started';
    job.status = 'In_Progress';
    if (!job.history) job.history = [];
    job.history.push({ step: 'Material Issued', status: 'In_Progress', timestamp: new Date() });

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

// @desc    Move Job to Next Stage (Receive Process)
// @route   POST /api/shopfloor/receive
exports.receiveProcess = async (req, res) => {
  try {
    const { jobId, nextStage } = req.body;

    // Using findOne based on the custom ID string "jobId"
    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: "Job not found" });

    job.currentStep = nextStage;

    // If moving to QC, update main status
    if (nextStage === "QC_Pending") job.status = "QC_Pending";

    if (!job.history) job.history = [];
    job.history.push({
      step: nextStage,
      status: job.status,
      timestamp: new Date(),
    });

    await job.save();
    res.json({ success: true, msg: `Moved to ${nextStage}`, job });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};