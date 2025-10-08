const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// REGISTER
exports.register = async (req, res) => {
    try {
        const { name, email, password, roles } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = new User({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            roles: roles || ['client']
        });
        
        await user.save();
        
        // AUTO-CREATE GYM FOR NEW USERS (if they're owner/admin/specialist)
        if (roles && (roles.includes('owner') || roles.includes('admin') || roles.includes('specialist'))) {
            const Gym = require('../models/Gym');
            
            const gym = new Gym({
                name: `${name}'s Gym`,
                ownerId: user._id,
                tier: 'SOLO',
                subscriptionStatus: 'trial',
                trialStartDate: new Date(),
                address: {
                    street: 'TBD',
                    city: 'TBD',
                    state: 'TBD',
                    zipCode: '00000'
                }
            });
            
            await gym.save();
            
            // Update user with gymId
            user.gymId = gym._id;
            await user.save();
        }
        
        // Generate token
        const token = jwt.sign(
            { userId: user._id, roles: user.roles },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
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
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration', error: error.message });
    }
};

// LOGIN
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Generate token
        const token = jwt.sign(
            { userId: user._id, roles: user.roles },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
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
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// LOGOUT
exports.logout = async (req, res) => {
    try {
        // In a JWT system, logout is handled client-side by deleting the token
        res.json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ message: 'Server error during logout' });
    }
};

// REQUEST PASSWORD RESET
exports.resetPasswordRequest = async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Don't reveal if user exists
            return res.json({ message: 'If that email exists, a reset code has been sent' });
        }
        
        // Generate 6-digit code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const resetToken = crypto.createHash('sha256').update(resetCode).digest('hex');
        
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();
        
        // TODO: Send email with resetCode
        // For now, log it (in production, send via email service)
        console.log(`Password reset code for ${email}: ${resetCode}`);
        
        res.json({ 
            message: 'If that email exists, a reset code has been sent',
            // DEMO ONLY - remove in production
            resetCode: resetCode
        });
        
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// RESET PASSWORD WITH CODE
exports.resetPassword = async (req, res) => {
    try {
        const { resetToken } = req.params;
        const { password } = req.body;
        
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset code' });
        }
        
        // Hash new password
        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        
        res.json({ message: 'Password reset successful' });
        
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
