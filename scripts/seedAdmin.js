// scripts/seedAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../Src/models/User'); // Adjust path based on your structure
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

    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create admin user
    const adminUser = await User.create({
      name: 'Phoenix Admin',
      email: 'admin@clockwork.fit',
      password: hashedPassword,
      roles: ['admin', 'client'],
      isActive: true,
    });

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@clockwork.fit');
    console.log('🔑 Password: admin123');
    console.log('👤 ID:', adminUser._id);

    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedAdmin();