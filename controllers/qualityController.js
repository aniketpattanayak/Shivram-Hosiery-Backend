const JobCard = require('../models/JobCard');
const Product = require('../models/Product');

// @desc    Get Jobs Pending QC
// @route   GET /api/quality/pending
exports.getPendingQC = async (req, res) => {
  try {
    const jobs = await JobCard.find({ 
        currentStep: { $in: ['QC_Pending', 'Sewing_Started', 'Cutting_Started', 'Production_Completed'] }, 
        status: { $ne: 'Completed' }
    })
    .populate('productId', 'name sku currentStock') 
    .populate('planId', 'clientName')
    .sort({ createdAt: -1 });
    
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Submit QC Result (The Gatekeeper Logic)
// @route   POST /api/quality/submit

// backend/controllers/qualityController.js

exports.submitQC = async (req, res) => {
  try {
    const { jobId, sampleSize, qtyRejected, notes } = req.body;

    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: 'Job not found' });

    // 🛑 STOP SIGN: Ensure the physical handshake happened 1st
    if (job.logisticsStatus === 'In_Transit') {
      return res.status(400).json({ 
        msg: 'Physical Receipt Required! You must receive these goods on the Shop Floor before performing QC.' 
      });
    }

    const product = await Product.findById(job.productId);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    const inspectorName = req.user ? req.user.name : "Unknown Inspector";
    const totalBatchQty = job.totalQty || 0; 
    const rejected = Number(qtyRejected) || 0;
    const passedQty = totalBatchQty - rejected; 

    // --- Path Logic: Assembly QC (Gate 1) vs Final QC (Gate 2) ---
    const hasPassedAssembly = job.history?.some(h => h.step === 'Assembly QC');

    if (!hasPassedAssembly) {
        // --- GATE 1: ASSEMBLY QC ---
        const sfgLotId = `SFG-${job.jobId.split('-').pop()}`;
        
        product.stock.semiFinished.push({
          lotNumber: sfgLotId,
          qty: Number(passedQty),
          date: new Date(),
          jobId: job.jobId
        });

        job.currentStep = 'Packaging_Pending'; 
        job.status = 'Ready_For_Packing'; 
        job.logisticsStatus = 'At_Source'; // Ready to be issued for Packing

        if (!job.history) job.history = [];
        job.history.push({ 
            step: 'Assembly QC', 
            status: `SFG Verified`,
            details: `Passed Assembly Gate. Moved to Storage.`,
            timestamp: new Date() 
        });

    } else {
        // --- GATE 2: FINAL QC ---
        product.stock.warehouse += Number(passedQty);
        product.stock.batches.push({
            lotNumber: `FG-${job.jobId.split('-').pop()}`, 
            qty: Number(passedQty),
            date: new Date(),
            inspector: inspectorName
        });

        // Remove SFG lot as it is now Finished Goods
        product.stock.semiFinished = product.stock.semiFinished.filter(lot => lot.jobId !== job.jobId);

        job.status = 'Completed';
        job.currentStep = 'QC_Completed';

        if (!job.history) job.history = [];
        job.history.push({ 
            step: 'Final Quality Control', 
            status: `Verified (Final)`,
            details: `Finished Goods moved to Warehouse.`,
            timestamp: new Date() 
        });
    }

    await product.save();
    await job.save();

    res.json({ success: true, msg: `QC Passed! Status: ${job.currentStep}` });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Get All Jobs on QC HOLD (Admin View)
// @route   GET /api/quality/held
exports.getHeldQC = async (req, res) => {
  try {
    const jobs = await JobCard.find({ status: 'QC_HOLD' })
      .populate('productId', 'name sku')
      .sort({ updatedAt: -1 }); 
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Admin Decision: Approve or Reject Held Batch
// @route   POST /api/quality/review
exports.reviewQC = async (req, res) => {
  try {
    const { jobId, decision, adminNotes } = req.body; 

    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: 'Job not found' });
    
    const product = await Product.findById(job.productId);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    const adminName = req.user ? req.user.name : "Admin";

    if (decision === 'approve') {
        const passedQty = job.qcResult.passedQty || (job.totalQty - job.qcResult.rejectedQty);
        
        // Determine if we are overriding an SFG check or a Final FG check based on step
        const isAssemblyOverride = job.currentStep === 'QC_Review_Needed' && job.qcResult.status === 'Held' && !job.productionData?.sfgSource?.lotNumber;
        
        if (passedQty > 0) {
            if (isAssemblyOverride) {
                // To SFG
                const sfgLot = `SFG-${job.jobId.split('-').pop()}-FORCE`;
                product.stock.semiFinished.push({
                    lotNumber: sfgLot,
                    qty: Number(passedQty),
                    date: new Date(),
                    jobId: job.jobId
                });
                job.currentStep = 'Packaging_Pending';
                job.status = 'Ready_For_Packing';
            } else {
                // To Warehouse
                product.stock.warehouse += Number(passedQty);
                product.stock.batches.push({
                    lotNumber: `FG-${job.jobId.split('-').pop()}-FORCE`, 
                    qty: Number(passedQty),
                    date: new Date(),
                    inspector: `${adminName} (Admin Override)`
                });
                job.status = 'Completed';
                job.currentStep = 'QC_Completed';
            }
            await product.save();
        }

        job.history.push({
            step: 'QC Review',
            status: 'Force Approved',
            details: `Admin ${adminName} overrode QC Hold. Note: ${adminNotes}`,
            timestamp: new Date()
        });

        await job.save();
        return res.json({ success: true, msg: `✅ Batch Force Approved.` });

    } else if (decision === 'reject') {
        job.status = 'QC_Rejected';
        job.currentStep = 'Scrapped';
        
        job.history.push({
            step: 'QC Review',
            status: 'Rejected',
            details: `Admin ${adminName} rejected the held batch. Note: ${adminNotes}`,
            timestamp: new Date()
        });

        await job.save();
        return res.json({ success: true, msg: "❌ Batch Rejected. No stock added." });
    }

    res.status(400).json({ msg: "Invalid decision" });

  } catch (error) {
    console.error("QC Review Error:", error);
    res.status(500).json({ msg: error.message });
  }
};