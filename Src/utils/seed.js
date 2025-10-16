// seed.js - Populate Phoenix database with test data
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const User = require('../models/User');

// Seed data
const users = [
  {
    name: 'Phoenix Admin',
    email: 'admin@clockwork.fit',
    password: 'admin123',
    roles: ['admin', 'client']
  },
  {
    name: 'Test Client',
    email: 'client@test.com',
    password: 'client123',
    roles: ['client']
  },
  {
    name: 'John Doe',
    email: 'john@phoenix.app',
    password: 'john123',
    roles: ['client'],
    phone: '+1-555-0100',
    height: 180
  },
  {
    name: 'Jane Smith',
    email: 'jane@phoenix.app',
    password: 'jane123',
    roles: ['client'],
    phone: '+1-555-0101',
    height: 165
  }
];

async function seedDatabase() {
  try {
    console.log('🔥 Starting Phoenix Database Seeder...\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Ask if user wants to clear existing data
    console.log('⚠️  WARNING: This will clear existing users!');
    console.log('📝 To clear data: Set CLEAR_DATA=true in environment');
    
    if (process.env.CLEAR_DATA === 'true') {
      console.log('\n🗑️  Clearing existing data...');
      await User.deleteMany({});
      console.log('✅ Cleared users collection\n');
    } else {
      console.log('ℹ️  Keeping existing data (set CLEAR_DATA=true to clear)\n');
    }

    // Create users
    console.log('👥 Creating users...');
    const createdUsers = [];

    for (const userData of users) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        
        if (existingUser) {
          console.log(`⚠️  User already exists: ${userData.email}`);
          createdUsers.push(existingUser);
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        // Create user
        const user = new User({
          ...userData,
          password: hashedPassword,
          wearableConnections: [],
          isActive: true
        });

        await user.save();
        createdUsers.push(user);
        
        console.log(`✅ Created user: ${userData.email}`);
      } catch (error) {
        console.error(`❌ Failed to create user ${userData.email}:`, error.message);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔥 PHOENIX DATABASE SEEDED SUCCESSFULLY! 🔥');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📊 Summary:');
    console.log(`   Users created: ${createdUsers.length}\n`);
    
    console.log('🔐 Login Credentials:\n');
    users.forEach(user => {
      console.log(`   📧 ${user.email}`);
      console.log(`   🔑 ${user.password}`);
      console.log(`   👤 ${user.roles.join(', ')}\n`);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Ready to test Phoenix!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeder
seedDatabase();