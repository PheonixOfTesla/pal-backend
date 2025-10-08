// In src/controllers/authController.js

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
