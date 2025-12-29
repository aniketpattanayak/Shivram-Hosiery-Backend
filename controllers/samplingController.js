const Sample = require('../models/Sample');
const Product = require('../models/Product');
const Material = require('../models/Material');

// @desc    Get All Samples
// @route   GET /api/sampling
exports.getSamples = async (req, res) => {
  try {
    const samples = await Sample.find()
      .populate('bom.material')
      .populate('originalProductId')
      .sort({ createdAt: -1 });
    res.json(samples);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Create New Sample (Handles Both Types)
// @route   POST /api/sampling
// backend/controllers/samplingController.js

// backend/controllers/samplingController.js

exports.createSample = async (req, res) => {
    try {
      let { 
          name, type, originalProductId, client, description, manualBom,
          category, subCategory, fabricType, color 
      } = req.body;
      
      // 🚨 FIX: Convert empty string to null so Mongoose doesn't crash
      if (originalProductId === "") {
          originalProductId = null;
      }
  
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const sampleId = `SMP-${suffix}`;
  
      let finalBom = [];
  
      // Logic: If Existing Product, copy its BOM.
      if (type === 'Existing Product' && originalProductId) {
          const product = await Product.findById(originalProductId);
          if (product && product.bom) {
              finalBom = product.bom.map(item => ({
                  material: item.material,
                  qtyRequired: item.qtyRequired,
                  notes: 'Copied from Master'
              }));
          }
      } else {
          finalBom = manualBom || [];
      }
  
      const newSample = await Sample.create({
          sampleId, name, type, originalProductId, client, description, 
          bom: finalBom,
          category, subCategory, fabricType, color 
      });
  
      res.status(201).json(newSample);
    } catch (error) {
      console.error(error); // Add this to see errors in terminal
      res.status(500).json({ msg: error.message });
    }
  };
  // ... (keep other functions like issueSampleStock same)

// @desc    Issue Material (Deduct from Main Inventory)
// @route   POST /api/sampling/issue
exports.issueSampleStock = async (req, res) => {
  try {
    const { sampleId } = req.body;
    const sample = await Sample.findById(sampleId).populate('bom.material');
    if (!sample) return res.status(404).json({ msg: 'Sample not found' });
    if (sample.materialsIssued) return res.status(400).json({ msg: 'Materials already issued' });

    // Deduct Stock
    for (const item of sample.bom) {
        const material = await Material.findById(item.material._id);
        if (material.stock.current < item.qtyRequired) {
            return res.status(400).json({ msg: `Insufficient Stock: ${material.name}` });
        }
        material.stock.current -= item.qtyRequired;
        await material.save();
    }

    sample.materialsIssued = true;
    sample.status = 'Cutting'; // Auto-move to next stage
    await sample.save();

    res.json({ success: true, msg: 'Materials Issued for Sample' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Move Kanban Stage
// @route   PUT /api/sampling/status
exports.updateStatus = async (req, res) => {
  try {
    const { sampleId, status, remarks } = req.body;
    // 🟢 FIXED: Now updating both status AND remarks
    const sample = await Sample.findByIdAndUpdate(
      sampleId, 
      { status, remarks }, 
      { new: true }
    );
    if (!sample) return res.status(404).json({ msg: "Sample not found" });
    res.json(sample);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Approve & Convert to Product Master
// @route   POST /api/sampling/convert
exports.convertToProduct = async (req, res) => {
  try {
    const { sampleId, finalPrice } = req.body;
    const sample = await Sample.findById(sampleId);
    
    if (!sample) return res.status(404).json({ msg: 'Sample not found' });
    if (sample.approvalStatus === 'Approved') return res.status(400).json({ msg: 'Already converted' });

    // Create New Product in Master
    const newProduct = await Product.create({
        name: sample.name,
        sku: `PROD-${sample.sampleId}`, // Link SKU to Sample ID
        category: 'Apparel', // Default, can be edited later
        costPerUnit: 0, // Should be calculated
        sellingPrice: finalPrice || 0,
        stock: { warehouse: 0, shopFloor: 0 },
        bom: sample.bom // Carry over the final R&D BOM
    });

    // Update Sample
    sample.approvalStatus = 'Approved';
    sample.convertedProductId = newProduct._id;
    sample.status = 'Approved';
    await sample.save();

    res.json({ success: true, msg: 'Sample Converted to Product Master!', product: newProduct });

  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};