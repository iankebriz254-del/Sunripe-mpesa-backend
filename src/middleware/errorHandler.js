const logger = require('../utils/logger');

// Catches anything thrown/passed to next() in route handlers so the
// process never crashes on an unhandled error, and so error responses
// stay consistent (and never leak stack traces to the client).
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error('Unhandled error', { path: req.path, error: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: 'Something went wrong. Please try again.',
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found.' });
}

module.exports = { errorHandler, notFoundHandler };
