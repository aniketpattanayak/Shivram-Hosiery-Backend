const JobCard = require('../models/JobCard');
const Product = require('../models/Product');

// @desc    Get Jobs Pending QC
// @route   GET /api/quality/pending
exports.getPendingQC = async (req, res) => {
  try {
    // Fetch jobs that are in production but not completed
    const jobs = await JobCard.find({ 
        currentStep: { $in: ['QC_Pending', 'Sewing_Started', 'Cutting_Started'] }, 
        status: { $ne: 'Completed' }
    })
    .populate('productId') // Essential for getting Product Name
    .populate('planId')    // Essential for Client Name
    .sort({ createdAt: -1 });
    
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Submit QC Result & Auto-Fix Stock
// @route   POST /api/quality/submit
exports.submitQC = async (req, res) => {
  try {
    const { jobId, qtyPassed, qtyRejected, notes } = req.body;

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
    // ⚡️ AUTO-FIX LOGIC (Option 2)
    // ====================================================
    // If SKU is missing, generate one instantly so we can save stock
    if (!product.sku) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        product.sku = `GEN-${product.name.substring(0,3).toUpperCase()}-${randomSuffix}`;
        console.log(`⚠️ Auto-Fixed SKU for ${product.name}: ${product.sku}`);
    }
    
    // Fix price defaults if missing (prevents crashes)
    if (!product.costPerUnit) product.costPerUnit = 0;
    if (!product.sellingPrice) product.sellingPrice = 0;
    // ====================================================

    // 3. Update Finished Goods Stock (Only if items passed)
    if (qtyPassed > 0) {
        product.stock.warehouse += Number(qtyPassed);
        
        // Add Traceability (Optional but good)
        if (!product.stock.batches) product.stock.batches = [];
        product.stock.batches.push({
            lotNumber: `FG-${job.jobId}`, 
            qty: Number(qtyPassed),
            date: new Date()
        });

        // This save() works now because we fixed the SKU above!
        await product.save();
    }

    // 4. Update Job Status
    job.status = 'Completed';
    job.currentStep = 'QC_Completed';
    job.qcResult = {
        passedQty: Number(qtyPassed),
        rejectedQty: Number(qtyRejected),
        notes: notes || '',
        date: new Date()
    };
    
    // Add to History
    if (!job.history) job.history = [];
    job.history.push({ 
        step: 'QC & Completion', 
        status: 'Completed', 
        timestamp: new Date() 
    });

    await job.save();

    res.json({ 
        success: true, 
        msg: `QC Submitted. ${qtyPassed} Units added to Stock.`, 
        job 
    });

  } catch (error) {
    console.error("QC Error:", error);
    res.status(500).json({ msg: error.message });
  }
};