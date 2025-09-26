const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  console.log('Login attempt for:', req.body.email);
  
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }
    
    // Find user with error handling
    let user;
    try {
      user = await User.findOne({ email: email.toLowerCase() }).select('+password');
      console.log('User found:', user ? 'Yes' : 'No');
    } catch (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({ 
        success: false,
        message: 'Database connection error' 
      });
    }
    
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Check password with detailed logging
    let isValid;
    try {
      isValid = await bcrypt.compare(password, user.password);
      console.log('Password valid:', isValid);
    } catch (bcryptError) {
      console.error('Bcrypt error:', bcryptError);
      // Try direct comparison as fallback (for testing)
      isValid = (password === user.password);
      console.log('Direct password comparison:', isValid);
    }
    
    if (!isValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token with both formats for compatibility
    const tokenPayload = {
      id: user._id.toString(),
      userId: user._id.toString(), 
      email: user.email,
      roles: user.roles || ['client']
    };
    
    console.log('Token payload:', tokenPayload);
    
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    console.log('Using JWT secret:', secret ? 'From ENV' : 'Default');
    
    const token = jwt.sign(tokenPayload, secret, { expiresIn: '7d' });
    
    console.log('Login successful for:', email);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        roles: user.roles || ['client']
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
