// Src/routes/auth.js - UPDATED WITH PREFERENCES ROUTE
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const authController = require('../controllers/authController');

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Register new user
router.post('/register', authController.register);

// Login existing user
router.post('/login', authController.login);

// Request password reset (sends reset code)
router.post('/reset-password', authController.resetPasswordRequest);

// Reset password with code
router.put('/reset-password/:resetToken', authController.resetPassword);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Get current user info from token
router.get('/me', protect, authController.getCurrentUser);

// ✅ NEW: Update user preferences (for onboarding)
router.put('/me', protect, authController.updateUserPreferences);

// Change password (for logged-in users)
router.put('/change-password', protect, authController.changePassword);

// Logout (client-side token deletion, but endpoint for consistency)
router.post('/logout', protect, authController.logout);

// ============================================
// DOCUMENTATION ROUTE
// ============================================
router.get('/docs', (req, res) => {
    res.json({
        message: 'Authentication API Documentation',
        endpoints: {
            public: {
                POST_register: {
                    path: '/api/auth/register',
                    body: {
                        name: 'string (required)',
                        email: 'string (required)',
                        password: 'string (required, min 6 chars)',
                        roles: 'array (optional, default: ["client"])',
                        gymId: 'string (optional)'
                    },
                    description: 'Register a new user account'
                },
                POST_login: {
                    path: '/api/auth/login',
                    body: {
                        email: 'string (required)',
                        password: 'string (required)'
                    },
                    description: 'Login and receive JWT token'
                },
                POST_reset_request: {
                    path: '/api/auth/reset-password',
                    body: {
                        email: 'string (required)'
                    },
                    description: 'Request password reset code (sent via email)'
                },
                PUT_reset_password: {
                    path: '/api/auth/reset-password/:resetToken',
                    body: {
                        password: 'string (required, min 6 chars)'
                    },
                    description: 'Reset password using reset code'
                }
            },
            protected: {
                GET_me: {
                    path: '/api/auth/me',
                    headers: {
                        Authorization: 'Bearer {token}'
                    },
                    description: 'Get current user information from token'
                },
                PUT_me: {
                    path: '/api/auth/me',
                    headers: {
                        Authorization: 'Bearer {token}'
                    },
                    body: {
                        preferences: 'object (required) - User preferences from onboarding'
                    },
                    description: 'Update user preferences (onboarding data)'
                },
                PUT_change_password: {
                    path: '/api/auth/change-password',
                    headers: {
                        Authorization: 'Bearer {token}'
                    },
                    body: {
                        currentPassword: 'string (required)',
                        newPassword: 'string (required, min 6 chars)'
                    },
                    description: 'Change password for logged-in user'
                },
                POST_logout: {
                    path: '/api/auth/logout',
                    headers: {
                        Authorization: 'Bearer {token}'
                    },
                    description: 'Logout (client should delete token)'
                }
            }
        },
        notes: {
            authentication: 'Include JWT token in Authorization header: "Bearer {token}"',
            tokenExpiry: '7 days',
            passwordRequirements: 'Minimum 6 characters'
        }
    });
});

module.exports = router;
