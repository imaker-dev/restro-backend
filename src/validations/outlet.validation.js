const Joi = require('joi');

const createOutlet = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  code: Joi.string().max(20),
  legalName: Joi.string().max(200),
  outletType: Joi.string().valid('restaurant', 'bar', 'cafe', 'banquet', 'cloud_kitchen', 'food_court'),
  addressLine1: Joi.string().max(255),
  addressLine2: Joi.string().max(255),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  country: Joi.string().max(100).default('India'),
  postalCode: Joi.string().max(20),
  phone: Joi.string().max(20),
  email: Joi.string().email().max(255),
  gstin: Joi.string().max(20),
  fssaiNumber: Joi.string().max(20),
  openingTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  closingTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  is24Hours: Joi.boolean(),
  currencyCode: Joi.string().length(3).default('INR'),
  timezone: Joi.string().max(50).default('Asia/Kolkata'),
  isActive: Joi.boolean(),
  settings: Joi.object()
});

const updateOutlet = Joi.object({
  name: Joi.string().min(2).max(100),
  legalName: Joi.string().max(200),
  outletType: Joi.string().valid('restaurant', 'bar', 'cafe', 'banquet', 'cloud_kitchen', 'food_court'),
  addressLine1: Joi.string().max(255),
  addressLine2: Joi.string().max(255),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  country: Joi.string().max(100),
  postalCode: Joi.string().max(20),
  phone: Joi.string().max(20),
  email: Joi.string().email().max(255),
  gstin: Joi.string().max(20),
  fssaiNumber: Joi.string().max(20),
  openingTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).allow(null),
  closingTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).allow(null),
  is24Hours: Joi.boolean(),
  currencyCode: Joi.string().length(3),
  timezone: Joi.string().max(50),
  isActive: Joi.boolean(),
  settings: Joi.object()
}).min(1);

const createFloor = Joi.object({
  outletId: Joi.number().integer().positive().required(),
  name: Joi.string().min(1).max(50).required(),
  code: Joi.string().max(20),
  description: Joi.string().max(255),
  floorNumber: Joi.number().integer(),
  displayOrder: Joi.number().integer(),
  isActive: Joi.boolean()
});

const updateFloor = Joi.object({
  name: Joi.string().min(1).max(50),
  code: Joi.string().max(20),
  description: Joi.string().max(255),
  floorNumber: Joi.number().integer(),
  displayOrder: Joi.number().integer(),
  isActive: Joi.boolean()
}).min(1);

const createSection = Joi.object({
  outletId: Joi.number().integer().positive().required(),
  name: Joi.string().min(1).max(50).required(),
  code: Joi.string().max(20),
  sectionType: Joi.string().valid('dine_in', 'takeaway', 'delivery', 'bar', 'rooftop', 'private', 'outdoor', 'ac', 'non_ac'),
  description: Joi.string().max(255),
  colorCode: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
  displayOrder: Joi.number().integer(),
  isActive: Joi.boolean()
});

const updateSection = Joi.object({
  name: Joi.string().min(1).max(50),
  code: Joi.string().max(20),
  sectionType: Joi.string().valid('dine_in', 'takeaway', 'delivery', 'bar', 'rooftop', 'private', 'outdoor', 'ac', 'non_ac'),
  description: Joi.string().max(255),
  colorCode: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null),
  displayOrder: Joi.number().integer(),
  isActive: Joi.boolean()
}).min(1);

const createTable = Joi.object({
  outletId: Joi.number().integer().positive().required(),
  floorId: Joi.number().integer().positive().required(),
  sectionId: Joi.number().integer().positive().allow(null),
  tableNumber: Joi.string().min(1).max(20).required(),
  name: Joi.string().max(50),
  capacity: Joi.number().integer().min(1).max(100).default(4),
  minCapacity: Joi.number().integer().min(1).default(1),
  shape: Joi.string().valid('square', 'rectangle', 'round', 'oval', 'custom'),
  isMergeable: Joi.boolean(),
  isSplittable: Joi.boolean(),
  displayOrder: Joi.number().integer(),
  qrCode: Joi.string().max(255),
  isActive: Joi.boolean(),
  position: Joi.object({
    x: Joi.number().integer(),
    y: Joi.number().integer(),
    width: Joi.number().integer().min(50).max(500),
    height: Joi.number().integer().min(50).max(500),
    rotation: Joi.number().integer().min(0).max(360)
  })
});

const updateTable = Joi.object({
  floorId: Joi.number().integer().positive(),
  sectionId: Joi.number().integer().positive().allow(null),
  tableNumber: Joi.string().min(1).max(20),
  name: Joi.string().max(50),
  capacity: Joi.number().integer().min(1).max(100),
  minCapacity: Joi.number().integer().min(1),
  shape: Joi.string().valid('square', 'rectangle', 'round', 'oval', 'custom'),
  isMergeable: Joi.boolean(),
  isSplittable: Joi.boolean(),
  displayOrder: Joi.number().integer(),
  isActive: Joi.boolean(),
  position: Joi.object({
    x: Joi.number().integer(),
    y: Joi.number().integer(),
    width: Joi.number().integer().min(50).max(500),
    height: Joi.number().integer().min(50).max(500),
    rotation: Joi.number().integer().min(0).max(360)
  })
}).min(1);

const updateTableStatus = Joi.object({
  status: Joi.string().valid('available', 'occupied', 'reserved', 'billing', 'cleaning', 'blocked').required(),
  reason: Joi.string().max(255)
});

const startSession = Joi.object({
  guestCount: Joi.number().integer().min(1).max(100).default(1),
  guestName: Joi.string().max(100),
  guestPhone: Joi.string().max(20),
  notes: Joi.string().max(500)
});

const mergeTables = Joi.object({
  tableIds: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

const tableReport = Joi.object({
  fromDate: Joi.date().iso().required(),
  toDate: Joi.date().iso().min(Joi.ref('fromDate')).required()
});

module.exports = {
  createOutlet,
  updateOutlet,
  createFloor,
  updateFloor,
  createSection,
  updateSection,
  createTable,
  updateTable,
  updateTableStatus,
  startSession,
  mergeTables,
  tableReport
};
