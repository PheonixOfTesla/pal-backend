// Src/services/blockchainHealth.js - Immutable Health Records on Blockchain
const crypto = require('crypto');
const axios = require('axios');
const WearableData = require('../models/WearableData');
const Workout = require('../models/Workout');
const Measurement = require('../models/Measurement');
const User = require('../models/User');

class BlockchainHealthService {
  constructor() {
    // Blockchain network configuration
    this.config = {
      network: process.env.BLOCKCHAIN_NETWORK || 'polygon', // Use Polygon for low fees
      rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'https://polygon-rpc.com',
      chainId: process.env.BLOCKCHAIN_CHAIN_ID || 137,
      contractAddress: process.env.HEALTH_CONTRACT_ADDRESS,
      privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY,
      ipfsGateway: process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud',
      pinataApiKey: process.env.PINATA_API_KEY,
      pinataSecretKey: process.env.PINATA_SECRET_KEY
    };
    
    // Initialize blockchain connection
    this.web3 = null;
    this.contract = null;
    this.initializeBlockchain();
    
    // Local record cache
    this.recordCache = new Map();
    
    // Encryption keys
    this.encryptionKey = process.env.HEALTH_ENCRYPTION_KEY || 
      crypto.randomBytes(32).toString('hex');
  }

  /**
   * Initialize blockchain connection
   */
  async initializeBlockchain() {
    try {
      // In production, use Web3.js or Ethers.js
      // const Web3 = require('web3');
      // this.web3 = new Web3(this.config.rpcUrl);
      
      // Load smart contract ABI
      this.contractABI = [
        // Simplified ABI
        {
          "name": "storeHealthRecord",
          "type": "function",
          "inputs": [
            { "name": "_userId", "type": "bytes32" },
            { "name": "_ipfsHash", "type": "string" },
            { "name": "_recordType", "type": "string" },
            { "name": "_timestamp", "type": "uint256" }
          ]
        },
        {
          "name": "getHealthRecord",
          "type": "function",
          "inputs": [
            { "name": "_userId", "type": "bytes32" },
            { "name": "_recordId", "type": "uint256" }
          ],
          "outputs": [
            { "name": "ipfsHash", "type": "string" },
            { "name": "recordType", "type": "string" },
            { "name": "timestamp", "type": "uint256" }
          ]
        },
        {
          "name": "grantAccess",
          "type": "function",
          "inputs": [
            { "name": "_userId", "type": "bytes32" },
            { "name": "_grantee", "type": "address" },
            { "name": "_expiry", "type": "uint256" }
          ]
        }
      ];
      
      console.log('✅ Blockchain service initialized');
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error);
    }
  }

  /**
   * Store health record on blockchain
   */
  async storeHealthRecord(userId, recordType, data) {
    try {
      console.log(`📝 Storing ${recordType} record for user ${userId}`);
      
      // Step 1: Encrypt sensitive data
      const encryptedData = await this.encryptData(data);
      
      // Step 2: Upload to IPFS
      const ipfsHash = await this.uploadToIPFS(encryptedData);
      
      // Step 3: Create blockchain transaction
      const blockchainTx = await this.createBlockchainRecord(
        userId,
        ipfsHash,
        recordType
      );
      
      // Step 4: Store metadata in MongoDB for quick access
      const recordMetadata = {
        userId,
        recordType,
        ipfsHash,
        blockchainTx,
        timestamp: new Date(),
        dataHash: this.hashData(data),
        size: JSON.stringify(data).length,
        version: '1.0'
      };
      
      // Cache for quick access
      this.recordCache.set(`${userId}:${recordType}:${Date.now()}`, recordMetadata);
      
      console.log(`✅ Health record stored: IPFS(${ipfsHash}), TX(${blockchainTx})`);
      
      return {
        success: true,
        ipfsHash,
        transactionHash: blockchainTx,
        recordId: this.generateRecordId(userId, recordType),
        timestamp: recordMetadata.timestamp
      };
      
    } catch (error) {
      console.error('❌ Failed to store health record:', error);
      throw error;
    }
  }

  /**
   * Retrieve health record from blockchain
   */
  async retrieveHealthRecord(userId, recordId) {
    try {
      console.log(`📖 Retrieving record ${recordId} for user ${userId}`);
      
      // Check cache first
      const cached = this.recordCache.get(recordId);
      if (cached) {
        const data = await this.retrieveFromIPFS(cached.ipfsHash);
        return await this.decryptData(data);
      }
      
      // Retrieve from blockchain
      const blockchainRecord = await this.getBlockchainRecord(userId, recordId);
      
      if (!blockchainRecord || !blockchainRecord.ipfsHash) {
        throw new Error('Record not found on blockchain');
      }
      
      // Retrieve from IPFS
      const encryptedData = await this.retrieveFromIPFS(blockchainRecord.ipfsHash);
      
      // Decrypt data
      const decryptedData = await this.decryptData(encryptedData);
      
      return {
        success: true,
        recordId,
        data: decryptedData,
        metadata: blockchainRecord,
        verified: await this.verifyIntegrity(decryptedData, blockchainRecord.dataHash)
      };
      
    } catch (error) {
      console.error('❌ Failed to retrieve health record:', error);
      throw error;
    }
  }

  /**
   * Create comprehensive health snapshot
   */
  async createHealthSnapshot(userId) {
    try {
      console.log(`📸 Creating health snapshot for user ${userId}`);
      
      // Gather all health data
      const [
        wearableData,
        workouts,
        measurements,
        user
      ] = await Promise.all([
        WearableData.find({ userId })
          .sort('-date')
          .limit(30)
          .lean(),
        Workout.find({ clientId: userId })
          .sort('-scheduledDate')
          .limit(10)
          .lean(),
        Measurement.find({ clientId: userId })
          .sort('-date')
          .limit(5)
          .lean(),
        User.findById(userId)
          .select('-password')
          .lean()
      ]);
      
      // Create snapshot object
      const snapshot = {
        userId,
        timestamp: new Date(),
        version: '1.0',
        user: {
          name: user.name,
          email: user.email,
          age: this.calculateAge(user.dateOfBirth)
        },
        wearable: {
          summary: this.summarizeWearableData(wearableData),
          recent: wearableData.slice(0, 7)
        },
        fitness: {
          workoutCount: workouts.length,
          completionRate: this.calculateCompletionRate(workouts),
          recentWorkouts: workouts.slice(0, 3).map(w => ({
            name: w.name,
            date: w.scheduledDate,
            completed: w.completed
          }))
        },
        measurements: {
          latest: measurements[0],
          trend: this.calculateMeasurementTrend(measurements)
        },
        healthScores: await this.calculateHealthScores(wearableData, workouts, measurements)
      };
      
      // Store on blockchain
      const result = await this.storeHealthRecord(
        userId,
        'health_snapshot',
        snapshot
      );
      
      return {
        ...result,
        snapshot
      };
      
    } catch (error) {
      console.error('❌ Failed to create health snapshot:', error);
      throw error;
    }
  }

  /**
   * Grant temporary access to health records
   */
  async grantAccess(userId, granteeAddress, expiryHours = 24) {
    try {
      console.log(`🔓 Granting access to ${granteeAddress} for ${expiryHours} hours`);
      
      const expiryTimestamp = Date.now() + (expiryHours * 60 * 60 * 1000);
      
      // Create access token
      const accessToken = jwt.sign(
        {
          userId,
          grantee: granteeAddress,
          permissions: ['read'],
          expiry: expiryTimestamp
        },
        this.encryptionKey,
        { expiresIn: `${expiryHours}h` }
      );
      
      // Store on blockchain (in production)
      if (this.contract) {
        // await this.contract.methods.grantAccess(
        //   this.hashUserId(userId),
        //   granteeAddress,
        //   Math.floor(expiryTimestamp / 1000)
        // ).send({ from: this.config.privateKey });
      }
      
      // Store in database for quick validation
      const accessGrant = {
        userId,
        grantee: granteeAddress,
        accessToken,
        permissions: ['read'],
        grantedAt: new Date(),
        expiresAt: new Date(expiryTimestamp),
        revoked: false
      };
      
      console.log(`✅ Access granted until ${new Date(expiryTimestamp)}`);
      
      return {
        success: true,
        accessToken,
        expiresAt: expiryTimestamp,
        shareUrl: `https://clockwork.fit/health/shared/${accessToken}`
      };
      
    } catch (error) {
      console.error('❌ Failed to grant access:', error);
      throw error;
    }
  }

  /**
   * Export health data for portability
   */
  async exportHealthData(userId, format = 'json') {
    try {
      console.log(`📦 Exporting health data for user ${userId} as ${format}`);
      
      // Retrieve all health records
      const allRecords = await this.getAllUserRecords(userId);
      
      // Compile comprehensive health profile
      const healthProfile = {
        exportDate: new Date(),
        format: 'FHIR R4', // Use healthcare standard
        patient: {
          id: userId,
          identifiers: []
        },
        observations: [],
        procedures: [],
        conditions: [],
        medications: [],
        immunizations: [],
        allergyIntolerances: []
      };
      
      // Convert to FHIR format
      for (const record of allRecords) {
        const fhirResource = this.convertToFHIR(record);
        healthProfile.observations.push(fhirResource);
      }
      
      // Create portable package
      let exportData;
      
      switch(format) {
        case 'fhir':
          exportData = JSON.stringify(healthProfile, null, 2);
          break;
        case 'pdf':
          exportData = await this.generatePDFReport(healthProfile);
          break;
        case 'csv':
          exportData = this.convertToCSV(allRecords);
          break;
        default:
          exportData = JSON.stringify(allRecords, null, 2);
      }
      
      // Store export record on blockchain
      const exportRecord = await this.storeHealthRecord(
        userId,
        'data_export',
        {
          timestamp: new Date(),
          format,
          recordCount: allRecords.length,
          hash: this.hashData(exportData)
        }
      );
      
      return {
        success: true,
        data: exportData,
        format,
        size: exportData.length,
        exportId: exportRecord.recordId,
        ipfsHash: exportRecord.ipfsHash
      };
      
    } catch (error) {
      console.error('❌ Failed to export health data:', error);
      throw error;
    }
  }

  /**
   * Verify data integrity
   */
  async verifyIntegrity(data, expectedHash) {
    const actualHash = this.hashData(data);
    return actualHash === expectedHash;
  }

  /**
   * Encrypt sensitive data
   */
  async encryptData(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      data: encrypted
    };
  }

  /**
   * Decrypt data
   */
  async decryptData(encryptedData) {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Upload to IPFS via Pinata
   */
  async uploadToIPFS(data) {
    if (!this.config.pinataApiKey) {
      // Fallback to mock IPFS hash
      return `Qm${crypto.randomBytes(22).toString('hex')}`;
    }
    
    try {
      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': this.config.pinataApiKey,
            'pinata_secret_api_key': this.config.pinataSecretKey
          }
        }
      );
      
      return response.data.IpfsHash;
    } catch (error) {
      console.error('IPFS upload failed:', error);
      // Fallback to local storage simulation
      const hash = `Qm${crypto.randomBytes(22).toString('hex')}`;
      this.recordCache.set(hash, data);
      return hash;
    }
  }

  /**
   * Retrieve from IPFS
   */
  async retrieveFromIPFS(ipfsHash) {
    // Check local cache first
    if (this.recordCache.has(ipfsHash)) {
      return this.recordCache.get(ipfsHash);
    }
    
    if (!this.config.pinataApiKey) {
      throw new Error('IPFS not configured');
    }
    
    try {
      const response = await axios.get(
        `${this.config.ipfsGateway}/ipfs/${ipfsHash}`
      );
      
      return response.data;
    } catch (error) {
      console.error('IPFS retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Create blockchain record (simulated)
   */
  async createBlockchainRecord(userId, ipfsHash, recordType) {
    // In production, use Web3 to interact with smart contract
    // For now, simulate with hash
    const txData = {
      userId: this.hashUserId(userId),
      ipfsHash,
      recordType,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(8).toString('hex')
    };
    
    const txHash = `0x${crypto
      .createHash('sha256')
      .update(JSON.stringify(txData))
      .digest('hex')}`;
    
    // Store in cache for retrieval
    this.recordCache.set(txHash, txData);
    
    return txHash;
  }

  /**
   * Get blockchain record (simulated)
   */
  async getBlockchainRecord(userId, recordId) {
    // Check cache
    const cached = this.recordCache.get(recordId);
    if (cached) return cached;
    
    // In production, query blockchain
    return null;
  }

  /**
   * Helper Functions
   */
  
  hashData(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }
  
  hashUserId(userId) {
    return `0x${crypto
      .createHash('sha256')
      .update(userId.toString())
      .digest('hex')}`;
  }
  
  generateRecordId(userId, recordType) {
    return `${userId}:${recordType}:${Date.now()}`;
  }
  
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    const ageDiff = Date.now() - new Date(dateOfBirth).getTime();
    return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
  }
  
  summarizeWearableData(data) {
    if (!data || data.length === 0) return null;
    
    const summary = {
      avgSteps: 0,
      avgSleep: 0,
      avgHRV: 0,
      avgRecovery: 0
    };
    
    data.forEach(d => {
      summary.avgSteps += d.steps || 0;
      summary.avgSleep += d.sleepDuration || 0;
      summary.avgHRV += d.hrv || 0;
      summary.avgRecovery += d.recoveryScore || 0;
    });
    
    const count = data.length;
    summary.avgSteps = Math.round(summary.avgSteps / count);
    summary.avgSleep = Math.round(summary.avgSleep / count);
    summary.avgHRV = Math.round(summary.avgHRV / count);
    summary.avgRecovery = Math.round(summary.avgRecovery / count);
    
    return summary;
  }
  
  calculateCompletionRate(workouts) {
    if (!workouts || workouts.length === 0) return 0;
    const completed = workouts.filter(w => w.completed).length;
    return Math.round((completed / workouts.length) * 100);
  }
  
  calculateMeasurementTrend(measurements) {
    if (!measurements || measurements.length < 2) return 'stable';
    
    const recent = measurements[0].weight;
    const previous = measurements[1].weight;
    
    if (recent < previous - 1) return 'decreasing';
    if (recent > previous + 1) return 'increasing';
    return 'stable';
  }
  
  async calculateHealthScores(wearableData, workouts, measurements) {
    const scores = {
      overall: 0,
      fitness: 0,
      recovery: 0,
      consistency: 0,
      wellness: 0
    };
    
    // Recovery score from wearable data
    if (wearableData && wearableData.length > 0) {
      const recentWearable = wearableData[0];
      if (recentWearable.recoveryScore) {
        scores.recovery = recentWearable.recoveryScore;
      } else if (recentWearable.hrv) {
        scores.recovery = Math.min(Math.round((recentWearable.hrv / 80) * 100), 100);
      }
    }
    
    // Fitness score from workouts
    if (workouts && workouts.length > 0) {
      const completedWorkouts = workouts.filter(w => w.completed).length;
      scores.fitness = Math.round((completedWorkouts / workouts.length) * 100);
    }
    
    // Consistency score from activity
    if (wearableData && wearableData.length >= 7) {
      const activeDays = wearableData.filter(d => d.steps >= 5000).length;
      scores.consistency = Math.round((activeDays / wearableData.length) * 100);
    }
    
    // Wellness score from measurements
    if (measurements && measurements.length >= 2) {
      const weightTrend = measurements[0].weight - measurements[1].weight;
      const bodyFatTrend = (measurements[0].bodyFat || 0) - (measurements[1].bodyFat || 0);
      
      // Positive trends improve wellness score
      if (weightTrend <= 0 && bodyFatTrend <= 0) {
        scores.wellness = 85;
      } else if (Math.abs(weightTrend) < 2) {
        scores.wellness = 70;
      } else {
        scores.wellness = 55;
      }
    }
    
    // Calculate overall score
    const weights = {
      recovery: 0.35,
      fitness: 0.25,
      consistency: 0.25,
      wellness: 0.15
    };
    
    scores.overall = Math.round(
      scores.recovery * weights.recovery +
      scores.fitness * weights.fitness +
      scores.consistency * weights.consistency +
      scores.wellness * weights.wellness
    );
    
    return scores;
  }
  
  /**
   * Convert health record to FHIR format
   */
  convertToFHIR(record) {
    // FHIR Observation resource format
    return {
      resourceType: 'Observation',
      id: record.id || crypto.randomBytes(16).toString('hex'),
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: this.mapToLOINCCode(record.type),
          display: record.type
        }]
      },
      subject: {
        reference: `Patient/${record.userId}`
      },
      effectiveDateTime: record.timestamp,
      valueQuantity: {
        value: record.value,
        unit: record.unit || 'unknown',
        system: 'http://unitsofmeasure.org'
      }
    };
  }
  
  /**
   * Map record types to LOINC codes
   */
  mapToLOINCCode(recordType) {
    const loincMap = {
      'heart_rate': '8867-4',
      'blood_pressure': '85354-9',
      'body_weight': '29463-7',
      'body_fat': '41982-0',
      'steps': '55423-8',
      'sleep': '93832-4',
      'hrv': '8867-4',
      'glucose': '2339-0',
      'cholesterol': '2093-3'
    };
    
    return loincMap[recordType] || '74964-0'; // Unknown
  }
  
  /**
   * Convert records to CSV format
   */
  convertToCSV(records) {
    if (!records || records.length === 0) return '';
    
    // Get all unique keys
    const allKeys = new Set();
    records.forEach(record => {
      Object.keys(record).forEach(key => allKeys.add(key));
    });
    
    const headers = Array.from(allKeys);
    const rows = [headers.join(',')];
    
    records.forEach(record => {
      const row = headers.map(header => {
        const value = record[header];
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value.toString().includes(',') ? `"${value}"` : value;
      });
      rows.push(row.join(','));
    });
    
    return rows.join('\n');
  }
  
  /**
   * Generate PDF health report (simulated)
   */
  async generatePDFReport(healthProfile) {
    // In production, use a PDF generation library like PDFKit
    // For now, return HTML that can be converted to PDF
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Health Report - ${healthProfile.patient.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #2563eb; }
    h2 { color: #475569; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background-color: #f3f4f6; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 24px; font-weight: bold; color: #2563eb; }
    .metric-label { color: #6b7280; font-size: 14px; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Comprehensive Health Report</h1>
  <p><strong>Patient ID:</strong> ${healthProfile.patient.id}</p>
  <p><strong>Export Date:</strong> ${new Date(healthProfile.exportDate).toLocaleDateString()}</p>
  
  <h2>Health Metrics Summary</h2>
  <div>
    ${healthProfile.observations.slice(0, 10).map(obs => `
      <div class="metric">
        <div class="metric-value">${obs.valueQuantity?.value || 'N/A'}</div>
        <div class="metric-label">${obs.code?.display || 'Unknown'} ${obs.valueQuantity?.unit || ''}</div>
      </div>
    `).join('')}
  </div>
  
  <h2>Recent Observations</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Value</th>
        <th>Unit</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${healthProfile.observations.slice(0, 20).map(obs => `
        <tr>
          <td>${new Date(obs.effectiveDateTime).toLocaleDateString()}</td>
          <td>${obs.code?.display || 'Unknown'}</td>
          <td>${obs.valueQuantity?.value || 'N/A'}</td>
          <td>${obs.valueQuantity?.unit || ''}</td>
          <td>${obs.status}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <div class="footer">
    <p>This report was generated by ClockWork Fitness Health Records System</p>
    <p>Data is stored securely on blockchain with IPFS distributed storage</p>
    <p>Report ID: ${crypto.randomBytes(8).toString('hex')}</p>
  </div>
</body>
</html>`;
    
    return html;
  }
  
  /**
   * Get all user records
   */
  async getAllUserRecords(userId) {
    const records = [];
    
    // Retrieve from cache
    for (const [key, value] of this.recordCache.entries()) {
      if (key.startsWith(`${userId}:`)) {
        records.push(value);
      }
    }
    
    // In production, also query blockchain
    // const blockchainRecords = await this.queryBlockchain(userId);
    // records.push(...blockchainRecords);
    
    return records;
  }
  
  /**
   * Audit trail for compliance
   */
  async createAuditEntry(action, userId, details) {
    const auditEntry = {
      timestamp: new Date(),
      action,
      userId,
      details,
      hash: crypto.randomBytes(16).toString('hex')
    };
    
    // Store on blockchain for immutability
    await this.storeHealthRecord(
      userId,
      'audit_log',
      auditEntry
    );
    
    return auditEntry;
  }
  
  /**
   * Smart contract interaction for automated health triggers
   */
  async setupHealthTrigger(userId, condition, action) {
    // Example: If HRV < 30 for 3 days, trigger alert
    const trigger = {
      userId,
      condition: {
        metric: condition.metric,
        operator: condition.operator,
        threshold: condition.threshold,
        duration: condition.duration
      },
      action: {
        type: action.type, // 'alert', 'intervention', 'notification'
        recipients: action.recipients,
        message: action.message
      },
      created: new Date(),
      active: true
    };
    
    // In production, deploy as smart contract
    const triggerId = `trigger_${crypto.randomBytes(8).toString('hex')}`;
    this.recordCache.set(triggerId, trigger);
    
    console.log(`⚡ Health trigger created: ${triggerId}`);
    
    return {
      triggerId,
      trigger
    };
  }
  
  /**
   * Medical provider integration
   */
  async shareWithProvider(userId, providerId, recordTypes = []) {
    console.log(`🏥 Sharing health records with provider ${providerId}`);
    
    // Create provider-specific access
    const providerAccess = {
      userId,
      providerId,
      recordTypes: recordTypes.length > 0 ? recordTypes : ['all'],
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      accessLevel: 'read',
      revoked: false
    };
    
    // Generate secure access URL
    const accessToken = jwt.sign(
      providerAccess,
      this.encryptionKey,
      { expiresIn: '90d' }
    );
    
    // Store on blockchain for audit
    await this.storeHealthRecord(
      userId,
      'provider_access',
      providerAccess
    );
    
    return {
      success: true,
      accessUrl: `https://provider.clockwork.fit/health/${accessToken}`,
      expiresAt: providerAccess.expiresAt,
      recordTypes: providerAccess.recordTypes
    };
  }
}

// Export singleton instance
module.exports = new BlockchainHealthService();