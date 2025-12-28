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
    const passedQty = totalBatchQty - rejected; 

    const defectRate = sample > 0 ? ((rejected / sample) * 100) : 0;
    const defectRateDisplay = defectRate.toFixed(2);
    const isHighFailure = defectRate >= 20;

    if (isHighFailure) {
        job.status = 'QC_HOLD'; 
        job.currentStep = 'QC_Review_Needed';
        job.qcResult = {
            totalBatchQty, sampleSize: sample, passedQty: 0, rejectedQty: rejected,
            defectRate: `${defectRateDisplay}%`, inspectorName, status: 'Held',
            notes: notes || 'High Failure Rate (>20%). Pending Admin Review.', date: new Date()
        };
        await job.save();
        return res.json({ success: true, status: 'HELD', msg: `⚠️ QC HOLD! Defect Rate is ${defectRateDisplay}%.` });

    } else {
        // ====================================================
        // 🟢 THE SMART GATE DETECTOR (Breaks the Loop)
        // ====================================================
        
        // We look into the Product's SFG stock to see if this specific Job already created a lot.
        // If it exists, it means Gate 1 (Stitching) is ALREADY DONE.
        const existingSFGLot = product.stock.semiFinished?.find(lot => lot.jobId === job.jobId);
        
        // Also check if the job history already contains an "Assembly QC" entry
        const hasPassedAssembly = job.history?.some(h => h.step === 'Assembly QC');

        if (!existingSFGLot && !hasPassedAssembly) {
            // --- PATH A: ASSEMBLY QC (GATE 1) ---
            const sfgLotId = `SFG-${job.jobId.split('-').pop()}`;
            
            if (!product.stock.semiFinished) product.stock.semiFinished = [];
            product.stock.semiFinished.push({
              lotNumber: sfgLotId,
              qty: Number(passedQty),
              date: new Date(),
              jobId: job.jobId
            });

            job.currentStep = 'Packaging_Pending'; 
            job.status = 'Ready_For_Packing'; 

            job.qcResult = {
                totalBatchQty, sampleSize: sample, passedQty, rejectedQty: rejected,
                defectRate: `${defectRateDisplay}%`, inspectorName, status: 'Verified_SFG',
                notes: notes || 'Stitching Passed. Moved to SFG Storage.', date: new Date()
            };

            if (!job.history) job.history = [];
            job.history.push({ 
                step: 'Assembly QC', 
                status: `SFG Verified (Lot: ${sfgLotId})`,
                details: `Passed Assembly Gate. Sent to Packaging.`,
                timestamp: new Date() 
            });

        } else {
            // --- PATH B: FINAL QC (GATE 2) ---
            if (passedQty > 0) {
                product.stock.warehouse += Number(passedQty);
                if (!product.stock.batches) product.stock.batches = [];
                product.stock.batches.push({
                    lotNumber: `FG-${job.jobId.split('-').pop()}`, 
                    qty: Number(passedQty),
                    date: new Date(),
                    inspector: inspectorName
                });
            }

            // 🛑 CRITICAL: Remove the SFG lot now that it's turned into Finished Goods
            product.stock.semiFinished = product.stock.semiFinished.filter(lot => lot.jobId !== job.jobId);

            job.status = 'Completed';
            job.currentStep = 'QC_Completed';

            job.qcResult = {
                totalBatchQty, sampleSize: sample, passedQty, rejectedQty: rejected,
                defectRate: `${defectRateDisplay}%`, inspectorName, status: 'Verified',
                notes: notes || 'Final QC Passed.', date: new Date()
            };

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

        return res.json({ 
            success: true, 
            status: 'VERIFIED',
            msg: `✅ QC Passed! Next Step: ${job.currentStep.replace('_', ' ')}` 
        });
    }
  } catch (error) {
    console.error("QC Error:", error);
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