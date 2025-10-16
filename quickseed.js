// quickseed.js - Simple seed script (put in backend root)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb+srv://digitalappleco_db_user:tZoVnKGdoYMx9IbV@cluster0.epf3g44.mongodb.net/pal-fitness?retryWrites=true&w=majority&appName=Cluster0';

// Define User schema inline
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  roles: [String],
  wearableConnections: { type: Array, default: [] },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function seed() {
  try {
    console.log('🔥 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    // Delete existing admin user
    await User.deleteOne({ email: 'admin@clockwork.fit' });
    console.log('🗑️  Cleared old admin user\n');

    // Create new admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = new User({
      name: 'Phoenix Admin',
      email: 'admin@clockwork.fit',
      password: hashedPassword,
      roles: ['admin', 'client'],
      wearableConnections: [],
      isActive: true
    });

    await admin.save();
    
    console.log('✅ Admin user created!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: admin@clockwork.fit');
    console.log('🔑 Password: admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seed();