// ========================================
// ERROR RESPONSE CLASS
// ========================================
// Custom error class for API error responses
// Extends native Error with status code
// ========================================

class ErrorResponse extends Error {
  /**
   * Create custom error
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ErrorResponse;
