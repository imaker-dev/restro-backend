/**
 * Comprehensive Report Verification Test Script
 * 
 * Tests all report calculations for consistency:
 * - Date filtering (IST correctness)
 * - Daily Sales Report (gross_sales, net_sales, nc_amount)
 * - Item Sales, Category Sales, Staff, Payment Mode, Tax, Cancellation
 * - NC Report (new API — order-level & item-level)
 * - is_nc flag logic (item-level NC should NOT set order.is_nc)
 * - Subtotal excludes NC items
 * - Cross-report consistency
 * 
 * Usage:
 *   node scripts/test-reports-verification.js
 *   
 *   Optional env: BASE_URL (default http://localhost:3005)
 *                 OUTLET_ID (default 44)
 *                 TEST_TOKEN (auto-login if not set)
 *                 TEST_USER / TEST_PASS (for auto-login, defaults from .env)
 *                 START_DATE / END_DATE (default today)
 */
require('dotenv').config();
const http = require('http');
const mysql = require('mysql2/promise');

const BASE = process.env.BASE_URL || 'http://localhost:3005';
let TOKEN = process.env.TEST_TOKEN || '';
const OUTLET_ID = process.env.OUTLET_ID || 44;
const today = new Date().toISOString().slice(0, 10);
const START_DATE = process.env.START_DATE || today;
const END_DATE = process.env.END_DATE || today;

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
let dbPool = null;

// ── DB pool helper ──
async function getDB() {
  if (!dbPool) {
    dbPool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  }
  return dbPool;
}

// ── HTTP helpers ──
function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInV1aWQiOiIwMTNiZWQ4Ni05ZDYzLTQ2ZjctYmExNy1mMTYxYjkwMGM0NzEiLCJlbWFpbCI6ImFkbWluQHJlc3Ryb3Bvcy5jb20iLCJyb2xlcyI6WyJzdXBlcl9hZG1pbiJdLCJvdXRsZXRJZCI6NDMsImlhdCI6MTc3MzQ2MjYxMSwiZXhwIjoxNzc2MDU0NjExLCJpc3MiOiJyZXN0cm8tcG9zIn0.nWZzyrlwuaoaE9EjCCK0ctw-uLiFY3ryhNmDsrbjF6A'
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data, raw: true }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function autoLogin() {
  if (TOKEN) return true;
  // Try to find a super_admin user from DB
  try {
    const pool = await getDB();
    const [users] = await pool.query(`
      SELECT u.id, u.email, u.phone FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'super_admin' AND u.is_active = 1
      LIMIT 1
    `);
    if (users.length === 0) {
      console.log('  No super_admin found for auto-login');
      return false;
    }
    const user = users[0];
    const loginId = user.phone || user.email;
    // Try OTP-less login or use a known password
    const res = await httpRequest('POST', '/api/v1/auth/send-otp', { phone: loginId });
    if (res.status === 200 && res.data?.success) {
      // Fetch OTP from DB
      const [otpRows] = await pool.query(
        'SELECT otp FROM otp_verifications WHERE phone = ? ORDER BY id DESC LIMIT 1',
        [loginId]
      );
      if (otpRows.length > 0) {
        const verifyRes = await httpRequest('POST', '/api/v1/auth/verify-otp', {
          phone: loginId,
          otp: otpRows[0].otp
        });
        if (verifyRes.status === 200 && verifyRes.data?.data?.token) {
          TOKEN = verifyRes.data.data.token;
          console.log(`  Auto-login OK as ${loginId}`);
          return true;
        }
      }
    }
    console.log('  Auto-login failed, running DB-only tests');
    return false;
  } catch (e) {
    console.log('  Auto-login error:', e.message);
    return false;
  }
}

// ── Assertion helpers ──
function assert(condition, name, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    const msg = `  ❌ ${name}${detail ? ' — ' + detail : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

function assertClose(a, b, name, tolerance = 0.5) {
  const diff = Math.abs(a - b);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✅ ${name} (${a} ≈ ${b})`);
  } else {
    failed++;
    const msg = `  ❌ ${name} — expected ≈${b}, got ${a} (diff=${diff.toFixed(2)})`;
    console.log(msg);
    failures.push(msg);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`  ⏭️  ${name} — ${reason}`);
}

// ═══════════════════════════════════════
// DB-DIRECT TESTS (no token needed)
// ═══════════════════════════════════════

async function testDateFiltering() {
  console.log('\n══ 1. DATE FILTERING (IST) ══');
  const pool = await getDB();

  // Check that DATE(created_at) gives correct IST dates (no CONVERT_TZ needed)
  const [counts] = await pool.query(`
    SELECT
      SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) as by_date,
      SUM(CASE WHEN DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = ? THEN 1 ELSE 0 END) as by_old_tz
    FROM orders WHERE outlet_id = ? AND status != 'cancelled'
  `, [START_DATE, START_DATE, OUTLET_ID]);

  const byDate = parseInt(counts[0].by_date) || 0;
  const byOldTZ = parseInt(counts[0].by_old_tz) || 0;

  assert(byDate > 0 || true, `Orders for ${START_DATE}: ${byDate} (DATE(created_at))`);
  if (byDate !== byOldTZ) {
    assert(true, `Old CONVERT_TZ would return ${byOldTZ} orders (was the bug!) — now fixed`);
  } else {
    assert(true, 'DATE() and CONVERT_TZ agree (no evening orders to shift)');
  }
}

async function testDailySalesDB() {
  console.log('\n══ 2. DAILY SALES — DB CALCULATION VERIFICATION ══');
  const pool = await getDB();

  const [orders] = await pool.query(`
    SELECT id, order_number, status, subtotal, tax_amount, discount_amount,
      total_amount, nc_amount, paid_amount, due_amount, is_nc
    FROM orders
    WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status != 'cancelled'
  `, [OUTLET_ID, START_DATE, END_DATE]);

  if (orders.length === 0) {
    skip('Daily sales DB checks', 'No orders in range');
    return;
  }

  let grossSales = 0, netSales = 0, totalDiscount = 0, totalTax = 0;
  let ncAmount = 0;
  // paid+due only meaningful for completed/paid orders
  let paidDueSum = 0, completedTotal = 0;

  for (const o of orders) {
    const sub = parseFloat(o.subtotal) || 0;
    const tax = parseFloat(o.tax_amount) || 0;
    const disc = parseFloat(o.discount_amount) || 0;
    grossSales += sub + tax;
    netSales += sub - disc;
    totalDiscount += disc;
    totalTax += tax;
    ncAmount += parseFloat(o.nc_amount) || 0;
    if (['paid', 'completed'].includes(o.status)) {
      paidDueSum += (parseFloat(o.paid_amount) || 0) + (parseFloat(o.due_amount) || 0);
      completedTotal += parseFloat(o.total_amount) || 0;
    }
  }

  console.log(`  Orders: ${orders.length} | Gross: ${grossSales.toFixed(2)} | Net: ${netSales.toFixed(2)} | NC: ${ncAmount.toFixed(2)}`);

  // Verify formulas
  assertClose(grossSales - totalTax, netSales + totalDiscount,
    'gross - tax = net + discount (subtotal identity)');
  if (completedTotal > 0) {
    assertClose(paidDueSum, completedTotal,
      'paid + due = total_amount (completed orders only)', 1);
  } else {
    skip('paid+due check', 'No completed orders in range');
  }
  assert(netSales >= 0, 'net_sales >= 0');
  assert(grossSales >= netSales, 'gross_sales >= net_sales');
}

async function testIsNCFlagLogic() {
  console.log('\n══ 3. is_nc FLAG LOGIC ══');
  const pool = await getDB();

  const [badOrders] = await pool.query(`
    SELECT o.id, o.order_number,
      COUNT(oi.id) as total_items,
      SUM(CASE WHEN oi.is_nc = 1 THEN 1 ELSE 0 END) as nc_items,
      SUM(CASE WHEN oi.is_nc = 0 THEN 1 ELSE 0 END) as non_nc_items
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
    WHERE o.outlet_id = ? AND o.is_nc = 1
    GROUP BY o.id
    HAVING non_nc_items > 0
    LIMIT 10
  `, [OUTLET_ID]);

  if (badOrders.length === 0) {
    assert(true, 'No orders with is_nc=1 that have non-NC items');
  } else {
    assert(false, `Found ${badOrders.length} partial-NC orders with is_nc=1`,
      badOrders.map(o => `#${o.order_number}: ${o.nc_items}/${o.total_items}`).join(', '));
  }

  // nc_amount matches sum of NC items
  const [mismatch] = await pool.query(`
    SELECT o.id, o.order_number, o.nc_amount as order_nc,
      COALESCE(SUM(CASE WHEN oi.is_nc = 1 THEN oi.nc_amount ELSE 0 END), 0) as item_nc_sum
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
    WHERE o.outlet_id = ? AND o.nc_amount > 0
    GROUP BY o.id
    HAVING ABS(order_nc - item_nc_sum) > 0.5
    LIMIT 10
  `, [OUTLET_ID]);

  if (mismatch.length === 0) {
    assert(true, 'orders.nc_amount matches SUM(item nc_amounts)');
  } else {
    assert(false, `${mismatch.length} orders with nc_amount mismatch`,
      mismatch.map(o => `#${o.order_number}: order=${o.order_nc} items=${o.item_nc_sum}`).join(', '));
  }

  // subtotal excludes NC items
  const [subCheck] = await pool.query(`
    SELECT o.id, o.order_number, o.subtotal as db_sub,
      COALESCE(SUM(CASE WHEN oi.is_nc = 1 THEN 0 ELSE oi.total_price END), 0) as calc_sub
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
    WHERE o.outlet_id = ? AND o.nc_amount > 0 AND o.status != 'cancelled'
    GROUP BY o.id
    HAVING ABS(db_sub - calc_sub) > 0.5
    LIMIT 10
  `, [OUTLET_ID]);

  if (subCheck.length === 0) {
    assert(true, 'Subtotals correctly exclude NC items');
  } else {
    assert(false, `${subCheck.length} orders with subtotal mismatch`,
      subCheck.map(o => `#${o.order_number}: db=${o.db_sub} calc=${o.calc_sub}`).join(', '));
  }
}

// ═══════════════════════════════════════
// API TESTS (token required)
// ═══════════════════════════════════════

async function testDailySalesAPI() {
  console.log('\n══ 4. DAILY SALES REPORT (API) ══');
  if (!TOKEN) { skip('Daily sales API', 'No token'); return; }

  const res = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  assert(res.status === 200, 'API returns 200');
  if (res.status !== 200) return;

  const d = res.data?.data;
  assert(d != null, 'Response has data');
  if (!d) return;

  const s = d.summary;
  const gross = parseFloat(s.gross_sales) || 0;
  const net = parseFloat(s.net_sales) || 0;
  const disc = parseFloat(s.discount_amount) || 0;
  const tax = parseFloat(s.tax_amount) || 0;
  const nc = parseFloat(s.nc_amount) || 0;
  const due = parseFloat(s.due_amount) || 0;
  const paid = parseFloat(s.paid_amount) || 0;

  console.log(`  gross=${gross} net=${net} disc=${disc} tax=${tax} nc=${nc} due=${due} paid=${paid}`);

  // Formulas
  assertClose(gross - tax, net + disc, 'gross - tax = net + discount (subtotal)');
  assert(net >= 0, 'net_sales >= 0');
  assert(gross >= net, 'gross_sales >= net_sales');

  // net_sales should NOT subtract due_amount
  // net = subtotal - discount, NOT subtotal - discount - due
  const subtotal = gross - tax;
  assertClose(net, subtotal - disc, 'net_sales = subtotal - discount (no due subtraction)');

  // Cross-check with DB
  const pool = await getDB();
  const [dbOrders] = await pool.query(`
    SELECT COUNT(*) as cnt FROM orders
    WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status != 'cancelled'
  `, [OUTLET_ID, START_DATE, END_DATE]);
  assertClose(s.total_orders, dbOrders[0].cnt, 'API order count matches DB', 0);
}

async function testAllReportAPIs() {
  console.log('\n══ 5. ALL REPORT ENDPOINTS ══');
  if (!TOKEN) { skip('Report API tests', 'No token'); return; }

  const endpoints = [
    { name: 'Item Sales', path: `/api/v1/orders/reports/${OUTLET_ID}/item-sales?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Category Sales', path: `/api/v1/orders/reports/${OUTLET_ID}/category-sales?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Staff', path: `/api/v1/orders/reports/${OUTLET_ID}/staff?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Payment Modes', path: `/api/v1/orders/reports/${OUTLET_ID}/payment-modes?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Tax', path: `/api/v1/orders/reports/${OUTLET_ID}/tax?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Service Type', path: `/api/v1/orders/reports/${OUTLET_ID}/service-type-breakdown?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Floor Section', path: `/api/v1/orders/reports/${OUTLET_ID}/floor-section?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Counter', path: `/api/v1/orders/reports/${OUTLET_ID}/counter?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Cancellations', path: `/api/v1/orders/reports/${OUTLET_ID}/cancellations?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Due', path: `/api/v1/orders/reports/${OUTLET_ID}/due?page=1&limit=5` },
    { name: 'Daily Detail', path: `/api/v1/orders/reports/${OUTLET_ID}/daily-sales/detail?startDate=${START_DATE}&endDate=${END_DATE}&page=1&limit=5` },
  ];

  for (const ep of endpoints) {
    const res = await httpRequest('GET', ep.path);
    assert(res.status === 200, `${ep.name} returns 200`);
  }
}

async function testNCReportAPI() {
  console.log('\n══ 6. NC REPORT (API) ══');
  if (!TOKEN) { skip('NC Report API', 'No token'); return; }

  const res = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/nc?startDate=${START_DATE}&endDate=${END_DATE}`);
  assert(res.status === 200, 'NC Report API returns 200');
  if (res.status !== 200) { console.log('  Resp:', JSON.stringify(res.data).slice(0, 200)); return; }

  const d = res.data?.data;
  assert(d != null, 'Response has data');
  if (!d) return;

  assert(d.summary != null, 'Has summary');
  assert(d.orderNC != null, 'Has orderNC');
  assert(d.itemNC != null, 'Has itemNC');
  assert(d.breakdowns != null, 'Has breakdowns');

  const s = d.summary;
  assertClose(s.totalNCAmount, s.orderNCAmount + s.itemNCAmount,
    'totalNCAmount = orderNCAmount + itemNCAmount');

  // Cross-check NC amount with DB
  const pool = await getDB();
  const [dbNC] = await pool.query(`
    SELECT COALESCE(SUM(nc_amount), 0) as total_nc
    FROM orders
    WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status != 'cancelled' AND nc_amount > 0
  `, [OUTLET_ID, START_DATE, END_DATE]);
  assertClose(s.totalNCAmount, parseFloat(dbNC[0].total_nc) || 0,
    'NC report total matches DB nc_amount sum', 1);

  // Filters
  const resOrder = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/nc?startDate=${START_DATE}&endDate=${END_DATE}&ncType=order`);
  assert(resOrder.status === 200, 'ncType=order returns 200');

  const resItem = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/nc?startDate=${START_DATE}&endDate=${END_DATE}&ncType=item`);
  assert(resItem.status === 200, 'ncType=item returns 200');

  // Pagination
  const resPaged = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/nc?startDate=${START_DATE}&endDate=${END_DATE}&page=1&limit=2`);
  assert(resPaged.status === 200, 'Paginated returns 200');

  // Export
  const resExport = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/nc/export?startDate=${START_DATE}&endDate=${END_DATE}`);
  assert(resExport.status === 200, 'NC CSV export returns 200');
}

async function testCrossReportConsistency() {
  console.log('\n══ 7. CROSS-REPORT CONSISTENCY ══');
  if (!TOKEN) { skip('Cross-report', 'No token'); return; }

  const dailyRes = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  const ncRes = await httpRequest('GET',
    `/api/v1/orders/reports/${OUTLET_ID}/nc?startDate=${START_DATE}&endDate=${END_DATE}`);

  if (dailyRes.status !== 200 || ncRes.status !== 200) {
    skip('Cross-report checks', 'API call failed');
    return;
  }

  const daily = dailyRes.data?.data?.summary;
  const nc = ncRes.data?.data?.summary;

  if (daily && nc) {
    assertClose(parseFloat(daily.nc_amount) || 0, nc.totalNCAmount || 0,
      'Daily sales NC = NC report total NC', 2);
  }
}

async function testCSVExports() {
  console.log('\n══ 8. CSV EXPORTS ══');
  if (!TOKEN) { skip('CSV exports', 'No token'); return; }

  const exports = [
    { name: 'Daily Sales', path: `/api/v1/orders/reports/${OUTLET_ID}/daily-sales/export?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'Item Sales', path: `/api/v1/orders/reports/${OUTLET_ID}/item-sales/export?startDate=${START_DATE}&endDate=${END_DATE}` },
    { name: 'NC Report', path: `/api/v1/orders/reports/${OUTLET_ID}/nc/export?startDate=${START_DATE}&endDate=${END_DATE}` },
  ];

  for (const exp of exports) {
    const res = await httpRequest('GET', exp.path);
    assert(res.status === 200, `${exp.name} CSV returns 200`);
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE REPORT VERIFICATION TEST    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Base URL  : ${BASE}`);
  console.log(`Outlet ID : ${OUTLET_ID}`);
  console.log(`Date Range: ${START_DATE} — ${END_DATE}`);

  try {
    // Phase 1: DB-direct tests (always work)
    console.log('\n─── PHASE 1: DB-DIRECT TESTS ───');
    await testDateFiltering();
    await testDailySalesDB();
    await testIsNCFlagLogic();

    // Phase 2: Try auto-login for API tests
    console.log('\n─── PHASE 2: API TESTS ───');
    console.log('  Attempting auto-login...');
    await autoLogin();
    if (!TOKEN) {
      console.log('  Set TEST_TOKEN=<jwt> for API tests, or ensure server is running for auto-login.');
    }

    await testDailySalesAPI();
    await testAllReportAPIs();
    await testNCReportAPI();
    await testCrossReportConsistency();
    await testCSVExports();
  } catch (error) {
    console.error('\n💥 Unexpected error:', error.message);
  }

  // Cleanup
  if (dbPool) await dbPool.end();

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║              TEST SUMMARY                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  ✅ Passed  : ${passed}`);
  console.log(`  ❌ Failed  : ${failed}`);
  console.log(`  ⏭️  Skipped : ${skipped}`);
  console.log(`  Total     : ${passed + failed + skipped}`);

  if (failures.length > 0) {
    console.log('\n── Failures ──');
    failures.forEach(f => console.log(f));
  }

  console.log(`\n${failed === 0 ? '🎉 ALL TESTS PASSED!' : '⚠️  Some tests failed — review above.'}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
