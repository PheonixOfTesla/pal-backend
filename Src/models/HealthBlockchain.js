// Src/models/HealthBlockchain.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const healthBlockchainSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  blockNumber: { 
    type: Number, 
    required: true,
    index: true
  },
  previousHash: { 
    type: String, 
    required: true 
  },
  hash: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    required: true,
    index: true
  },
  nonce: { 
    type: Number, 
    default: 0 
  },
  recordType: { 
    type: String, 
    enum: [
      'wearable_data',
      'workout_completion',
      'measurement',
      'medical_record',
      'lab_result',
      'prescription',
      'vaccination',
      'diagnosis',
      'intervention',
      'consent'
    ], 
    required: true,
    index: true
  },
  data: {
    encrypted: { type: Boolean, default: true },
    payload: { type: String, required: true },
    metadata: {
      source: String,
      provider: String,
      verifiedBy: String,
      format: String,
      version: String
    }
  },
  permissions: [{
    grantedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    scope: [String],
    expiresAt: Date,
    revokedAt: Date,
    active: { type: Boolean, default: true }
  }],
  verification: {
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    signature: String,
    certificate: String
  },
  audit: [{
    action: { type: String, enum: ['created', 'accessed', 'shared', 'modified', 'verified'] },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
    result: { type: String, enum: ['success', 'failed', 'unauthorized'] }
  }],
  smartContract: {
    address: String,
    network: { type: String, enum: ['ethereum', 'polygon', 'private', 'test'] },
    transactionHash: String,
    gasUsed: Number,
    status: { type: String, enum: ['pending', 'mined', 'failed'] }
  },
  ipfs: {
    hash: String,
    gateway: String,
    pinned: { type: Boolean, default: false },
    size: Number
  },
  tags: [String],
  isGenesis: { type: Boolean, default: false },
  isMerkleRoot: { type: Boolean, default: false },
  merkleProof: [String],
  chainId: { 
    type: String, 
    required: true,
    index: true
  }
}, { 
  timestamps: true 
});

// Indexes for blockchain operations
healthBlockchainSchema.index({ userId: 1, blockNumber: 1 });
healthBlockchainSchema.index({ chainId: 1, blockNumber: 1 });
healthBlockchainSchema.index({ userId: 1, recordType: 1, timestamp: -1 });

// Pre-save hook to calculate hash
healthBlockchainSchema.pre('save', function(next) {
  if (!this.isNew) return next();
  
  // Calculate hash for new block
  const blockData = {
    blockNumber: this.blockNumber,
    timestamp: this.timestamp,
    data: this.data,
    previousHash: this.previousHash,
    nonce: this.nonce
  };
  
  this.hash = this.calculateHash(blockData);
  next();
});

// Method to calculate block hash
healthBlockchainSchema.methods.calculateHash = function(data) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
};

// Method to mine block (proof of work)
healthBlockchainSchema.methods.mineBlock = function(difficulty = 2) {
  const target = '0'.repeat(difficulty);
  
  while (this.hash.substring(0, difficulty) !== target) {
    this.nonce++;
    const blockData = {
      blockNumber: this.blockNumber,
      timestamp: this.timestamp,
      data: this.data,
      previousHash: this.previousHash,
      nonce: this.nonce
    };
    this.hash = this.calculateHash(blockData);
  }
  
  return this.hash;
};

// Method to verify block integrity
healthBlockchainSchema.methods.verifyIntegrity = async function() {
  // Recalculate hash
  const blockData = {
    blockNumber: this.blockNumber,
    timestamp: this.timestamp,
    data: this.data,
    previousHash: this.previousHash,
    nonce: this.nonce
  };
  
  const calculatedHash = this.calculateHash(blockData);
  
  // Verify with previous block if not genesis
  if (!this.isGenesis) {
    const previousBlock = await this.constructor.findOne({
      userId: this.userId,
      blockNumber: this.blockNumber - 1,
      chainId: this.chainId
    });
    
    if (!previousBlock) {
      return { valid: false, error: 'Previous block not found' };
    }
    
    if (previousBlock.hash !== this.previousHash) {
      return { valid: false, error: 'Previous hash mismatch' };
    }
  }
  
  return { 
    valid: calculatedHash === this.hash, 
    error: calculatedHash !== this.hash ? 'Hash mismatch' : null 
  };
};

// Method to grant access permission
healthBlockchainSchema.methods.grantAccess = function(toUserId, scope, expiresIn = 30) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresIn);
  
  this.permissions.push({
    grantedTo: toUserId,
    grantedBy: this.userId,
    scope: scope,
    expiresAt: expiresAt,
    active: true
  });
  
  this.audit.push({
    action: 'shared',
    performedBy: this.userId,
    performedAt: new Date()
  });
  
  return this.save();
};

// Method to revoke access
healthBlockchainSchema.methods.revokeAccess = function(fromUserId) {
  const permission = this.permissions.find(
    p => p.grantedTo.toString() === fromUserId && p.active
  );
  
  if (permission) {
    permission.active = false;
    permission.revokedAt = new Date();
    
    this.audit.push({
      action: 'modified',
      performedBy: this.userId,
      performedAt: new Date()
    });
    
    return this.save();
  }
  
  return this;
};

// Static method to create genesis block for user
healthBlockchainSchema.statics.createGenesisBlock = async function(userId) {
  const chainId = crypto.randomBytes(16).toString('hex');
  
  const genesisBlock = new this({
    userId,
    blockNumber: 0,
    previousHash: '0',
    recordType: 'consent',
    data: {
      encrypted: false,
      payload: JSON.stringify({
        message: 'Genesis block for health chain',
        createdAt: new Date(),
        version: '1.0.0'
      }),
      metadata: {
        source: 'system',
        provider: 'Phoenix Health System'
      }
    },
    isGenesis: true,
    chainId
  });
  
  genesisBlock.hash = genesisBlock.calculateHash({
    blockNumber: 0,
    timestamp: genesisBlock.timestamp,
    data: genesisBlock.data,
    previousHash: '0',
    nonce: 0
  });
  
  return genesisBlock.save();
};

// Static method to add new block to chain
healthBlockchainSchema.statics.addBlock = async function(userId, recordType, data, encrypt = true) {
  // Get the latest block
  const latestBlock = await this.findOne({ userId, chainId: { $exists: true } })
    .sort('-blockNumber')
    .exec();
  
  if (!latestBlock) {
    // Create genesis block first
    const genesis = await this.createGenesisBlock(userId);
    return this.addBlock(userId, recordType, data, encrypt);
  }
  
  // Encrypt data if requested
  let payload = JSON.stringify(data);
  if (encrypt && process.env.ENCRYPTION_KEY) {
    const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    payload = cipher.update(payload, 'utf8', 'hex') + cipher.final('hex');
  }
  
  const newBlock = new this({
    userId,
    blockNumber: latestBlock.blockNumber + 1,
    previousHash: latestBlock.hash,
    recordType,
    data: {
      encrypted: encrypt,
      payload,
      metadata: {
        source: 'phoenix_system',
        provider: 'internal',
        format: 'json',
        version: '1.0.0'
      }
    },
    chainId: latestBlock.chainId
  });
  
  // Mine the block (optional, for proof of work)
  if (process.env.BLOCKCHAIN_DIFFICULTY) {
    newBlock.mineBlock(parseInt(process.env.BLOCKCHAIN_DIFFICULTY));
  }
  
  return newBlock.save();
};

// Static method to verify entire chain
healthBlockchainSchema.statics.verifyChain = async function(userId) {
  const blocks = await this.find({ userId }).sort('blockNumber');
  
  for (let i = 1; i < blocks.length; i++) {
    const currentBlock = blocks[i];
    const previousBlock = blocks[i - 1];
    
    const integrity = await currentBlock.verifyIntegrity();
    if (!integrity.valid) {
      return { 
        valid: false, 
        errorAt: currentBlock.blockNumber,
        error: integrity.error
      };
    }
    
    if (currentBlock.previousHash !== previousBlock.hash) {
      return {
        valid: false,
        errorAt: currentBlock.blockNumber,
        error: 'Chain link broken'
      };
    }
  }
  
  return { valid: true, blocksVerified: blocks.length };
};

module.exports = mongoose.model('HealthBlockchain', healthBlockchainSchema);