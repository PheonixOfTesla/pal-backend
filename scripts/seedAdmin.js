// scripts/seedAdmin.js - FIXED VERSION
const mongoose = require('mongoose');
const User = require('../Src/models/User');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    console.log('🌱 Starting admin seed...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete existing admin user
    await User.deleteMany({ email: 'admin@clockwork.fit' });
    console.log('🗑️  Cleared existing admin user');

    // ✅ FIXED: Don't hash password manually - let the model's pre-save hook do it
    const adminUser = await User.create({
      name: 'Phoenix Admin',
      email: 'admin@clockwork.fit',
      password: 'admin123',  // Plain password - model will hash it
      roles: ['admin', 'client'],
      isActive: true,
    });

    console.log('✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: admin@clockwork.fit');
    console.log('🔑 Password: admin123');
    console.log('👤 ID:', adminUser._id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedAdmin();
