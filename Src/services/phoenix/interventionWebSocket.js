// Src/services/interventionWebSocket.js
const WebSocket = require('ws');
const Intervention = require('../models/intervention');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

class InterventionWebSocketService {
  constructor(wss) {
    this.wss = wss;
    this.userConnections = new Map();
    this.interventionQueues = new Map();
    this.acknowledgmentTracking = new Map();
    
    this.setupWebSocketServer();
  }

  /**
   * Setup WebSocket server for interventions
   */
  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      console.log('🔌 New intervention WebSocket connection');
      
      // Extract token from query params
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        ws.close(1008, 'No token provided');
        return;
      }
      
      this.authenticateConnection(ws, token);
    });
  }

  /**
   * Authenticate WebSocket connection
   */
  authenticateConnection(ws, token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const userId = decoded.id || decoded.userId;
      
      // Store connection
      this.userConnections.set(userId, ws);
      
      // Send authentication success
      ws.send(JSON.stringify({
        type: 'auth_success',
        userId,
        message: 'Connected to intervention system'
      }));
      
      // Setup message handlers
      this.setupMessageHandlers(ws, userId);
      
      // Send pending interventions
      this.sendPendingInterventions(userId);
      
      // Setup heartbeat
      this.setupHeartbeat(ws, userId);
      
      console.log(`✅ User ${userId} connected to intervention WebSocket`);
      
    } catch (error) {
      console.error('Auth error:', error);
      ws.send(JSON.stringify({
        type: 'auth_error',
        message: 'Invalid token'
      }));
      ws.close(1008, 'Invalid token');
    }
  }

  /**
   * Setup message handlers for WebSocket
   */
  setupMessageHandlers(ws, userId) {
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        switch(data.type) {
          case 'acknowledge':
            await this.handleAcknowledgment(userId, data.interventionId, data.response);
            break;
            
          case 'dismiss':
            await this.handleDismissal(userId, data.interventionId, data.reason);
            break;
            
          case 'request_details':
            await this.sendInterventionDetails(userId, data.interventionId);
            break;
            
          case 'subscribe':
            this.subscribeToInterventions(userId, data.types);
            break;
            
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
            
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });
    
    ws.on('close', () => {
      this.userConnections.delete(userId);
      this.interventionQueues.delete(userId);
      console.log(`User ${userId} disconnected from intervention WebSocket`);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
    });
  }

  /**
   * Setup heartbeat to keep connection alive
   */
  setupHeartbeat(ws, userId) {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      } else {
        clearInterval(interval);
      }
    }, 30000); // Every 30 seconds
    
    ws.on('close', () => clearInterval(interval));
  }

  /**
   * Send intervention to user
   */
  async sendIntervention(userId, intervention) {
    const ws = this.userConnections.get(userId);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Queue intervention if user not connected
      this.queueIntervention(userId, intervention);
      return false;
    }
    
    // Format intervention for client
    const formattedIntervention = {
      type: 'intervention',
      id: intervention._id,
      interventionType: intervention.type,
      severity: intervention.severity,
      action: intervention.action,
      reason: intervention.reason,
      metrics: intervention.metrics,
      requiresAcknowledgment: intervention.requiresAcknowledgment,
      timestamp: intervention.timestamp,
      expiresIn: this.calculateExpiration(intervention.severity)
    };
    
    // Send with retry logic
    try {
      ws.send(JSON.stringify(formattedIntervention));
      
      // Track if acknowledgment required
      if (intervention.requiresAcknowledgment) {
        this.trackAcknowledgment(userId, intervention._id);
      }
      
      console.log(`📤 Intervention sent to user ${userId}: ${intervention.type}`);
      return true;
      
    } catch (error) {
      console.error(`Failed to send intervention to ${userId}:`, error);
      this.queueIntervention(userId, intervention);
      return false;
    }
  }

  /**
   * Queue intervention for later delivery
   */
  queueIntervention(userId, intervention) {
    if (!this.interventionQueues.has(userId)) {
      this.interventionQueues.set(userId, []);
    }
    
    this.interventionQueues.get(userId).push({
      intervention,
      queuedAt: Date.now()
    });
    
    console.log(`📥 Intervention queued for user ${userId}`);
  }

  /**
   * Send pending interventions when user connects
   */
  async sendPendingInterventions(userId) {
    // Check database for pending interventions
    const pending = await Intervention.find({
      userId,
      status: 'pending',
      acknowledgedAt: null
    }).sort('-timestamp').limit(10);
    
    // Check queue
    const queued = this.interventionQueues.get(userId) || [];
    
    const ws = this.userConnections.get(userId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Send summary first
    ws.send(JSON.stringify({
      type: 'pending_summary',
      count: pending.length + queued.length,
      critical: pending.filter(i => i.severity === 'critical').length
    }));
    
    // Send each intervention
    for (const intervention of pending) {
      await this.sendIntervention(userId, intervention);
    }
    
    // Send queued interventions
    for (const { intervention } of queued) {
      await this.sendIntervention(userId, intervention);
    }
    
    // Clear queue after sending
    this.interventionQueues.delete(userId);
  }

  /**
   * Handle intervention acknowledgment
   */
  async handleAcknowledgment(userId, interventionId, response) {
    try {
      const intervention = await Intervention.findByIdAndUpdate(
        interventionId,
        {
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          response,
          outcome: 'accepted'
        },
        { new: true }
      );
      
      if (!intervention) {
        throw new Error('Intervention not found');
      }
      
      // Remove from tracking
      const tracking = this.acknowledgmentTracking.get(userId);
      if (tracking) {
        delete tracking[interventionId];
      }
      
      // Send confirmation
      const ws = this.userConnections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'acknowledgment_confirmed',
          interventionId,
          message: 'Intervention acknowledged successfully'
        }));
      }
      
      console.log(`✅ Intervention ${interventionId} acknowledged by user ${userId}`);
      
    } catch (error) {
      console.error('Acknowledgment error:', error);
      
      const ws = this.userConnections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to acknowledge intervention',
          error: error.message
        }));
      }
    }
  }

  /**
   * Handle intervention dismissal
   */
  async handleDismissal(userId, interventionId, reason) {
    try {
      const intervention = await Intervention.findByIdAndUpdate(
        interventionId,
        {
          status: 'dismissed',
          dismissedAt: new Date(),
          dismissReason: reason,
          outcome: 'rejected'
        },
        { new: true }
      );
      
      if (!intervention) {
        throw new Error('Intervention not found');
      }
      
      // Remove from tracking
      const tracking = this.acknowledgmentTracking.get(userId);
      if (tracking) {
        delete tracking[interventionId];
      }
      
      // Send confirmation
      const ws = this.userConnections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'dismissal_confirmed',
          interventionId,
          message: 'Intervention dismissed'
        }));
      }
      
      console.log(`❌ Intervention ${interventionId} dismissed by user ${userId}`);
      
    } catch (error) {
      console.error('Dismissal error:', error);
    }
  }

  /**
   * Send detailed intervention information
   */
  async sendInterventionDetails(userId, interventionId) {
    try {
      const intervention = await Intervention.findById(interventionId)
        .populate('workoutId')
        .populate('goalId')
        .populate('eventId');
      
      if (!intervention) {
        throw new Error('Intervention not found');
      }
      
      const ws = this.userConnections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'intervention_details',
          intervention: {
            ...intervention.toObject(),
            relatedWorkout: intervention.workoutId,
            relatedGoal: intervention.goalId,
            relatedEvent: intervention.eventId
          }
        }));
      }
    } catch (error) {
      console.error('Get details error:', error);
    }
  }

  /**
   * Track acknowledgment requirements
   */
  trackAcknowledgment(userId, interventionId) {
    if (!this.acknowledgmentTracking.has(userId)) {
      this.acknowledgmentTracking.set(userId, {});
    }
    
 const tracking = this.acknowledgmentTracking.get(userId);
    tracking[interventionId] = {
      sentAt: Date.now(),
      attempts: 1
    };
    
    // Set timeout for re-sending if not acknowledged
    setTimeout(() => {
      this.checkAcknowledgment(userId, interventionId);
    }, 60000); // Check after 1 minute
  }

  /**
   * Check if intervention was acknowledged
   */
  async checkAcknowledgment(userId, interventionId) {
    const tracking = this.acknowledgmentTracking.get(userId);
    if (!tracking || !tracking[interventionId]) return;
    
    const intervention = await Intervention.findById(interventionId);
    if (!intervention || intervention.status === 'acknowledged') {
      delete tracking[interventionId];
      return;
    }
    
    const trackingData = tracking[interventionId];
    
    // If critical and not acknowledged, escalate
    if (intervention.severity === 'critical' && trackingData.attempts < 3) {
      trackingData.attempts++;
      
      // Re-send with escalation
      const ws = this.userConnections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'intervention_escalated',
          id: interventionId,
          interventionType: intervention.type,
          severity: 'critical',
          action: intervention.action,
          reason: intervention.reason,
          escalationLevel: trackingData.attempts,
          message: `URGENT: This intervention requires immediate attention (Attempt ${trackingData.attempts}/3)`
        }));
        
        // Set next check
        setTimeout(() => {
          this.checkAcknowledgment(userId, interventionId);
        }, 60000 * trackingData.attempts); // Exponential backoff
      }
    } else if (trackingData.attempts >= 3) {
      // Max attempts reached, mark as ignored
      await Intervention.findByIdAndUpdate(interventionId, {
        status: 'ignored',
        outcome: 'ignored',
        ignoredAfterAttempts: trackingData.attempts
      });
      
      delete tracking[interventionId];
      
      console.log(`⚠️ Intervention ${interventionId} ignored after ${trackingData.attempts} attempts`);
    }
  }

  /**
   * Subscribe user to specific intervention types
   */
  subscribeToInterventions(userId, types) {
    // Store subscription preferences
    if (!this.userSubscriptions) {
      this.userSubscriptions = new Map();
    }
    
    this.userSubscriptions.set(userId, types);
    
    const ws = this.userConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'subscription_confirmed',
        subscribedTo: types,
        message: `Subscribed to ${types.length} intervention types`
      }));
    }
  }

  /**
   * Calculate intervention expiration based on severity
   */
  calculateExpiration(severity) {
    const expirationMap = {
      critical: 5 * 60 * 1000,    // 5 minutes
      high: 30 * 60 * 1000,        // 30 minutes
      medium: 2 * 60 * 60 * 1000,  // 2 hours
      low: 24 * 60 * 60 * 1000     // 24 hours
    };
    
    return expirationMap[severity] || 60 * 60 * 1000; // Default 1 hour
  }

  /**
   * Broadcast intervention to multiple users (for team features)
   */
  async broadcastIntervention(userIds, intervention) {
    const results = [];
    
    for (const userId of userIds) {
      const success = await this.sendIntervention(userId, intervention);
      results.push({ userId, success });
    }
    
    return results;
  }

  /**
   * Get connection status for a user
   */
  isUserConnected(userId) {
    const ws = this.userConnections.get(userId);
    return ws && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get all connected users
   */
  getConnectedUsers() {
    const connected = [];
    
    this.userConnections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        connected.push(userId);
      }
    });
    
    return connected;
  }

  /**
   * Send system announcement to all connected users
   */
  sendSystemAnnouncement(message, severity = 'info') {
    const announcement = {
      type: 'system_announcement',
      message,
      severity,
      timestamp: new Date()
    };
    
    let sentCount = 0;
    
    this.userConnections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(announcement));
          sentCount++;
        } catch (error) {
          console.error(`Failed to send announcement to ${userId}:`, error);
        }
      }
    });
    
    console.log(`📢 System announcement sent to ${sentCount} users`);
    return sentCount;
  }

  /**
   * Clean up stale connections and queues
   */
  cleanup() {
    // Remove dead connections
    this.userConnections.forEach((ws, userId) => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.userConnections.delete(userId);
      }
    });
    
    // Clear old queued interventions (older than 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    
    this.interventionQueues.forEach((queue, userId) => {
      const filtered = queue.filter(item => item.queuedAt > cutoff);
      if (filtered.length === 0) {
        this.interventionQueues.delete(userId);
      } else {
        this.interventionQueues.set(userId, filtered);
      }
    });
    
    console.log(`🧹 Cleaned up ${this.userConnections.size} connections, ${this.interventionQueues.size} queues`);
  }

  /**
   * Get service statistics
   */
  getStats() {
    const stats = {
      connectedUsers: this.getConnectedUsers().length,
      totalConnections: this.userConnections.size,
      queuedInterventions: 0,
      pendingAcknowledgments: 0
    };
    
    this.interventionQueues.forEach(queue => {
      stats.queuedInterventions += queue.length;
    });
    
    this.acknowledgmentTracking.forEach(tracking => {
      stats.pendingAcknowledgments += Object.keys(tracking).length;
    });
    
    return stats;
  }
}

// Export singleton instance
let instance = null;

module.exports = {
  getInstance: (wss) => {
    if (!instance && wss) {
      instance = new InterventionWebSocketService(wss);
      
      // Setup cleanup interval
      setInterval(() => {
        instance.cleanup();
      }, 60 * 60 * 1000); // Cleanup every hour
    }
    return instance;
  },
  
  InterventionWebSocketService
};
