/**
 * Dyno Integration Test Suite
 * Tests all scenarios for Swiggy/Zomato integration via Dyno APIs
 * 
 * Run: node src/tests/test-dyno-integration.js
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005/api/v1';
const WEBHOOK_SECRET = process.env.DYNO_WEBHOOK_SECRET || 'test-webhook-secret';
let AUTH_TOKEN = null;
let TEST_CHANNEL_ID = null;
let TEST_ONLINE_ORDER_ID = null;
let TEST_POS_ORDER_ID = null;

// Test Results
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// ========================
// UTILITY FUNCTIONS
// ========================

function log(message, type = 'info') {
  const prefix = {
    info: '   ',
    success: ' ✓ ',
    error: ' ✗ ',
    warn: ' ⚠ ',
    header: '\n═══'
  };
  console.log(`${prefix[type] || '   '} ${message}`);
}

function generateSignature(payload, timestamp, secret) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signatureData = `${timestamp}.${payloadString}`;
  return crypto.createHmac('sha256', secret).update(signatureData).digest('hex');
}

async function runTest(name, testFn) {
  try {
    log(`Testing: ${name}`, 'info');
    const result = await testFn();
    if (result.success) {
      log(`${name} - PASSED`, 'success');
      testResults.passed++;
      testResults.tests.push({ name, status: 'passed', message: result.message });
    } else {
      log(`${name} - FAILED: ${result.message}`, 'error');
      testResults.failed++;
      testResults.tests.push({ name, status: 'failed', message: result.message });
    }
  } catch (error) {
    log(`${name} - ERROR: ${error.message}`, 'error');
    testResults.failed++;
    testResults.tests.push({ name, status: 'error', message: error.message });
  }
}

async function skipTest(name, reason) {
  log(`${name} - SKIPPED: ${reason}`, 'warn');
  testResults.skipped++;
  testResults.tests.push({ name, status: 'skipped', message: reason });
}

// ========================
// SETUP TESTS
// ========================

async function setup() {
  log('SETUP: Dyno Integration Tests', 'header');
  console.log('═'.repeat(50));

  // First, ensure a test channel exists in the database
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos'
  });

  try {
    // Check if test channel exists
    const [channels] = await connection.query(
      "SELECT id FROM integration_channels WHERE channel_name = 'swiggy' LIMIT 1"
    );

    if (channels.length > 0) {
      TEST_CHANNEL_ID = channels[0].id;
      log(`Found existing channel ID: ${TEST_CHANNEL_ID}`, 'success');
    } else {
      // Get first outlet ID
      const [outlets] = await connection.query('SELECT id FROM outlets WHERE is_active = 1 LIMIT 1');
      const outletId = outlets[0]?.id || 1;

      // Create test channel
      const [result] = await connection.query(
        `INSERT INTO integration_channels (
          outlet_id, channel_name, channel_display_name,
          dyno_order_id, dyno_access_token, property_id,
          webhook_secret, is_active, auto_accept_orders, auto_print_kot, default_prep_time
        ) VALUES (?, 'swiggy', 'Swiggy Test', 'TEST_DYNO_ID', 'test-token', 'TEST_PROP', ?, 1, 0, 0, 20)`,
        [outletId, WEBHOOK_SECRET]
      );
      TEST_CHANNEL_ID = result.insertId;
      log(`Created test channel ID: ${TEST_CHANNEL_ID}`, 'success');
    }

    // Update webhook secret for the channel
    await connection.query(
      'UPDATE integration_channels SET webhook_secret = ? WHERE id = ?',
      [WEBHOOK_SECRET, TEST_CHANNEL_ID]
    );
    log('Webhook secret configured', 'success');

  } catch (e) {
    log(`Database setup error: ${e.message}`, 'error');
  } finally {
    await connection.end();
  }

  // Login to get auth token
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@restropos.com',
      password: 'admin123'
    });
    
    if (loginRes.data.success && loginRes.data.data?.token) {
      AUTH_TOKEN = loginRes.data.data.token;
      log('Logged in successfully', 'success');
    }
  } catch (e) {
    // Try with different credentials structure
    try {
      const [users] = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'restro_pos'
      }).then(conn => conn.query("SELECT email FROM users WHERE is_active = 1 LIMIT 1").finally(() => conn.end()));
      
      if (users[0]?.email) {
        log(`Found user: ${users[0].email}. Login may require correct password.`, 'info');
      }
    } catch (e2) {
      // ignore
    }
    log(`Login skipped: ${e.message}`, 'warn');
  }
}

// ========================
// TEST SCENARIOS
// ========================

// Test 1: Database Tables Exist
async function testDatabaseTables() {
  const mysql = require('mysql2/promise');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos'
  });

  try {
    const tables = ['integration_channels', 'online_orders', 'channel_menu_mapping', 'integration_logs'];
    
    for (const table of tables) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
      );
      
      if (rows[0].cnt === 0) {
        return { success: false, message: `Table '${table}' not found` };
      }
    }

    // Check orders table columns
    const columns = ['source', 'external_order_id', 'online_order_id'];
    for (const col of columns) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as cnt FROM information_schema.columns 
         WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = ?`,
        [col]
      );
      
      if (rows[0].cnt === 0) {
        return { success: false, message: `Column 'orders.${col}' not found` };
      }
    }

    return { success: true, message: 'All tables and columns exist' };
  } finally {
    await connection.end();
  }
}

// Test 2: Webhook Signature Verification - Valid Signature
async function testWebhookValidSignature() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    event: 'order.new',
    timestamp: new Date().toISOString(),
    data: {
      platform: 'swiggy',
      external_order_id: `TEST_SIG_${Date.now()}`,
      customer: { name: 'Test Customer', phone: '+919999999999' },
      items: [{ external_item_id: 'TEST_001', name: 'Test Item', quantity: 1, unit_price: 100, total_price: 100 }],
      payment: { method: 'prepaid', is_paid: true, total: 100 }
    }
  };

  const signature = generateSignature(payload, timestamp, WEBHOOK_SECRET);

  try {
    const res = await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': signature,
        'X-Dyno-Timestamp': timestamp,
        'X-Dyno-Channel-Id': TEST_CHANNEL_ID || '1'
      }
    });

    if (res.status === 201 || res.status === 200) {
      if (res.data.data?.onlineOrderId) {
        TEST_ONLINE_ORDER_ID = res.data.data.onlineOrderId;
        TEST_POS_ORDER_ID = res.data.data.posOrderId;
      }
      return { success: true, message: `Order created: ${res.data.data?.orderNumber || 'OK'}` };
    }
    return { success: false, message: `Unexpected status: ${res.status}` };
  } catch (e) {
    // 401 means signature was checked (might fail if secret doesn't match)
    if (e.response?.status === 401) {
      return { success: false, message: 'Signature rejected - check DYNO_WEBHOOK_SECRET' };
    }
    return { success: false, message: e.message };
  }
}

// Test 3: Webhook Signature Verification - Invalid Signature
async function testWebhookInvalidSignature() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    event: 'order.new',
    data: { platform: 'swiggy', external_order_id: 'TEST_INVALID' }
  };

  try {
    await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': 'invalid-signature-12345678901234567890123456789012345678901234567890123456789012',
        'X-Dyno-Timestamp': timestamp,
        'X-Dyno-Channel-Id': TEST_CHANNEL_ID || '1'
      }
    });
    return { success: false, message: 'Should have rejected invalid signature' };
  } catch (e) {
    if (e.response?.status === 401) {
      return { success: true, message: 'Invalid signature correctly rejected' };
    }
    return { success: false, message: `Unexpected error: ${e.response?.status} - ${e.response?.data?.error || e.message}` };
  }
}

// Test 4: Webhook Signature Verification - Expired Timestamp
async function testWebhookExpiredTimestamp() {
  const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
  const payload = {
    event: 'order.new',
    data: { platform: 'swiggy', external_order_id: 'TEST_EXPIRED' }
  };

  const signature = generateSignature(payload, expiredTimestamp, WEBHOOK_SECRET);

  try {
    await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': signature,
        'X-Dyno-Timestamp': expiredTimestamp
      }
    });
    return { success: false, message: 'Should have rejected expired timestamp' };
  } catch (e) {
    if (e.response?.status === 401) {
      return { success: true, message: 'Expired timestamp correctly rejected' };
    }
    return { success: false, message: `Unexpected error: ${e.message}` };
  }
}

// Test 5: Duplicate Order Prevention
async function testDuplicateOrderPrevention() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const externalOrderId = `DUP_TEST_${Date.now()}`;
  
  const payload = {
    event: 'order.new',
    timestamp: new Date().toISOString(),
    data: {
      platform: 'swiggy',
      external_order_id: externalOrderId,
      customer: { name: 'Duplicate Test', phone: '+919999999999' },
      items: [{ external_item_id: 'TEST_001', name: 'Test Item', quantity: 1, unit_price: 100, total_price: 100 }],
      payment: { method: 'prepaid', is_paid: true, total: 100 }
    }
  };

  const signature = generateSignature(payload, timestamp, WEBHOOK_SECRET);
  const headers = {
    'Content-Type': 'application/json',
    'X-Dyno-Signature': signature,
    'X-Dyno-Timestamp': timestamp,
    'X-Dyno-Channel-Id': TEST_CHANNEL_ID || '1'
  };

  try {
    // First request - should create
    const res1 = await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, { headers });
    
    if (res1.status !== 201 && res1.status !== 200) {
      return { success: false, message: 'First order creation failed' };
    }

    // Second request with same external_order_id - should detect duplicate
    const timestamp2 = Math.floor(Date.now() / 1000).toString();
    const signature2 = generateSignature(payload, timestamp2, WEBHOOK_SECRET);
    
    const res2 = await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
      headers: { ...headers, 'X-Dyno-Signature': signature2, 'X-Dyno-Timestamp': timestamp2 }
    });

    if (res2.data.duplicate === true || res2.data.message?.includes('already processed')) {
      return { success: true, message: 'Duplicate correctly detected' };
    }

    return { success: false, message: 'Duplicate not detected' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 6: Get Active Online Orders
async function testGetActiveOrders() {
  if (!AUTH_TOKEN) {
    return { success: false, message: 'No auth token' };
  }

  try {
    const res = await axios.get(`${BASE_URL}/integrations/orders/active`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
    });

    if (res.data.success && Array.isArray(res.data.data)) {
      return { success: true, message: `Found ${res.data.data.length} active orders` };
    }
    return { success: false, message: 'Invalid response format' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 7: Accept Order
async function testAcceptOrder() {
  if (!AUTH_TOKEN || !TEST_ONLINE_ORDER_ID) {
    return { success: false, message: 'No auth token or test order' };
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/integrations/orders/${TEST_ONLINE_ORDER_ID}/accept`,
      { prepTime: 20 },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    if (res.data.success) {
      return { success: true, message: `Order accepted with prep time: ${res.data.prepTime}min` };
    }
    return { success: false, message: res.data.error || 'Accept failed' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 8: Mark Order Ready
async function testMarkOrderReady() {
  if (!AUTH_TOKEN || !TEST_ONLINE_ORDER_ID) {
    return { success: false, message: 'No auth token or test order' };
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/integrations/orders/${TEST_ONLINE_ORDER_ID}/ready`,
      {},
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    if (res.data.success) {
      return { success: true, message: 'Order marked ready' };
    }
    return { success: false, message: res.data.error || 'Mark ready failed' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 9: Mark Order Dispatched
async function testMarkOrderDispatched() {
  if (!AUTH_TOKEN || !TEST_ONLINE_ORDER_ID) {
    return { success: false, message: 'No auth token or test order' };
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/integrations/orders/${TEST_ONLINE_ORDER_ID}/dispatch`,
      {},
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    if (res.data.success) {
      return { success: true, message: 'Order marked dispatched' };
    }
    return { success: false, message: res.data.error || 'Mark dispatch failed' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 10: Get Integration Logs
async function testGetIntegrationLogs() {
  if (!AUTH_TOKEN) {
    return { success: false, message: 'No auth token' };
  }

  try {
    const res = await axios.get(`${BASE_URL}/integrations/logs`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
    });

    if (res.data.success && Array.isArray(res.data.data)) {
      return { success: true, message: `Found ${res.data.data.length} log entries` };
    }
    return { success: false, message: 'Invalid response format' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 11: Create Integration Channel
async function testCreateChannel() {
  if (!AUTH_TOKEN) {
    return { success: false, message: 'No auth token' };
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/integrations/channels`,
      {
        outletId: 43,
        channelName: 'swiggy',
        channelDisplayName: 'Swiggy Test',
        dynoOrderId: 'TEST_DYNO_ID',
        dynoAccessToken: 'test-access-token',
        propertyId: 'TEST_PROP_001',
        propertyName: 'Test Restaurant',
        webhookSecret: WEBHOOK_SECRET,
        autoAcceptOrders: false,
        autoPrintKot: true,
        defaultPrepTime: 20
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    if (res.data.success) {
      TEST_CHANNEL_ID = res.data.data?.id || TEST_CHANNEL_ID;
      return { success: true, message: `Channel ${res.data.message}` };
    }
    return { success: false, message: res.data.error || 'Create failed' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 12: Get Channels
async function testGetChannels() {
  if (!AUTH_TOKEN) {
    return { success: false, message: 'No auth token' };
  }

  try {
    const res = await axios.get(`${BASE_URL}/integrations/channels`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
    });

    if (res.data.success && Array.isArray(res.data.data)) {
      // Check that sensitive data is masked
      const channel = res.data.data[0];
      if (channel && channel.dyno_access_token && !channel.dyno_access_token.includes('***')) {
        return { success: false, message: 'Access token not masked!' };
      }
      return { success: true, message: `Found ${res.data.data.length} channels` };
    }
    return { success: false, message: 'Invalid response format' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 13: Order Cancellation from Platform
async function testPlatformCancellation() {
  // First create an order to cancel
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const externalOrderId = `CANCEL_TEST_${Date.now()}`;
  
  const createPayload = {
    event: 'order.new',
    timestamp: new Date().toISOString(),
    data: {
      platform: 'zomato',
      external_order_id: externalOrderId,
      customer: { name: 'Cancel Test', phone: '+919999999999' },
      items: [{ external_item_id: 'TEST_001', name: 'Test Item', quantity: 1, unit_price: 100, total_price: 100 }],
      payment: { method: 'prepaid', is_paid: true, total: 100 }
    }
  };

  const createSignature = generateSignature(createPayload, timestamp, WEBHOOK_SECRET);

  try {
    // Create order
    await axios.post(`${BASE_URL}/integrations/dyno/webhook`, createPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': createSignature,
        'X-Dyno-Timestamp': timestamp,
        'X-Dyno-Channel-Id': TEST_CHANNEL_ID || '1'
      }
    });

    // Now send cancellation
    const cancelTimestamp = Math.floor(Date.now() / 1000).toString();
    const cancelPayload = {
      event: 'order.cancelled',
      timestamp: new Date().toISOString(),
      data: {
        platform: 'zomato',
        external_order_id: externalOrderId,
        cancel_reason: 'Customer requested cancellation',
        cancelled_by: 'customer'
      }
    };

    const cancelSignature = generateSignature(cancelPayload, cancelTimestamp, WEBHOOK_SECRET);

    const cancelRes = await axios.post(`${BASE_URL}/integrations/dyno/webhook`, cancelPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': cancelSignature,
        'X-Dyno-Timestamp': cancelTimestamp,
        'X-Dyno-Channel-Id': TEST_CHANNEL_ID || '1'
      }
    });

    if (cancelRes.data.success) {
      return { success: true, message: 'Order cancelled successfully' };
    }
    return { success: false, message: 'Cancel failed' };
  } catch (e) {
    if (e.response?.status === 401) {
      return { success: false, message: 'Signature verification failed' };
    }
    return { success: false, message: e.message };
  }
}

// Test 14: Reject Order
async function testRejectOrder() {
  if (!AUTH_TOKEN) {
    return { success: false, message: 'No auth token' };
  }

  // Create a new order to reject
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const externalOrderId = `REJECT_TEST_${Date.now()}`;
  
  const payload = {
    event: 'order.new',
    timestamp: new Date().toISOString(),
    data: {
      platform: 'swiggy',
      external_order_id: externalOrderId,
      customer: { name: 'Reject Test', phone: '+919999999999' },
      items: [{ external_item_id: 'TEST_001', name: 'Test Item', quantity: 1, unit_price: 100, total_price: 100 }],
      payment: { method: 'prepaid', is_paid: true, total: 100 }
    }
  };

  const signature = generateSignature(payload, timestamp, WEBHOOK_SECRET);

  try {
    const createRes = await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': signature,
        'X-Dyno-Timestamp': timestamp,
        'X-Dyno-Channel-Id': TEST_CHANNEL_ID || '1'
      }
    });

    if (!createRes.data.data?.onlineOrderId) {
      return { success: false, message: 'Could not create order to reject' };
    }

    const orderId = createRes.data.data.onlineOrderId;

    const rejectRes = await axios.post(
      `${BASE_URL}/integrations/orders/${orderId}/reject`,
      { reason: 'Item out of stock - Test rejection' },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    if (rejectRes.data.success) {
      return { success: true, message: 'Order rejected successfully' };
    }
    return { success: false, message: rejectRes.data.error || 'Reject failed' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Test 15: Rate Limiting
async function testRateLimiting() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = { event: 'test', data: {} };
  const signature = generateSignature(payload, timestamp, WEBHOOK_SECRET);

  let rateLimited = false;
  
  try {
    // Send many requests quickly
    const promises = [];
    for (let i = 0; i < 110; i++) {
      promises.push(
        axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Dyno-Signature': signature,
            'X-Dyno-Timestamp': timestamp
          },
          validateStatus: () => true
        })
      );
    }

    const results = await Promise.all(promises);
    rateLimited = results.some(r => r.status === 429);

    if (rateLimited) {
      return { success: true, message: 'Rate limiting working correctly' };
    }
    return { success: false, message: 'Rate limiting not triggered (may need more requests)' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ========================
// MAIN TEST RUNNER
// ========================

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        DYNO INTEGRATION TEST SUITE                     ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  await setup();

  // Database Tests
  log('DATABASE TESTS', 'header');
  console.log('═'.repeat(50));
  await runTest('Database Tables Exist', testDatabaseTables);

  // Webhook Security Tests
  log('WEBHOOK SECURITY TESTS', 'header');
  console.log('═'.repeat(50));
  await runTest('Valid Signature Accepted', testWebhookValidSignature);
  await runTest('Invalid Signature Rejected', testWebhookInvalidSignature);
  await runTest('Expired Timestamp Rejected', testWebhookExpiredTimestamp);

  // Order Processing Tests
  log('ORDER PROCESSING TESTS', 'header');
  console.log('═'.repeat(50));
  await runTest('Duplicate Order Prevention', testDuplicateOrderPrevention);
  await runTest('Platform Cancellation', testPlatformCancellation);

  // Channel Management Tests
  log('CHANNEL MANAGEMENT TESTS', 'header');
  console.log('═'.repeat(50));
  if (AUTH_TOKEN) {
    await runTest('Create/Update Channel', testCreateChannel);
    await runTest('Get Channels (Masked Data)', testGetChannels);
  } else {
    await skipTest('Create/Update Channel', 'No auth token');
    await skipTest('Get Channels', 'No auth token');
  }

  // Order Management Tests
  log('ORDER MANAGEMENT TESTS', 'header');
  console.log('═'.repeat(50));
  if (AUTH_TOKEN) {
    await runTest('Get Active Orders', testGetActiveOrders);
    
    if (TEST_ONLINE_ORDER_ID) {
      await runTest('Accept Order', testAcceptOrder);
      await runTest('Mark Order Ready', testMarkOrderReady);
      await runTest('Mark Order Dispatched', testMarkOrderDispatched);
    } else {
      await skipTest('Accept Order', 'No test order created');
      await skipTest('Mark Order Ready', 'No test order created');
      await skipTest('Mark Order Dispatched', 'No test order created');
    }
    
    await runTest('Reject Order', testRejectOrder);
    await runTest('Get Integration Logs', testGetIntegrationLogs);
  } else {
    await skipTest('Get Active Orders', 'No auth token');
    await skipTest('Accept Order', 'No auth token');
    await skipTest('Mark Order Ready', 'No auth token');
    await skipTest('Mark Order Dispatched', 'No auth token');
    await skipTest('Reject Order', 'No auth token');
    await skipTest('Get Integration Logs', 'No auth token');
  }

  // Rate Limiting Test (optional - takes time)
  // log('RATE LIMITING TESTS', 'header');
  // console.log('═'.repeat(50));
  // await runTest('Rate Limiting', testRateLimiting);

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                        ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  ✓ Passed:  ${testResults.passed.toString().padEnd(5)}                                    ║`);
  console.log(`║  ✗ Failed:  ${testResults.failed.toString().padEnd(5)}                                    ║`);
  console.log(`║  ⚠ Skipped: ${testResults.skipped.toString().padEnd(5)}                                    ║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  // Exit with appropriate code
  if (testResults.failed > 0) {
    console.log('\n❌ Some tests failed. Please review the errors above.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
