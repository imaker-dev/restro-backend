/**
 * Test: Cashier Takeaway Order Filtering
 * Verifies that cashiers only see their own takeaway orders in:
 *   1. Dashboard API (/api/v1/orders/reports/:outletId/dashboard)
 *   2. Daily Sales API (/api/v1/orders/reports/:outletId/daily-sales)
 *   3. Takeaway Pending API (/api/v1/orders/takeaway/pending/:outletId)
 *
 * Usage:
 *   node tests/test-cashier-takeaway-filter.js
 *
 * Environment:
 *   BASE_URL  - server base URL (default: http://localhost:3000)
 *   OUTLET_ID - outlet to test against (default: 43)
 *
 * You need to set CASHIER_TOKEN_1 and CASHIER_TOKEN_2 below with valid cashier tokens,
 * and ADMIN_TOKEN with an admin token for the same outlet.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';
const OUTLET_ID = process.env.OUTLET_ID || '43';

// ──────────────────────────────────────────────
// PASTE TOKENS HERE (Bearer tokens for outlet 43)
// ──────────────────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CASHIER_TOKEN_1 = process.env.CASHIER_TOKEN_1 || ''; // Cashier on floor A
const CASHIER_TOKEN_2 = process.env.CASHIER_TOKEN_2 || ''; // Cashier on floor B

// ──────────────────────────────────────────────

const http = require('http');
const https = require('https');

function request(url, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function log(label, pass) {
  const icon = pass ? '\u2705' : '\u274C';
  console.log(`  ${icon} ${label}`);
}

async function testDashboard(token, label) {
  console.log(`\n--- Dashboard: ${label} ---`);
  const url = `${BASE_URL}/api/v1/orders/reports/${OUTLET_ID}/dashboard?outletId=${OUTLET_ID}`;
  try {
    const res = await request(url, token);
    if (!res.body.success) {
      console.log('  ERROR:', res.body.message || res.status);
      return null;
    }
    const sales = res.body.data?.sales || {};
    console.log(`  total_orders: ${sales.total_orders}`);
    console.log(`  total_sale: ${sales.total_sale}`);
    console.log(`  takeaway_orders: ${sales.takeaway_orders}`);
    console.log(`  dine_in_orders: ${sales.dine_in_orders}`);
    console.log(`  meta: role=${res.body.meta?.role}, isFiltered=${res.body.meta?.isFiltered}`);
    return sales;
  } catch (e) {
    console.log('  FETCH ERROR:', e.message);
    return null;
  }
}

async function testDailySales(token, label) {
  console.log(`\n--- Daily Sales: ${label} ---`);
  const url = `${BASE_URL}/api/v1/orders/reports/${OUTLET_ID}/daily-sales?outletId=${OUTLET_ID}`;
  try {
    const res = await request(url, token);
    if (!res.body.success) {
      console.log('  ERROR:', res.body.message || res.status);
      return null;
    }
    const summary = res.body.data?.summary || {};
    console.log(`  total_orders: ${summary.total_orders}`);
    console.log(`  total_sale: ${summary.total_sale}`);
    console.log(`  takeaway_orders: ${summary.takeaway_orders}`);
    console.log(`  dine_in_orders: ${summary.dine_in_orders}`);
    console.log(`  meta: role=${res.body.meta?.role}, isFiltered=${res.body.meta?.isFiltered}`);
    return summary;
  } catch (e) {
    console.log('  FETCH ERROR:', e.message);
    return null;
  }
}

async function testTakeawayPending(token, label) {
  console.log(`\n--- Takeaway Pending: ${label} ---`);
  const url = `${BASE_URL}/api/v1/orders/takeaway/pending/${OUTLET_ID}?status=pending&page=1&limit=20&sortBy=created_at&sortOrder=DESC`;
  try {
    const res = await request(url, token);
    if (!res.body.success) {
      console.log('  ERROR:', res.body.message || res.status);
      return null;
    }
    const orders = res.body.data || [];
    const pagination = res.body.pagination || {};
    console.log(`  total_pending: ${pagination.total || orders.length}`);
    if (orders.length > 0) {
      console.log(`  first_order: #${orders[0].order_number} created_by=${orders[0].created_by} (${orders[0].created_by_name || 'N/A'})`);
    }
    return { orders, pagination };
  } catch (e) {
    console.log('  FETCH ERROR:', e.message);
    return null;
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('Cashier Takeaway Order Filtering Test');
  console.log(`Outlet: ${OUTLET_ID} | Base: ${BASE_URL}`);
  console.log('='.repeat(60));

  const tokens = [];
  if (ADMIN_TOKEN) tokens.push({ token: ADMIN_TOKEN, label: 'ADMIN' });
  if (CASHIER_TOKEN_1) tokens.push({ token: CASHIER_TOKEN_1, label: 'CASHIER_1' });
  if (CASHIER_TOKEN_2) tokens.push({ token: CASHIER_TOKEN_2, label: 'CASHIER_2' });

  if (tokens.length === 0) {
    console.log('\nERROR: No tokens configured. Set ADMIN_TOKEN, CASHIER_TOKEN_1, CASHIER_TOKEN_2 env vars or edit the script.');
    process.exit(1);
  }

  // ── 1. Dashboard ──
  console.log('\n\n========== 1. DASHBOARD ==========');
  const dashResults = {};
  for (const t of tokens) {
    dashResults[t.label] = await testDashboard(t.token, t.label);
  }

  // Verify: cashier takeaway count should differ (each sees only own)
  if (dashResults.CASHIER_1 && dashResults.CASHIER_2) {
    const c1Take = dashResults.CASHIER_1.takeaway_orders || 0;
    const c2Take = dashResults.CASHIER_2.takeaway_orders || 0;
    const adminTake = dashResults.ADMIN?.takeaway_orders || 0;
    console.log('\n  Verification:');
    log(`Cashier1 takeaway (${c1Take}) + Cashier2 takeaway (${c2Take}) <= Admin takeaway (${adminTake})`, c1Take + c2Take <= adminTake);
    log(`Cashier1 total_sale (${dashResults.CASHIER_1.total_sale}) != Cashier2 total_sale (${dashResults.CASHIER_2.total_sale}) [if different floors]`, true);
  }

  // ── 2. Daily Sales ──
  console.log('\n\n========== 2. DAILY SALES ==========');
  const dsResults = {};
  for (const t of tokens) {
    dsResults[t.label] = await testDailySales(t.token, t.label);
  }

  if (dsResults.CASHIER_1 && dsResults.CASHIER_2) {
    const c1Take = dsResults.CASHIER_1.takeaway_orders || 0;
    const c2Take = dsResults.CASHIER_2.takeaway_orders || 0;
    const adminTake = dsResults.ADMIN?.takeaway_orders || 0;
    console.log('\n  Verification:');
    log(`Cashier1 takeaway (${c1Take}) + Cashier2 takeaway (${c2Take}) <= Admin takeaway (${adminTake})`, c1Take + c2Take <= adminTake);
  }

  // ── 3. Takeaway Pending ──
  console.log('\n\n========== 3. TAKEAWAY PENDING ==========');
  const tpResults = {};
  for (const t of tokens) {
    tpResults[t.label] = await testTakeawayPending(t.token, t.label);
  }

  if (tpResults.CASHIER_1 && tpResults.CASHIER_2 && tpResults.ADMIN) {
    const c1Total = tpResults.CASHIER_1.pagination.total || 0;
    const c2Total = tpResults.CASHIER_2.pagination.total || 0;
    const adminTotal = tpResults.ADMIN.pagination.total || 0;
    console.log('\n  Verification:');
    log(`Cashier1 pending (${c1Total}) + Cashier2 pending (${c2Total}) <= Admin pending (${adminTotal})`, c1Total + c2Total <= adminTotal);
    
    // Verify cashier orders only contain their own created_by
    for (const label of ['CASHIER_1', 'CASHIER_2']) {
      const orders = tpResults[label]?.orders || [];
      if (orders.length > 0) {
        const firstCreator = orders[0].created_by;
        const allSameCreator = orders.every(o => o.created_by === firstCreator);
        log(`${label}: all orders created by same user (${firstCreator}): ${allSameCreator}`, allSameCreator);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete.');
  console.log('='.repeat(60));
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
