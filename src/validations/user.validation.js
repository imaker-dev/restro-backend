const Joi = require('joi');

const createUser = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'any.required': 'Name is required',
  }),
  email: Joi.string().email().optional().messages({
    'string.email': 'Please provide a valid email address',
  }),
  phone: Joi.string().pattern(/^[0-9+\-\s()]+$/).min(10).max(20).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
  employeeCode: Joi.string().max(20).optional(),
  password: Joi.string().min(6).max(100).optional()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 6 characters',
      'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, and one number',
    }),
  pin: Joi.string().length(4).pattern(/^\d+$/).required().messages({
    'string.length': 'PIN must be exactly 4 digits',
    'string.pattern.base': 'PIN must contain only numbers',
    'any.required': 'PIN is required for all staff',
  }),
  avatarUrl: Joi.string().uri().max(500).optional(),
  isActive: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
  roles: Joi.array().items(
    Joi.object({
      roleId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().optional().allow(null),
    })
  ).optional(),
  // Floor assignments for captain/manager
  floors: Joi.array().items(
    Joi.object({
      floorId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().required(),
      isPrimary: Joi.boolean().optional().default(false),
    })
  ).optional(),
  // Section assignments for captain/manager (Restaurant, Bar, etc.)
  sections: Joi.array().items(
    Joi.object({
      sectionId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().required(),
      canViewMenu: Joi.boolean().optional().default(true),
      canTakeOrders: Joi.boolean().optional().default(true),
      isPrimary: Joi.boolean().optional().default(false),
    })
  ).optional(),
  // Menu category access restrictions
  menuAccess: Joi.array().items(
    Joi.object({
      categoryId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().required(),
      canView: Joi.boolean().optional().default(true),
      canOrder: Joi.boolean().optional().default(true),
    })
  ).optional(),
});

const updateUser = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().optional().allow(null),
  phone: Joi.string().pattern(/^[0-9+\-\s()]+$/).min(10).max(20).optional().allow(null),
  employeeCode: Joi.string().max(20).optional(),
  password: Joi.string().min(6).max(100).optional()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 6 characters',
      'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, and one number',
    }),
  pin: Joi.string().length(4).pattern(/^\d+$/).optional().messages({
    'string.length': 'PIN must be exactly 4 digits',
    'string.pattern.base': 'PIN must contain only numbers',
  }),
  avatarUrl: Joi.string().uri().max(500).optional().allow(null),
  isActive: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
  roles: Joi.array().items(
    Joi.object({
      roleId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().optional().allow(null),
    })
  ).optional(),
  floors: Joi.array().items(
    Joi.object({
      floorId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().required(),
      isPrimary: Joi.boolean().optional().default(false),
    })
  ).optional(),
  sections: Joi.array().items(
    Joi.object({
      sectionId: Joi.number().integer().positive().required(),
      outletId: Joi.number().integer().positive().required(),
      canViewMenu: Joi.boolean().optional().default(true),
      canTakeOrders: Joi.boolean().optional().default(true),
      isPrimary: Joi.boolean().optional().default(false),
    })
  ).optional(),
});

const listUsers = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(100).optional().allow(''),
  roleId: Joi.number().integer().positive().optional(),
  outletId: Joi.number().integer().positive().optional(),
  isActive: Joi.boolean().optional(),
  sortBy: Joi.string().valid('name', 'email', 'employee_code', 'created_at', 'last_login_at').optional(),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').optional(),
});

const assignRole = Joi.object({
  roleId: Joi.number().integer().positive().required().messages({
    'any.required': 'Role ID is required',
  }),
  outletId: Joi.number().integer().positive().optional().allow(null),
});

const removeRole = Joi.object({
  roleId: Joi.number().integer().positive().required().messages({
    'any.required': 'Role ID is required',
  }),
  outletId: Joi.number().integer().positive().optional().allow(null),
});

const idParam = Joi.object({
  id: Joi.number().integer().positive().required(),
});

module.exports = {
  createUser,
  updateUser,
  listUsers,
  assignRole,
  removeRole,
  idParam,
};
