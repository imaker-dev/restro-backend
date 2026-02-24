const Joi = require('joi');

const loginEmail = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(6).max(100).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'any.required': 'Password is required',
  }),
  deviceId: Joi.string().max(255).optional(),
  deviceName: Joi.string().max(100).optional(),
  deviceType: Joi.string().valid('captain_app', 'manager_app', 'admin_panel', 'other').optional(),
});

const loginPin = Joi.object({
  employeeCode: Joi.string().max(20).required().messages({
    'any.required': 'Employee code is required',
  }),
  pin: Joi.string().length(4).pattern(/^\d+$/).required().messages({
    'string.length': 'PIN must be exactly 4 digits',
    'string.pattern.base': 'PIN must contain only numbers',
    'any.required': 'PIN is required',
  }),
  outletId: Joi.number().integer().positive().optional(),
  deviceId: Joi.string().max(255).optional(),
  deviceName: Joi.string().max(100).optional(),
  deviceType: Joi.string().valid('captain_app', 'manager_app', 'admin_panel', 'other').optional(),
});

const refreshToken = Joi.object({
  refreshToken: Joi.string().required().messages({
    'any.required': 'Refresh token is required',
  }),
});

const changePassword = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
  }),
  newPassword: Joi.string().min(6).max(100).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'New password must be at least 6 characters',
      'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, and one number',
      'any.required': 'New password is required',
    }),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Confirm password is required',
  }),
});

const changePin = Joi.object({
  currentPin: Joi.string().length(4).pattern(/^\d+$/).optional().messages({
    'string.length': 'Current PIN must be exactly 4 digits',
    'string.pattern.base': 'PIN must contain only numbers',
  }),
  newPin: Joi.string().length(4).pattern(/^\d+$/).required().messages({
    'string.length': 'New PIN must be exactly 4 digits',
    'string.pattern.base': 'PIN must contain only numbers',
    'any.required': 'New PIN is required',
  }),
  confirmPin: Joi.string().valid(Joi.ref('newPin')).required().messages({
    'any.only': 'PINs do not match',
    'any.required': 'Confirm PIN is required',
  }),
});

const revokeSession = Joi.object({
  sessionId: Joi.number().integer().positive().required().messages({
    'any.required': 'Session ID is required',
  }),
});

module.exports = {
  loginEmail,
  loginPin,
  refreshToken,
  changePassword,
  changePin,
  revokeSession,
};
