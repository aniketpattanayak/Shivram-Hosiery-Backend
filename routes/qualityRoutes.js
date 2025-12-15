const express = require('express');
const router = express.Router();
const controller = require('../controllers/qualityController');

// Map the controller functions to URLs
router.get('/pending', controller.getPendingQC);
router.post('/submit', controller.submitQC);

module.exports = router;