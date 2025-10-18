// Src/routes/workout.js - Complete Workout Routes
// FILE MODIFICATION #8: Add all missing endpoints

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleCheck');
const workoutController = require('../controllers/workoutController');

// ========================================
// NEW ROUTES FOR PHOENIX INTERFACE
// ========================================

// Log workout (NEW)
router.post('/', protect, workoutController.logWorkout);

// Get recent workouts (NEW)
router.get('/recent', protect, workoutController.getRecentWorkouts);

// Get last workout of specific type (NEW)
router.get('/last/:type', protect, workoutController.getLastWorkout);

// Get AI workout suggestion (NEW)
router.get('/suggest/:type', protect, workoutController.getWorkoutSuggestion);

// Get workout templates (NEW)
router.get('/templates', protect, workoutController.getTemplates);

// ========================================
// EXISTING ROUTES (KEEP THESE)
// ========================================

// Get workouts by client
router.get('/client/:clientId', protect, workoutController.getWorkoutsByClient);

// Create workout (admin/specialist)
router.post('/client/:clientId', protect, checkRole('specialist', 'admin', 'owner'), workoutController.createWorkout);

// Update workout
router.put('/:id', protect, checkRole('specialist', 'admin', 'owner'), workoutController.updateWorkout);

// Delete workout
router.delete('/:id', protect, checkRole('specialist', 'admin', 'owner'), workoutController.deleteWorkout);

module.exports = router;
