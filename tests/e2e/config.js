/**
 * E2E Test Configuration
 * Base configuration for all end-to-end tests
 */

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000/api/v1';
const SOCKET_URL = process.env.TEST_SOCKET_URL || 'http://localhost:3000';

// Test credentials for seeded super admin
const SUPER_ADMIN = {
  email: 'admin@restropos.com',
  password: 'admin123',
  pin: '1234'
};

// New test admin to be created
// Generate unique identifiers for each test run
const TEST_RUN_ID = Date.now().toString().slice(-6);

const NEW_ADMIN = {
  name: 'E2E Test Admin',
  email: `e2e.admin.${TEST_RUN_ID}@testrestro.com`,
  phone: '+91-9999888800',
  employeeCode: `E2EADM${TEST_RUN_ID}`,
  password: 'E2EAdmin@123',
  pin: '9999'
};

// New outlet to be created
const NEW_OUTLET = {
  name: `E2E Test Restaurant ${TEST_RUN_ID}`,
  code: `E2E${TEST_RUN_ID}`,
  legalName: 'E2E Test Restaurant Pvt Ltd',
  outletType: 'restaurant',
  addressLine1: '999 E2E Test Street',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  postalCode: '400001',
  phone: '+91-22-99998888',
  email: 'e2e@testrestro.com',
  gstin: '27AABCE2E34R1ZP',
  fssaiNumber: '99998888776655',
  currencyCode: 'INR',
  timezone: 'Asia/Kolkata',
  openingTime: '09:00',
  closingTime: '23:00'
};

// Staff configurations
const STAFF = {
  manager: {
    name: 'E2E Manager',
    email: 'e2e.manager@testrestro.com',
    employeeCode: 'E2EMGR01',
    password: 'Manager@123',
    pin: '1111',
    roleId: 3
  },
  managerFloorOnly: {
    name: 'E2E Manager Floor',
    email: 'e2e.manager.floor@testrestro.com',
    employeeCode: 'E2EMGR02',
    password: 'Manager@123',
    pin: '1112',
    roleId: 3
  },
  captain: {
    name: 'E2E Captain',
    employeeCode: 'E2ECAP01',
    pin: '2222',
    roleId: 4
  },
  captainFloorOnly: {
    name: 'E2E Captain Floor',
    employeeCode: 'E2ECAP02',
    pin: '2223',
    roleId: 4
  },
  cashier: {
    name: 'E2E Cashier',
    employeeCode: 'E2ECSH01',
    pin: '3333',
    roleId: 5
  },
  cashierFloorOnly: {
    name: 'E2E Cashier Floor',
    employeeCode: 'E2ECSH02',
    pin: '3334',
    roleId: 5
  },
  kitchen: {
    name: 'E2E Chef',
    employeeCode: 'E2EKIT01',
    pin: '4444',
    roleId: 6
  },
  bartender: {
    name: 'E2E Bartender',
    employeeCode: 'E2EBAR01',
    pin: '5555',
    roleId: 7
  }
};

// Menu test data
const MENU_DATA = {
  categories: [
    { name: 'Starters', code: 'START', displayOrder: 1 },
    { name: 'Main Course', code: 'MAIN', displayOrder: 2 },
    { name: 'Beverages', code: 'BEV', displayOrder: 3 },
    { name: 'Desserts', code: 'DESSERT', displayOrder: 4 }
  ],
  items: [
    { name: 'Paneer Tikka', price: 250, station: 'main_kitchen', categoryCode: 'START', taxGroup: 'GST_5' },
    { name: 'Chicken Wings', price: 320, station: 'main_kitchen', categoryCode: 'START', taxGroup: 'GST_5' },
    { name: 'Butter Chicken', price: 380, station: 'main_kitchen', categoryCode: 'MAIN', taxGroup: 'GST_5' },
    { name: 'Dal Makhani', price: 280, station: 'main_kitchen', categoryCode: 'MAIN', taxGroup: 'GST_5' },
    { name: 'Fresh Lime Soda', price: 80, station: 'bar', categoryCode: 'BEV', taxGroup: 'GST_18' },
    { name: 'Mojito', price: 180, station: 'bar', categoryCode: 'BEV', taxGroup: 'GST_18' },
    { name: 'Gulab Jamun', price: 120, station: 'main_kitchen', categoryCode: 'DESSERT', taxGroup: 'GST_5' }
  ]
};

// Role IDs (from seed)
const ROLE_IDS = {
  super_admin: 1,
  admin: 2,
  manager: 3,
  captain: 4,
  cashier: 5,
  kitchen: 6,
  bartender: 7,
  inventory: 8
};

module.exports = {
  BASE_URL,
  SOCKET_URL,
  SUPER_ADMIN,
  NEW_ADMIN,
  NEW_OUTLET,
  STAFF,
  MENU_DATA,
  ROLE_IDS
};
