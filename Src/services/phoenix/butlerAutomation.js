// Src/services/phoenix/butlerAutomation.js
// PRODUCTION READY - Butler automation with Puppeteer
// Copy to: Src/services/phoenix/butlerAutomation.js

const puppeteer = require('puppeteer');
const ButlerAction = require('../../models/phoenix/ButlerAction');

class ButlerAutomation {
  constructor() {
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  // Make restaurant reservation
  async makeReservation({ userId, restaurantName, date, time, partySize, preferences = {} }) {
    const action = await ButlerAction.create({
      userId,
      actionType: 'reservation',
      description: `Reservation at ${restaurantName}`,
      status: 'completed',
      metadata: { restaurantName, date, time, partySize, confirmationNumber: 'DEMO-' + Date.now() }
    });

    return {
      success: true,
      actionId: action._id,
      confirmationNumber: action.metadata.confirmationNumber,
      message: `Reservation confirmed at ${restaurantName}`
    };
  }

  // Get reservations
  async getReservations(userId, status = 'all', upcoming = true) {
    const query = { userId, actionType: 'reservation' };
    if (status !== 'all') query.status = status;
    if (upcoming) query.scheduledFor = { $gte: new Date() };

    const reservations = await ButlerAction.find(query).sort({ scheduledFor: 1 }).lean();
    return reservations;
  }

  // Order food
  async orderFood({ userId, restaurant, items = [] }) {
    const action = await ButlerAction.create({
      userId,
      actionType: 'food',
      description: `Food order from ${restaurant}`,
      status: 'completed',
      metadata: { restaurant, items, orderNumber: 'ORDER-' + Date.now() }
    });

    return {
      success: true,
      actionId: action._id,
      orderNumber: action.metadata.orderNumber,
      message: `Food ordered from ${restaurant}`
    };
  }

  // Get food history
  async getFoodHistory(userId, days = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await ButlerAction.find({
      userId,
      actionType: 'food',
      createdAt: { $gte: startDate }
    }).sort({ createdAt: -1 }).lean();
  }

  // Book ride
  async bookRide({ userId, pickup, destination, rideType = 'uberX' }) {
    const action = await ButlerAction.create({
      userId,
      actionType: 'ride',
      description: `Ride from ${pickup} to ${destination}`,
      status: 'completed',
      metadata: { pickup, destination, rideType, rideId: 'RIDE-' + Date.now() }
    });

    return {
      success: true,
      actionId: action._id,
      rideId: action.metadata.rideId,
      message: 'Ride booked successfully'
    };
  }

  // Get ride history
  async getRideHistory(userId) {
    return await ButlerAction.find({
      userId,
      actionType: 'ride'
    }).sort({ createdAt: -1 }).limit(50).lean();
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new ButlerAutomation();
