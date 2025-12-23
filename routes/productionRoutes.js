const express = require('express');
const router = express.Router();
const { 
  confirmStrategy, 
  getPendingPlans, 
  getActiveJobs,
  getKittingJobs,   // <--- New
  issueMaterials,   // <--- New
  deletePlan 
} = require('../controllers/productionController');

router.get('/pending', getPendingPlans);
router.get('/jobs', getActiveJobs);
router.get('/kitting', getKittingJobs); // <--- Kitting List

router.post('/confirm-strategy', confirmStrategy);
router.post('/kitting/issue', issueMaterials); // <--- Kitting Action

router.delete('/:id', deletePlan); 

module.exports = router;