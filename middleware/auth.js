const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  // 1. Get token from header (Frontend sends it as 'x-auth-token')
  const token = req.header('x-auth-token');

  // 2. If no token, block access
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // 3. Verify token
  try {
    // This 'secret_key_123' matches your authController.js
    const decoded = jwt.verify(token, 'secret_key_123'); 

    // 4. Find user in DB so we know their Role (Admin vs Sales Man)
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ msg: 'User not found' });
    }

    req.user = user; // 🟢 THIS IS THE KEY! Now req.user.role exists!
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

module.exports = auth;