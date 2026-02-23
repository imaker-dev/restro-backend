/**
 * E2E Test Helpers
 * Utility functions for API calls and assertions
 */

const axios = require('axios');
const { BASE_URL } = require('./config');
const sharedState = require('./shared-state');

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  validateStatus: () => true // Don't throw on any status code
});

class TestHelper {
  constructor() {
    // Use shared state for tokens and IDs
    this.state = sharedState;
  }

  // API request helpers
  async post(endpoint, data, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await api.post(endpoint, data, { headers });
    return { status: res.status, body: res.data };
  }

  async get(endpoint, token = null, query = {}) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await api.get(endpoint, { headers, params: query });
    return { status: res.status, body: res.data };
  }

  async put(endpoint, data, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await api.put(endpoint, data, { headers });
    return { status: res.status, body: res.data };
  }

  async patch(endpoint, data, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await api.patch(endpoint, data, { headers });
    return { status: res.status, body: res.data };
  }

  async delete(endpoint, token = null) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await api.delete(endpoint, { headers });
    return { status: res.status, body: res.data };
  }

  // Login helpers
  async loginWithEmail(email, password) {
    const res = await this.post('/auth/login', { email, password });
    if (res.body.success) {
      return res.body.data.accessToken;
    }
    throw new Error(`Login failed: ${res.body.message}`);
  }

  async loginWithPin(employeeCode, pin) {
    const res = await this.post('/auth/login/pin', { employeeCode, pin });
    if (res.body.success) {
      return res.body.data.accessToken;
    }
    throw new Error(`PIN login failed: ${res.body.message}`);
  }

  // Assertion helpers
  assertSuccess(res, statusCode = 200) {
    expect(res.status).toBe(statusCode);
    expect(res.body.success).toBe(true);
    return res.body.data;
  }

  assertError(res, statusCode) {
    expect(res.status).toBe(statusCode);
    expect(res.body.success).toBe(false);
  }

  // Calculation helpers
  calculateTax(baseAmount, taxRate) {
    return parseFloat((baseAmount * taxRate / 100).toFixed(2));
  }

  calculateGST(baseAmount, gstRate) {
    const cgst = this.calculateTax(baseAmount, gstRate / 2);
    const sgst = this.calculateTax(baseAmount, gstRate / 2);
    return { cgst, sgst, total: cgst + sgst };
  }

  calculateIGST(baseAmount, igstRate) {
    const igst = this.calculateTax(baseAmount, igstRate);
    return { igst, total: igst };
  }

  calculateOrderTotal(items, taxGroups) {
    let subtotal = 0;
    let totalTax = 0;
    
    for (const item of items) {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;
      
      if (item.taxGroupId && taxGroups[item.taxGroupId]) {
        const tax = this.calculateTax(itemTotal, taxGroups[item.taxGroupId]);
        totalTax += tax;
      }
    }
    
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(totalTax.toFixed(2)),
      grandTotal: parseFloat((subtotal + totalTax).toFixed(2))
    };
  }

  // Cleanup helper
  async cleanup(token) {
    console.log('Cleaning up test data...');
    const outletId = this.getCreatedId('outlet');
    if (outletId) {
      try {
        await this.patch(`/outlets/${outletId}`, { isActive: false }, token);
        console.log(`Deactivated outlet: ${outletId}`);
      } catch (e) {
        console.log('Outlet cleanup skipped');
      }
    }
  }

  // Store token for a role (uses shared state)
  setToken(role, token) {
    this.state.setToken(role, token);
  }

  getToken(role) {
    return this.state.getToken(role);
  }

  // Store created IDs (uses shared state)
  addCreatedId(type, id) {
    this.state.addCreatedId(type, id);
  }

  getCreatedId(type) {
    return this.state.getCreatedId(type);
  }
}

// Verification functions
const verifyPermissions = (permissions, expectedPermissions) => {
  for (const perm of expectedPermissions) {
    expect(permissions).toContain(perm);
  }
};

const verifyBillCalculation = (bill, expectedSubtotal, expectedTax, expectedTotal) => {
  expect(parseFloat(bill.subtotal)).toBeCloseTo(expectedSubtotal, 2);
  expect(parseFloat(bill.totalTax)).toBeCloseTo(expectedTax, 2);
  expect(parseFloat(bill.grandTotal)).toBeCloseTo(expectedTotal, 2);
};

const verifyOrderStatus = (order, expectedStatus) => {
  expect(order.status).toBe(expectedStatus);
};

const verifyKotStatus = (kot, expectedStatus) => {
  expect(kot.status).toBe(expectedStatus);
};

const verifyTableStatus = (table, expectedStatus) => {
  expect(table.status).toBe(expectedStatus);
};

module.exports = {
  TestHelper,
  verifyPermissions,
  verifyBillCalculation,
  verifyOrderStatus,
  verifyKotStatus,
  verifyTableStatus
};
