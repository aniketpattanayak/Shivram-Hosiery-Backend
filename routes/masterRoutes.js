const express = require('express');
const router = express.Router();
const { 
  getCategories, addCategory, addSubCategory, 
  getAttributes, addAttribute 
} = require('../controllers/masterController');

router.get('/categories', getCategories);
router.post('/categories', addCategory);
router.post('/categories/sub', addSubCategory);

router.get('/attributes', getAttributes);
router.post('/attributes', addAttribute);

module.exports = router;