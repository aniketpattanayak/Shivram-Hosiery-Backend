const Product = require('../models/Product');

// @desc    Get All Products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().populate('bom.material').sort({ createdAt: -1 }); 
    res.json(products);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Create New Product (with Recipe & Price)
exports.createProduct = async (req, res) => {
  try {
    // Destructure all fields including NEW ones
    const { 
        name, sku, category, subCategory, fabricType, color, 
        costPerUnit, sellingPrice, bom 
    } = req.body;
    
    // Generate internal System ID
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const productId = `PROD-${name.substring(0,3).toUpperCase()}-${suffix}`;

    const product = await Product.create({
      productId,
      sku,           // <--- Saved
      name,
      category,
      subCategory,
      fabricType,
      color,         // <--- Saved
      costPerUnit: Number(costPerUnit),   // <--- Saved
      sellingPrice: Number(sellingPrice), 
      bom, 
      stock: { warehouse: 0, reserved: 0, batches: [] }
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// @desc    Delete a Product
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