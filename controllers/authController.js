const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Ensure bcrypt is imported

const generateToken = (id) => {
  return jwt.sign({ id }, 'secret_key_123', { expiresIn: '30d' });
};

// @desc    Register a new user (Used by Admin Panel)
// @route   POST /api/auth/register
// backend/controllers/authController.js
// backend/controllers/authController.js

exports.registerUser = async (req, res) => {
    try {
      // 🟢 Receive 'permissions' from the frontend
      const { name, email, password, role, permissions } = req.body;
      
      const userExists = await User.findOne({ email });
      if (userExists) return res.status(400).json({ msg: 'User already exists' });
  
      // 🟢 NO MORE HARDCODING. Use the permissions passed from the UI.
      // Default to empty array if nothing was sent.
      const userPermissions = permissions || [];
  
      const user = await User.create({ 
        name, 
        email, 
        password, 
        role,
        permissions: userPermissions // <--- Save exactly what the Admin defined
      });
  
      if (user) {
        res.status(201).json({
          msg: "User created successfully",
          user: {
              _id: user._id,
              name: user.name,
              email: user.email,
              role: user.role,
              permissions: user.permissions
          }
        });
      }
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  };

// @desc    Auth user & get token
// @route   POST /api/auth/login
// Update the loginUser function
// backend/controllers/authController.js

exports.loginUser = async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
  
      if (user && (await user.matchPassword(password))) {
        res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          // 🟢 FIX: Default to [] if permissions doesn't exist in DB
          permissions: user.permissions || [], 
          token: generateToken(user._id)
        });
      } else {
        res.status(401).json({ msg: 'Invalid email or password' });
      }
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  };

// 🟢 NEW: Get All Users (For Admin Settings)
exports.getAllUsers = async (req, res) => {
  try {
    // Return all users sorted by newest, hide passwords
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// 🟢 NEW: Delete User (For Admin Settings)
exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};