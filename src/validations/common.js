const Joi = require('joi');

// Common validation schemas
const id = Joi.number().integer().positive();
const uuid = Joi.string().uuid({ version: 'uuidv4' });
const email = Joi.string().email().lowercase().trim();
const phone = Joi.string().pattern(/^[+]?[\d\s-]{10,15}$/);
const password = Joi.string().min(6).max(100);
const pin = Joi.string().pattern(/^\d{4,6}$/);
const name = Joi.string().min(2).max(100).trim();
const code = Joi.string().max(20).uppercase().trim();
const slug = Joi.string().max(100).lowercase().trim();
const description = Joi.string().max(500).trim();
const url = Joi.string().uri();
const date = Joi.date().iso();
const time = Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/);
const price = Joi.number().precision(2).min(0);
const quantity = Joi.number().precision(3).min(0);
const percentage = Joi.number().precision(2).min(0).max(100);
const boolean = Joi.boolean();
const positiveInt = Joi.number().integer().positive();
const nonNegativeInt = Joi.number().integer().min(0);

// Pagination
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().max(50),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
};

// ID params
const idParam = Joi.object({
  id: id.required(),
});

const uuidParam = Joi.object({
  uuid: uuid.required(),
});

// Common query filters
const commonFilters = {
  search: Joi.string().max(100).trim(),
  is_active: boolean,
  from_date: date,
  to_date: date,
  outlet_id: id,
};

// Enums
const orderStatus = Joi.string().valid(
  'pending', 'confirmed', 'preparing', 'ready', 'served', 'billed', 'paid', 'cancelled'
);

const kotStatus = Joi.string().valid(
  'pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled'
);

const tableStatus = Joi.string().valid(
  'available', 'occupied', 'running', 'reserved', 'billing', 'cleaning', 'blocked', 'merged'
);

const paymentMode = Joi.string().valid(
  'cash', 'card', 'upi', 'wallet', 'credit', 'complimentary', 'split'
);

const paymentStatus = Joi.string().valid(
  'pending', 'partial', 'completed', 'refunded', 'failed'
);

const itemType = Joi.string().valid('veg', 'non_veg', 'egg', 'vegan');

const orderType = Joi.string().valid('dine_in', 'takeaway', 'delivery', 'online');

const outletType = Joi.string().valid(
  'restaurant', 'bar', 'cafe', 'banquet', 'food_court', 'pub', 'lounge'
);

const sectionType = Joi.string().valid(
  'dine_in', 'takeaway', 'delivery', 'bar', 'rooftop', 'private', 'outdoor', 'ac', 'non_ac', 'poolside', 'terrace', 'vip'
);

const counterType = Joi.string().valid(
  'main_bar', 'mocktail', 'cocktail', 'whisky', 'wine', 'beer', 'juice', 'coffee', 'dessert', 'live_counter'
);

const kitchenStation = Joi.string().valid(
  'main_kitchen', 'tandoor', 'chinese', 'continental', 'grill', 'salad', 'dessert', 'bakery'
);

const unitType = Joi.string().valid(
  'kg', 'gram', 'liter', 'ml', 'piece', 'dozen', 'packet', 'box', 'bottle', 'can'
);

const discountType = Joi.string().valid(
  'percentage', 'flat', 'item_level', 'bill_level', 'buy_x_get_y'
);

module.exports = {
  id,
  uuid,
  email,
  phone,
  password,
  pin,
  name,
  code,
  slug,
  description,
  url,
  date,
  time,
  price,
  quantity,
  percentage,
  boolean,
  positiveInt,
  nonNegativeInt,
  pagination,
  idParam,
  uuidParam,
  commonFilters,
  orderStatus,
  kotStatus,
  tableStatus,
  paymentMode,
  paymentStatus,
  itemType,
  orderType,
  outletType,
  sectionType,
  counterType,
  kitchenStation,
  unitType,
  discountType,
};
