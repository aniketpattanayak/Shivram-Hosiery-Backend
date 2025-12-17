const express = require('express');
const router = express.Router();
const { 
  confirmStrategy, 
  getPendingPlans, 
  getActiveJobs,
  deletePlan 
} = require('../controllers/productionController');

router.get('/pending', getPendingPlans);
router.get('/jobs', getActiveJobs);
router.post('/confirm-strategy', confirmStrategy);
router.delete('/:id', deletePlan); 

module.exports = router;