const Category = require("../models/Category");
const Attribute = require("../models/Attribute");

// --- CATEGORY LOGIC ---
exports.getCategories = async (req, res) => {
  try {
    const cats = await Category.find();
    res.json(cats);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const newCat = await Category.create({ name, subCategories: [] });
    res.json(newCat);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.addSubCategory = async (req, res) => {
  try {
    const { categoryId, subCategory } = req.body;
    const cat = await Category.findById(categoryId);
    if (!cat.subCategories.includes(subCategory)) {
      cat.subCategories.push(subCategory);
      await cat.save();
    }
    res.json(cat);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// --- ATTRIBUTE LOGIC (Color, Fabric, MaterialType, Unit) ---
exports.getAttributes = async (req, res) => {
  try {
    const attrs = await Attribute.find();

    // 🟢 UPDATE: Made this dynamic.
    // It now handles 'materialType', 'unit', 'color', 'fabric' automatically.
    const grouped = {};

    attrs.forEach((a) => {
      // If the list for this type doesn't exist yet, create it
      if (!grouped[a.type]) {
        grouped[a.type] = [];
      }
      grouped[a.type].push(a.value);
    });

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.addAttribute = async (req, res) => {
  try {
    const { type, value } = req.body;
    const newAttr = await Attribute.create({ type, value });
    res.json(newAttr);
  } catch (err) {
    // 🟢 Changed to 400 to help Frontend detect duplicates
    res.status(400).json({ msg: err.message });
  }
};
