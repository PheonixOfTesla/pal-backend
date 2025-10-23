// ========================================
// ASYNC HANDLER MIDDLEWARE
// ========================================
// Wraps async route handlers to catch errors automatically
// Eliminates need for try-catch blocks in controllers
// ========================================

/**
 * Async handler wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
