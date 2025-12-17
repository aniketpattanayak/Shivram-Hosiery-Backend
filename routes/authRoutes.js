const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getAllUsers, deleteUser } = require('../controllers/authController');

// Public / Auth
router.post('/register', registerUser);
router.post('/login', loginUser);

// 🟢 NEW: User Management Routes (Protected usually, assuming middleware logic later)
router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);

module.exports = router;