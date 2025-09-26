const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper function to generate token
const generateToken = (user) => {
  const payload = {
    id: user._id.toString(),
    userId: user._id.toString(),
    _id: user._id.toString(),
    email: user.email,
    roles: user.roles || ['client']
  };
  
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
};

// Register new user
exports.register = async (req, res) => {
  console.log('Register attempt:', req.body.email);
  
  try {
    const { name, email, password, roles } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, email and password are required' 
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }
    
    // Create user (password will be hashed by the User model pre-save hook)
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      roles: roles || ['client']
    });
    
    await user.save();
    
    // Generate token
    const token = generateToken(user);
    
    console.log('User registered successfully:', email);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      token,
      user: {
        _id: user._id,
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Error creating user'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  console.log('Login attempt:', req.body.email);
  
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }
    
    // Find user and explicitly include password field
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Check password using the model method if it exists
    let isValid = false;
    if (user.comparePassword) {
      isValid = await user.comparePassword(password);
    } else {
      // Fallback to direct bcrypt comparison
      isValid = await bcrypt.compare(password, user.password);
    }
    
    if (!isValid) {
      console.log('Invalid password for:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user);
    
    console.log('Login successful:', email);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Error during login'
    });
  }
};

// Logout user (simple implementation)
exports.logout = async (req, res) => {
  // In a JWT system, logout is typically handled client-side
  // by removing the token from storage
  res.json({ 
    success: true,
    message: 'Logged out successfully' 
  });
};

// Request password reset
exports.resetPasswordRequest = async (req, res) => {
  console.log('Password reset request:', req.body.email);
  
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ 
        success: true,
        message: 'If an account exists, reset instructions have been sent.' 
      });
    }
    
    // Generate reset code (6 digits)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save reset code to user
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();
    
    // In production, you would send an email here
    // For now, log the code
    console.log('Reset code for', email, ':', resetCode);
    
    res.json({ 
      success: true,
      message: 'Reset code sent to email',
      // Remove this in production - only for testing
      code: process.env.NODE_ENV === 'development' ? resetCode : undefined
    });
  } catch (error) {
    console.error('Reset password request error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error processing reset request' 
    });
  }
};

// Reset password with code
exports.resetPassword = async (req, res) => {
  console.log('Password reset attempt with token:', req.params.resetToken);
  
  try {
    const { resetToken } = req.params;
    const { password } = req.body;
    
    if (!resetToken || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Reset code and new password are required' 
      });
    }
    
    // Find user with valid reset code
    const user = await User.findOne({
      resetPasswordCode: resetToken,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired reset code' 
      });
    }
    
    // Update password (will be hashed by pre-save hook)
    user.password = password;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    console.log('Password reset successful for:', user.email);
    
    res.json({ 
      success: true,
      message: 'Password updated successfully' 
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating password' 
    });
  }
};

// Get current user (bonus function for testing)
exports.getMe = async (req, res) => {
  try {
    // req.user should be set by auth middleware
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Not authenticated' 
      });
    }
    
    res.json({
      success: true,
      user: {
        _id: req.user._id,
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        roles: req.user.roles
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error fetching user' 
    });
  }
};

// Verify token (for testing)
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
    }
    
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);
    
    res.json({
      success: true,
      message: 'Token is valid',
      decoded
    });
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Invalid token',
      error: error.message
    });
  }
};
