// Src/controllers/authController.js - FIXED (NO DOUBLE HASHING)
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================
// REGISTER - LET PRE-SAVE HOOK HANDLE HASHING
// ============================================
exports.register = async (req, res) => {
    try {
        const { name, email, password, roles, gymId } = req.body;
        
        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Name, email, and password are required' 
            });
        }
        
        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                message: 'Password must be at least 6 characters long' 
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
        
        console.log('📝 Creating user with PLAIN password (pre-save hook will hash)');
        
        // ✅ PASS PLAIN PASSWORD - Let pre-save hook hash it
        const user = new User({
            name,
            email: email.toLowerCase(),
            password: password,  // ✅ PLAIN PASSWORD - pre-save will hash
            roles: roles || ['client'],
            gymId: gymId || null,
            wearableConnections: []
        });

        await user.save();  // ✅ Pre-save hook hashes password here
        
        console.log('✅ User created:', user.email);
        
        // Generate token
        const token = jwt.sign(
            { id: user._id, roles: user.roles },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                roles: user.roles,
                gymId: user.gymId
            }
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during registration', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ============================================
// LOGIN - NO CHANGES NEEDED
// ============================================
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Email and password are required' 
            });
        }
        
        console.log(`🔐 Login attempt for: ${email}`);
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            console.log(`❌ User not found: ${email}`);
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }
        
        console.log(`✅ User found, checking password...`);
        
        // Compare plain password with hashed password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            console.log(`❌ Invalid password for: ${email}`);
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }
        
        console.log(`✅ Password valid for: ${email}`);
        
        user.lastLogin = new Date();
        await user.save();
        
        const token = jwt.sign(
            { id: user._id, roles: user.roles },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                roles: user.roles,
                gymId: user.gymId
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during login',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ============================================
// CHANGE PASSWORD - FIXED (NO DOUBLE HASHING)
// ============================================
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false,
                message: 'Current password and new password are required' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false,
                message: 'New password must be at least 6 characters long' 
            });
        }
        
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }
        
        // Verify current password
        const isValidPassword = await user.comparePassword(currentPassword);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false,
                message: 'Current password is incorrect' 
            });
        }
        
        console.log('🔐 Changing password (pre-save hook will hash)');
        
        // ✅ Set PLAIN password - pre-save hook will hash it
        user.password = newPassword;  // ✅ PLAIN PASSWORD
        await user.save();  // ✅ Pre-save hook hashes it
        
        console.log('✅ Password changed for:', user.email);
        
        res.json({ 
            success: true,
            message: 'Password changed successfully' 
        });
        
    } catch (error) {
        console.error('❌ Change password error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during password change' 
        });
    }
};

// ============================================
// RESET PASSWORD - FIXED (NO DOUBLE HASHING)
// ============================================
exports.resetPassword = async (req, res) => {
    try {
        const { resetToken } = req.params;
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ 
                success: false,
                message: 'New password is required' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                message: 'Password must be at least 6 characters long' 
            });
        }
        
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        const user = await User.findOne({
            resetPasswordCode: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid or expired reset code' 
            });
        }
        
        console.log('🔐 Resetting password (pre-save hook will hash)');
        
        // ✅ Set PLAIN password - pre-save hook will hash it
        user.password = password;  // ✅ PLAIN PASSWORD
        user.resetPasswordCode = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();  // ✅ Pre-save hook hashes it
        
        console.log('✅ Password reset for:', user.email);
        
        res.json({ 
            success: true,
            message: 'Password reset successful. You can now login with your new password.' 
        });
        
    } catch (error) {
        console.error('❌ Password reset error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during password reset' 
        });
    }
};

// ... rest of the controller (no changes)
exports.logout = async (req, res) => {
    try {
        res.json({ 
            success: true,
            message: 'Logout successful' 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during logout' 
        });
    }
};

exports.resetPasswordRequest = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: 'Email is required' 
            });
        }
        
        const user = await User.findOne({ email: email.toLowerCase() });
        
        const successMessage = 'If that email exists, a reset code has been sent';
        
        if (!user) {
            return res.json({ 
                success: true,
                message: successMessage 
            });
        }
        
        const resetCode = Math.floor(100 + Math.random() * 900).toString();
        const resetToken = crypto.createHash('sha256').update(resetCode).digest('hex');
        
        user.resetPasswordCode = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();
        
        console.log(`🔐 Password reset code for ${email}: ${resetCode}`);
        console.log(`⏰ Expires at: ${new Date(user.resetPasswordExpires)}`);
        
        const response = {
            success: true,
            message: successMessage
        };
        
        if (process.env.NODE_ENV === 'development') {
            response.resetCode = resetCode;
            response._devNote = 'Reset code only shown in development mode';
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error processing reset request' 
        });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                roles: user.roles,
                gymId: user.gymId,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to get user information' 
        });
    }
};

module.exports = exports;
