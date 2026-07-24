const logger = require('./logger');
const { AppError } = require('./errors');

/**
 * Express error-handling middleware. Must be registered last, after all routes.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';

  logger.error(
    {
      code,
      statusCode,
      message: err.message,
      details: err.details,
      path: req.path,
      method: req.method,
      stack: err.stack
    },
    'Request failed'
  );

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.message,
      details: err.details || undefined
    }
  });
}

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`
    }
  });
}

module.exports = { errorHandler, notFoundHandler };
