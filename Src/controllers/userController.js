// Src/controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Get current user profile
exports.getProfile = async (req, res) => {
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
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// Update current user profile
exports.updateProfile = async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['name', 'phone', 'dateOfBirth', 'height'];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Get all users (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Create user (admin only)
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, roles } = req.body;
    
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    const user = await User.create({
      name,
      email,
      password,
      roles: roles || ['client']
    });
    
    res.status(201).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

// Update user (admin only)
exports.updateUser = async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['name', 'email', 'roles', 'isActive'];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// Delete user (admin only)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// Get clients for a specialist
exports.getClientsBySpecialist = async (req, res) => {
  try {
    const specialist = await User.findById(req.params.specialistId);
    
    if (!specialist) {
      return res.status(404).json({
        success: false,
        message: 'Specialist not found'
      });
    }
    
    const clients = await User.find({
      _id: { $in: specialist.clientIds || [] }
    }).select('-password');
    
    res.json({
      success: true,
      count: clients.length,
      clients
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients'
    });
  }
};

// Assign client to specialist
exports.assignClientToSpecialist = async (req, res) => {
  try {
    const { specialistId, clientId } = req.body;
    
    const [specialist, client] = await Promise.all([
      User.findById(specialistId),
      User.findById(clientId)
    ]);
    
    if (!specialist || !client) {
      return res.status(404).json({
        success: false,
        message: 'Specialist or client not found'
      });
    }
    
    // Add to specialist's clients
    if (!specialist.clientIds) specialist.clientIds = [];
    if (!specialist.clientIds.includes(clientId)) {
      specialist.clientIds.push(clientId);
    }
    
    // Add to client's specialists
    if (!client.specialistIds) client.specialistIds = [];
    if (!client.specialistIds.includes(specialistId)) {
      client.specialistIds.push(specialistId);
    }
    
    await Promise.all([specialist.save(), client.save()]);
    
    res.json({
      success: true,
      message: 'Client assigned to specialist'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to assign client'
    });
  }
};

// Unassign client from specialist
exports.unassignClientFromSpecialist = async (req, res) => {
  try {
    const { specialistId, clientId } = req.body;
    
    const [specialist, client] = await Promise.all([
      User.findById(specialistId),
      User.findById(clientId)
    ]);
    
    if (!specialist || !client) {
      return res.status(404).json({
        success: false,
        message: 'Specialist or client not found'
      });
    }
    
    // Remove from specialist's clients
    specialist.clientIds = (specialist.clientIds || []).filter(
      id => id.toString() !== clientId
    );
    
    // Remove from client's specialists
    client.specialistIds = (client.specialistIds || []).filter(
      id => id.toString() !== specialistId
    );
    
    await Promise.all([specialist.save(), client.save()]);
    
    res.json({
      success: true,
      message: 'Client unassigned from specialist'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unassign client'
    });
  }
};

module.exports = exports;