const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error
  if (err.statusCode >= 500) {
    logger.error('Server Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      body: req.body,
      user: req.user?.id,
    });
  } else {
    logger.warn('Client Error:', {
      message: err.message,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // Development response
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      errors: err.errors || undefined,
      stack: err.stack,
    });
  }

  // Production response
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      errors: err.errors || undefined,
    });
  }

  // Programming or unknown errors - don't leak details
  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'Something went wrong',
  });
};

const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404);
  next(error);
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
