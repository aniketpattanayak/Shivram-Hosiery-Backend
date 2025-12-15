// backend/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobCardController = require('../controllers/jobCardController');

// 1. Get Active Shop Floor Jobs
router.get('/', jobCardController.getJobCards); 

// 2. Get Jobs Ready for QC
router.get('/qc', jobCardController.getQCJobs);

// 3. Actions
router.post('/issue', jobCardController.issueMaterial);
router.post('/receive', jobCardController.receiveProcess); // Ensure this function exists in controller

module.exports = router;