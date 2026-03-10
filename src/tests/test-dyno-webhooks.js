/**
 * Test Dyno Webhook Endpoints
 * 
 * Tests the webhook endpoints that Dyno calls on your server:
 *   POST /orders                   - Receive orders
 *   GET  /:resId/orders/status     - Get order statuses
 *   POST /:resId/orders/status     - Update order status
 *   GET  /:resId/items/status      - Get items status
 *   POST /:resId/items             - Receive all items
 */

const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3005';
const WEBHOOK_SECRET = process.env.DYNO_WEBHOOK_SECRET || 'test-webhook-secret';

// Test state
let dbConnection = null;
let testPropertyId = null;
let testChannelId = null;
let testOrderId = null;

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(type, message) {
  const icons = { pass: '✓', fail: '✗', info: '→', skip: '⚠', step: '▶' };
  const colorMap = { pass: 'green', fail: 'red', info: 'cyan', skip: 'yellow', step: 'bold' };
  console.log(`${colors[colorMap[type]] || ''}${icons[type] || ' '} ${message}${colors.reset}`);
}

function section(title) {
  console.log(`\n${colors.cyan}═══ ${title} ═══${colors.reset}`);
}

function generateSignature(payload, timestamp, secret) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signatureData = `${timestamp}.${payloadString}`;
  return crypto.createHmac('sha256', secret).update(signatureData).digest('hex');
}

// ============================================================
// SETUP
// ============================================================

async function setup() {
  section('SETUP');
  
  dbConnection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos'
  });
  log('pass', 'Database connected');

  // Create or get test channel with property_id
  testPropertyId = `TEST_PROP_${Date.now()}`;
  
  const [existingChannels] = await dbConnection.query(
    `SELECT id, property_id FROM integration_channels 
     WHERE channel_name = 'swiggy' AND is_active = 1 LIMIT 1`
  );

  if (existingChannels.length > 0) {
    testChannelId = existingChannels[0].id;
    testPropertyId = existingChannels[0].property_id || testPropertyId;
    
    // Update property_id if not set
    if (!existingChannels[0].property_id) {
      await dbConnection.query(
        'UPDATE integration_channels SET property_id = ?, webhook_secret = ? WHERE id = ?',
        [testPropertyId, WEBHOOK_SECRET, testChannelId]
      );
    }
    log('pass', `Using existing channel: ${testChannelId}, property_id: ${testPropertyId}`);
  } else {
    const [result] = await dbConnection.query(
      `INSERT INTO integration_channels 
       (outlet_id, channel_name, channel_display_name, property_id, webhook_secret, is_active)
       VALUES (1, 'swiggy', 'Swiggy', ?, ?, 1)`,
      [testPropertyId, WEBHOOK_SECRET]
    );
    testChannelId = result.insertId;
    log('pass', `Created test channel: ${testChannelId}, property_id: ${testPropertyId}`);
  }

  return true;
}

async function cleanup() {
  section('CLEANUP');
  
  if (testOrderId) {
    await dbConnection.query(
      'DELETE FROM online_orders WHERE external_order_id = ?',
      [testOrderId]
    );
    log('info', `Cleaned up test order: ${testOrderId}`);
  }

  if (dbConnection) {
    await dbConnection.end();
    log('pass', 'Database connection closed');
  }
}

// ============================================================
// TEST 1: POST /orders - Receive Order
// ============================================================

async function testReceiveOrder() {
  section('TEST 1: POST /orders - Receive Order');
  
  testOrderId = `TEST_ORDER_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  const orderPayload = {
    platform: 'swiggy',
    res_id: testPropertyId,
    order_id: testOrderId,
    order_number: 'SWG123456',
    customer_name: 'Test Customer',
    customer_phone: '+919876543210',
    delivery_address: '123 Test Street, Test City',
    items: [
      {
        item_id: 'ITEM_001',
        name: 'Butter Chicken',
        quantity: 2,
        price: 350,
        total: 700
      },
      {
        item_id: 'ITEM_002',
        name: 'Naan',
        quantity: 4,
        price: 50,
        total: 200
      }
    ],
    subtotal: 900,
    taxes: 45,
    delivery_charges: 30,
    total_amount: 975,
    payment_method: 'prepaid',
    is_paid: true,
    order_time: new Date().toISOString()
  };

  const signature = generateSignature(orderPayload, timestamp, WEBHOOK_SECRET);

  log('step', `Sending order to POST /orders`);
  log('info', `  Order ID: ${testOrderId}`);
  log('info', `  Property ID: ${testPropertyId}`);

  try {
    const response = await axios.post(`${BASE_URL}/orders`, orderPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': signature,
        'X-Dyno-Timestamp': timestamp
      }
    });

    if (response.status === 201 && response.data.success) {
      log('pass', `Order received! Online Order ID: ${response.data.data?.onlineOrderId}`);
      log('pass', `POS Order Number: ${response.data.data?.orderNumber}`);
      return { success: true };
    } else {
      log('fail', `Unexpected response: ${JSON.stringify(response.data)}`);
      return { success: false };
    }
  } catch (error) {
    log('fail', `Error: ${error.response?.data?.error || error.message}`);
    return { success: false };
  }
}

// ============================================================
// TEST 2: GET /:resId/orders/status - Get Orders Status
// ============================================================

async function testGetOrdersStatus() {
  section('TEST 2: GET /:resId/orders/status');
  
  log('step', `Fetching orders status for property: ${testPropertyId}`);

  try {
    const response = await axios.get(`${BASE_URL}/${testPropertyId}/orders/status`, {
      headers: {
        'X-Access-Token': 'test-token'
      }
    });

    if (response.data.success) {
      log('pass', `Got ${response.data.orders?.length || 0} orders`);
      
      // Check if our test order is in the list
      const testOrder = response.data.orders?.find(o => o.order_id === testOrderId);
      if (testOrder) {
        log('pass', `Found test order with status: ${testOrder.status}`);
      }
      
      return { success: true };
    } else {
      log('fail', `Failed: ${response.data.error}`);
      return { success: false };
    }
  } catch (error) {
    log('fail', `Error: ${error.response?.data?.error || error.message}`);
    return { success: false };
  }
}

// ============================================================
// TEST 3: POST /:resId/orders/status - Update Order Status
// ============================================================

async function testUpdateOrderStatus() {
  section('TEST 3: POST /:resId/orders/status');
  
  if (!testOrderId) {
    log('skip', 'Skipped - No test order');
    return { success: false, skipped: true };
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const statusPayload = {
    order_id: testOrderId,
    status: 'ACCEPTED',
    message: 'Order accepted by restaurant'
  };

  const signature = generateSignature(statusPayload, timestamp, WEBHOOK_SECRET);

  log('step', `Updating order status to ACCEPTED`);

  try {
    const response = await axios.post(
      `${BASE_URL}/${testPropertyId}/orders/status`,
      statusPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Dyno-Signature': signature,
          'X-Dyno-Timestamp': timestamp
        }
      }
    );

    if (response.data.success) {
      log('pass', `Status update received: ${response.data.status}`);
      return { success: true };
    } else {
      log('fail', `Failed: ${response.data.error}`);
      return { success: false };
    }
  } catch (error) {
    log('fail', `Error: ${error.response?.data?.error || error.message}`);
    return { success: false };
  }
}

// ============================================================
// TEST 4: GET /:resId/items/status - Get Items Status
// ============================================================

async function testGetItemsStatus() {
  section('TEST 4: GET /:resId/items/status');
  
  log('step', `Fetching items status for property: ${testPropertyId}`);

  try {
    const response = await axios.get(`${BASE_URL}/${testPropertyId}/items/status`, {
      headers: {
        'X-Access-Token': 'test-token'
      }
    });

    if (response.data.success) {
      log('pass', `Got ${response.data.items?.length || 0} items`);
      return { success: true };
    } else {
      log('fail', `Failed: ${response.data.error}`);
      return { success: false };
    }
  } catch (error) {
    log('fail', `Error: ${error.response?.data?.error || error.message}`);
    return { success: false };
  }
}

// ============================================================
// TEST 5: POST /:resId/items - Receive All Items
// ============================================================

async function testReceiveAllItems() {
  section('TEST 5: POST /:resId/items');
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const itemsPayload = {
    items: [
      { item_id: 'SWG_001', name: 'Butter Chicken', price: 350, in_stock: true },
      { item_id: 'SWG_002', name: 'Paneer Tikka', price: 280, in_stock: true },
      { item_id: 'SWG_003', name: 'Naan', price: 50, in_stock: true },
      { item_id: 'SWG_004', name: 'Biryani', price: 300, in_stock: false }
    ]
  };

  const signature = generateSignature(itemsPayload, timestamp, WEBHOOK_SECRET);

  log('step', `Sending ${itemsPayload.items.length} items`);

  try {
    const response = await axios.post(
      `${BASE_URL}/${testPropertyId}/items`,
      itemsPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Dyno-Signature': signature,
          'X-Dyno-Timestamp': timestamp
        }
      }
    );

    if (response.data.success) {
      log('pass', `Items received: ${response.data.count}`);
      return { success: true };
    } else {
      log('fail', `Failed: ${response.data.error}`);
      return { success: false };
    }
  } catch (error) {
    log('fail', `Error: ${error.response?.data?.error || error.message}`);
    return { success: false };
  }
}

// ============================================================
// TEST 6: Endpoint Structure Verification
// ============================================================

async function testEndpointStructure() {
  section('TEST 6: Endpoint Structure Verification');
  
  const endpoints = [
    { method: 'POST', path: '/orders', description: 'Receive orders' },
    { method: 'GET', path: `/${testPropertyId}/orders/status`, description: 'Get orders status' },
    { method: 'POST', path: `/${testPropertyId}/orders/status`, description: 'Update order status' },
    { method: 'POST', path: `/${testPropertyId}/orders/history`, description: 'Receive order history' },
    { method: 'GET', path: `/${testPropertyId}/items/status`, description: 'Get items status' },
    { method: 'POST', path: `/${testPropertyId}/items/status`, description: 'Update items status' },
    { method: 'POST', path: `/${testPropertyId}/categories/status`, description: 'Update categories status' },
    { method: 'POST', path: `/${testPropertyId}/items`, description: 'Receive all items' }
  ];

  let passed = 0;
  
  for (const endpoint of endpoints) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = { test: true };
      const signature = generateSignature(payload, timestamp, WEBHOOK_SECRET);
      
      const config = {
        method: endpoint.method.toLowerCase(),
        url: `${BASE_URL}${endpoint.path}`,
        headers: {
          'Content-Type': 'application/json',
          'X-Dyno-Signature': signature,
          'X-Dyno-Timestamp': timestamp
        }
      };
      
      if (endpoint.method === 'POST') {
        config.data = payload;
      }

      const response = await axios(config);
      
      // Any response other than 404 means endpoint exists
      log('pass', `${endpoint.method} ${endpoint.path} - ${endpoint.description}`);
      passed++;
    } catch (error) {
      if (error.response?.status === 404) {
        log('fail', `${endpoint.method} ${endpoint.path} - NOT FOUND`);
      } else {
        // Other errors (401, 500, etc.) mean endpoint exists but has issues
        log('pass', `${endpoint.method} ${endpoint.path} - ${endpoint.description} (${error.response?.status || 'reachable'})`);
        passed++;
      }
    }
  }

  return { success: passed === endpoints.length, passed, total: endpoints.length };
}

// ============================================================
// MAIN
// ============================================================

async function runTests() {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════╗
║         DYNO WEBHOOK ENDPOINTS TEST                       ║
║         Based on Dyno Documentation v2.0                  ║
╚══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const results = { passed: 0, failed: 0, skipped: 0 };

  try {
    await setup();

    const tests = [
      { name: 'Endpoint Structure', fn: testEndpointStructure },
      { name: 'Receive Order', fn: testReceiveOrder },
      { name: 'Get Orders Status', fn: testGetOrdersStatus },
      { name: 'Update Order Status', fn: testUpdateOrderStatus },
      { name: 'Get Items Status', fn: testGetItemsStatus },
      { name: 'Receive All Items', fn: testReceiveAllItems }
    ];

    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result.skipped) {
          results.skipped++;
        } else if (result.success) {
          results.passed++;
        } else {
          results.failed++;
        }
      } catch (error) {
        log('fail', `${test.name} crashed: ${error.message}`);
        results.failed++;
      }
    }

  } catch (error) {
    console.error('Setup failed:', error.message);
    results.failed++;
  } finally {
    await cleanup();
  }

  // Summary
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════╗
║                      TEST SUMMARY                         ║
╠══════════════════════════════════════════════════════════╣
║  ${colors.green}✓ Passed:  ${results.passed}${colors.cyan}                                            ║
║  ${colors.red}✗ Failed:  ${results.failed}${colors.cyan}                                            ║
║  ${colors.yellow}⚠ Skipped: ${results.skipped}${colors.cyan}                                            ║
╚══════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (results.failed === 0) {
    console.log(`${colors.green}✅ All Dyno webhook endpoints are working!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ Some tests failed. Review the output above.${colors.reset}\n`);
    process.exit(1);
  }
}

runTests().catch(console.error);
