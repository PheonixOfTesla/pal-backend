// In Src/middleware/auth.js
const protect = async (req, res, next) => {
    console.log('Auth middleware triggered');
    
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            console.log('Token received:', token ? 'Yes' : 'No');
            
            const secret = process.env.JWT_SECRET || 'your-secret-key';
            console.log('Using JWT secret:', secret ? 'From ENV' : 'Default');
            
            const decoded = jwt.verify(token, secret);
            console.log('Token decoded:', decoded);
            
            // Handle both token formats
            const userIdToFind = decoded.id || decoded.userId || decoded._id;
            
            if (!userIdToFind) {
                console.error('No user ID in token');
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid token format' 
                });
            }
            
            req.user = await User.findById(userIdToFind).select('-password');
            
            if (!req.user) {
                console.error('User not found for ID:', userIdToFind);
                return res.status(401).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }
            
            // Ensure consistent user object
            req.user.id = req.user._id.toString();
            req.user.userId = req.user._id.toString();
            
            console.log('Auth successful for:', req.user.email);
            next();
        } catch (error) {
            console.error('Auth error:', error.message);
            return res.status(401).json({ 
                success: false, 
                message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Token invalid'
            });
        }
    } else {
        console.log('No token provided');
        return res.status(401).json({ 
            success: false, 
            message: 'No token provided' 
        });
    }
};
