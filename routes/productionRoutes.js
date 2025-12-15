const express = require('express');
const router = express.Router();
const { 
  confirmStrategy, 
  getPendingPlans, 
  getActiveJobs,
  deletePlan // <--- Import this
} = require('../controllers/productionController');

router.get('/pending', getPendingPlans);
router.get('/jobs', getActiveJobs);
router.post('/confirm-strategy', confirmStrategy);
router.delete('/:id', deletePlan); // <--- Add this Route

module.exports = router;