const JobCard = require('../models/JobCard');
const Product = require('../models/Product');

// @desc    Get Jobs Pending QC
// @route   GET /api/quality/pending
exports.getPendingQC = async (req, res) => {
  try {
    // Fetch jobs that are in production but not completed
    const jobs = await JobCard.find({ 
        currentStep: { $in: ['QC_Pending', 'Sewing_Started', 'Cutting_Started', 'Production_Completed'] }, 
        status: { $ne: 'Completed' }
    })
    .populate('productId', 'name sku currentStock') // Fetch specific fields
    .populate('planId', 'clientName')
    .sort({ createdAt: -1 });
    
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Submit QC Result (Sampling & Rectification Logic)
// @route   POST /api/quality/submit
exports.submitQC = async (req, res) => {
  try {
    // 🟢 NEW INPUTS: sampleSize and qtyRejected are entered by user
    const { jobId, sampleSize, qtyRejected, notes } = req.body;

    // 1. Find the Job
    const job = await JobCard.findOne({ jobId });
    if (!job) return res.status(404).json({ msg: 'Job not found' });

    if (job.status === 'Completed') {
        return res.status(400).json({ msg: 'Job already completed' });
    }

    // 2. Find the Product
    const product = await Product.findById(job.productId);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    // ====================================================
    // 🟢 SAMPLING & INSPECTOR LOGIC
    // ====================================================
    
    // A. Security: Auto-detect Inspector (Cannot be faked)
    // We assume your auth middleware sets req.user
    const inspectorName = req.user ? req.user.name : "Unknown Inspector";
    const inspectorId = req.user ? req.user._id : null;

    // B. Get Totals
    const totalBatchQty = job.targetQuantity || 0; // The "100" pieces
    const sample = Number(sampleSize) || 0;        // The "10" pieces checked
    const rejected = Number(qtyRejected) || 0;     // The "2" pieces failed

    // C. Validation
    if (rejected > sample) {
        return res.status(400).json({ msg: `Error: You cannot reject ${rejected} items if you only inspected ${sample} items.` });
    }

    // D. Calculations (Rectification Strategy)
    // "From 100, 2 are rejected, so 98 are passed"
    const passedQty = totalBatchQty - rejected; 
    
    // Calculate Defect Rate for Analytics (e.g. 2/10 * 100 = 20%)
    const defectRate = sample > 0 ? ((rejected / sample) * 100).toFixed(2) : 0;

    // ====================================================

    // ====================================================
    // ⚡️ AUTO-FIX LOGIC (Stock Safety)
    // ====================================================
    if (!product.sku) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        product.sku = `GEN-${product.name.substring(0,3).toUpperCase()}-${randomSuffix}`;
        console.log(`⚠️ Auto-Fixed SKU for ${product.name}: ${product.sku}`);
    }
    if (!product.costPerUnit) product.costPerUnit = 0;
    if (!product.sellingPrice) product.sellingPrice = 0;
    // ====================================================

    // 3. Update Finished Goods Stock (Add the 98 good ones)
    if (passedQty > 0) {
        product.stock.warehouse += Number(passedQty);
        
        // Add Traceability
        if (!product.stock.batches) product.stock.batches = [];
        product.stock.batches.push({
            lotNumber: `FG-${job.jobId}`, 
            qty: Number(passedQty),
            date: new Date(),
            inspector: inspectorName // Track who approved this stock
        });

        await product.save();
    }

    // 4. Update Job Status with Detailed QC Data
    job.status = 'Completed';
    job.currentStep = 'QC_Completed';
    
    // 🟢 Save the full inspection story
    job.qcResult = {
        totalBatchQty: Number(totalBatchQty),
        sampleSize: Number(sample),
        passedQty: Number(passedQty),
        rejectedQty: Number(rejected),
        defectRate: `${defectRate}%`,
        inspectorName: inspectorName,
        inspectorId: inspectorId,
        notes: notes || '',
        date: new Date()
    };
    
    // Add to History
    if (!job.history) job.history = [];
    job.history.push({ 
        step: 'Quality Control', 
        status: `Completed (Rate: ${defectRate}%)`,
        details: `Inspected by ${inspectorName}. Passed: ${passedQty}, Rejected: ${rejected}`,
        timestamp: new Date() 
    });

    await job.save();

    res.json({ 
        success: true, 
        msg: `QC Submitted by ${inspectorName}. ${passedQty} Units added to Stock. Defect Rate: ${defectRate}%`, 
        job 
    });

  } catch (error) {
    console.error("QC Error:", error);
    res.status(500).json({ msg: error.message });
  }
};