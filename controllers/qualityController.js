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
exports.submitQC = async (req, res) => {
  try {
    const { jobId, sampleSize, qtyRejected, notes } = req.body;

    // 1. Find Job & Product
    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: 'Job not found' });
    if (job.status === 'Completed') return res.status(400).json({ msg: 'Job already completed' });

    const product = await Product.findById(job.productId);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    // 2. Inspector Info
    const inspectorName = req.user ? req.user.name : "Unknown Inspector";

    // 3. Data Validation
    const totalBatchQty = job.totalQty || job.targetQuantity || 0; 
    const sample = Number(sampleSize) || 0;
    const rejected = Number(qtyRejected) || 0;

    if (rejected > sample) {
        return res.status(400).json({ msg: `Error: Rejected (${rejected}) cannot exceed Sample Size (${sample}).` });
    }

    // ====================================================
    // 🟢 THE GATEKEEPER LOGIC (20% RULE)
    // ====================================================

    // A. Calculate Rejection Rate
    const defectRate = sample > 0 ? ((rejected / sample) * 100) : 0;
    const defectRateDisplay = defectRate.toFixed(2);

    // B. Determine Fate based on 20% Threshold
    const isHighFailure = defectRate >= 20;

    // C. Calculate Good Stock (Option A: Subtract rejected from total)
    // Formula: We assume the rejection rate applies to the whole batch OR just subtract specific rejects
    // Your Request: Option A (Total - Rejected Samples)
    const passedQty = totalBatchQty - rejected; 

    if (isHighFailure) {
        // 🔴 STOP! QC HOLD
        job.status = 'QC_HOLD'; // New Status
        job.currentStep = 'QC_Review_Needed';
        
        job.qcResult = {
            totalBatchQty,
            sampleSize: sample,
            passedQty: 0, // Nothing passed yet
            rejectedQty: rejected,
            defectRate: `${defectRateDisplay}%`,
            inspectorName,
            status: 'Held',
            notes: notes || 'High Failure Rate (>20%). Pending Admin Review.',
            date: new Date()
        };

        await job.save();

        return res.json({ 
            success: true, 
            status: 'HELD',
            msg: `⚠️ QC HOLD ACTIVATED! Defect Rate is ${defectRateDisplay}%. Batch is held for Admin Review. Stock NOT added.` 
        });

    } else {
        // 🟢 SAFE. AUTO-APPROVE
        
        // 1. Update Inventory
        if (passedQty > 0) {
            product.stock.warehouse += Number(passedQty);
            if (!product.stock.batches) product.stock.batches = [];
            product.stock.batches.push({
                lotNumber: `FG-${job.jobId}`, 
                qty: Number(passedQty),
                date: new Date(),
                inspector: inspectorName
            });
            await product.save();
        }

        // 2. Update Job
        job.status = 'Completed';
        job.currentStep = 'QC_Completed';
        
        job.qcResult = {
            totalBatchQty,
            sampleSize: sample,
            passedQty,
            rejectedQty: rejected,
            defectRate: `${defectRateDisplay}%`,
            inspectorName,
            status: 'Verified',
            notes: notes || '',
            date: new Date()
        };
        
        // Add to History
        if (!job.history) job.history = [];
        job.history.push({ 
            step: 'Quality Control', 
            status: `Verified (Rate: ${defectRateDisplay}%)`,
            details: `Inspected by ${inspectorName}. Added ${passedQty} to Stock.`,
            timestamp: new Date() 
        });

        await job.save();

        return res.json({ 
            success: true, 
            status: 'VERIFIED',
            msg: `✅ QC Passed! Rate: ${defectRateDisplay}%. ${passedQty} units added to Inventory.` 
        });
    }

  } catch (error) {
    console.error("QC Error:", error);
    res.status(500).json({ msg: error.message });
  }
};

// ... existing imports ...

// @desc    Get All Jobs on QC HOLD (Admin View)
// @route   GET /api/quality/held
exports.getHeldQC = async (req, res) => {
  try {
    const jobs = await JobCard.find({ status: 'QC_HOLD' })
      .populate('productId', 'name sku')
      .sort({ updatedAt: -1 }); // Newest holds first
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Admin Decision: Approve or Reject Held Batch
// @route   POST /api/quality/review
exports.reviewQC = async (req, res) => {
  try {
    const { jobId, decision, adminNotes } = req.body; // decision = 'approve' or 'reject'

    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: 'Job not found' });
    
    const product = await Product.findById(job.productId);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    const adminName = req.user ? req.user.name : "Admin";

    if (decision === 'approve') {
        // 🟢 OPTION 1: FORCE APPROVE
        // We perform the stock addition NOW because it was skipped earlier.
        
        // Recalculate Passed Qty (Total - Rejected)
        // We rely on the data saved in qcResult during the hold
        const passedQty = job.qcResult.passedQty || (job.targetQuantity - job.qcResult.rejectedQty);
        
        if (passedQty > 0) {
            product.stock.warehouse += Number(passedQty);
            
            if (!product.stock.batches) product.stock.batches = [];
            product.stock.batches.push({
                lotNumber: `FG-${job.jobId}-FORCE`, 
                qty: Number(passedQty),
                date: new Date(),
                inspector: `${adminName} (Admin Override)`
            });
            await product.save();
        }

        job.status = 'Completed';
        job.currentStep = 'QC_Completed';
        job.history.push({
            step: 'QC Review',
            status: 'Force Approved',
            details: `Admin ${adminName} overrode QC Hold. Added ${passedQty} units to stock. Note: ${adminNotes}`,
            timestamp: new Date()
        });

        await job.save();
        return res.json({ success: true, msg: `✅ Batch Force Approved. ${passedQty} units added to inventory.` });

    } else if (decision === 'reject') {
        // 🔴 OPTION 2: PERMANENT REJECT
        // No stock is added. The batch is marked as dead.
        
        job.status = 'QC_Rejected';
        job.currentStep = 'Scrapped';
        
        job.history.push({
            step: 'QC Review',
            status: 'Rejected',
            details: `Admin ${adminName} rejected the held batch. 0 units added. Note: ${adminNotes}`,
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