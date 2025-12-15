const express = require('express');
const router = express.Router();
const { createQuotation, getQuotations, getSingleQuotation } = require('../controllers/quotationController');

router.post('/', createQuotation);
router.get('/', getQuotations);
router.get('/:id', getSingleQuotation);

module.exports = router;