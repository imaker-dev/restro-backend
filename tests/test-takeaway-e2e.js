/**
 * E2E Test: Cashier Takeaway Order Isolation
 *
 * Flow:
 *   1. Login as Admin, Cashier1, Cashier2
 *   2. Snapshot baseline dashboard/daily-sales/takeaway-pending for each
 *   3. Cashier1 creates a takeaway order + adds items + generates bill + pays
 *   4. Cashier2 creates a takeaway order + adds items + generates bill + pays
 *   5. Re-fetch dashboard/daily-sales/takeaway-pending for each
 *   6. Cross-verify:
 *      - Admin totals increased by both orders
 *      - Cashier1 totals increased ONLY by their order
 *      - Cashier2 totals increased ONLY by their order
 *      - Takeaway pending: each cashier sees only own orders
 *
 * Usage:  node tests/test-takeaway-e2e.js
 */

const http = require('http');
const HOST = 'localhost';
const PORT = 3005;
const OUTLET_ID = 43;

// Menu items for outlet 43
const ITEM_A = { itemId: 1435, quantity: 1 }; // Chilli Chicken Dry Rs.319
const ITEM_B = { itemId: 1437, quantity: 2 }; // Chicken 65 Rs.319 x 2

const USERS = {
  admin:    { code: 'admin-001',   pin: '1111' },
  cashier1: { code: 'cashier-001', pin: '1111' },
  cashier2: { code: 'cashier-002', pin: '1111' }
};

// ───── HTTP helpers ─────

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST, port: PORT, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const GET  = (path, token) => req('GET',  path, null, token);
const POST = (path, body, token) => req('POST', path, body, token);

// Add cache-busting param to bypass Redis report cache
let cbCounter = 0;
function cb(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_t=${Date.now()}_${cbCounter++}`;
}

// ───── Auth ─────

async function login(code, pin) {
  const res = await POST('/api/v1/auth/login/pin', { employeeCode: code, pin, outletId: OUTLET_ID });
  if (!res.body.success) throw new Error(`Login failed for ${code}: ${res.body.message}`);
  return {
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    name: res.body.data.user.name,
    roles: res.body.data.user.roles,
    floors: res.body.data.user.assignedFloors
  };
}

// ───── Data fetchers ─────

async function getDashboard(token) {
  const res = await GET(cb(`/api/v1/orders/reports/${OUTLET_ID}/dashboard`), token);
  if (!res.body.success) throw new Error('Dashboard failed: ' + (res.body.message || res.status));
  return res.body.data.sales;
}

async function getDailySales(token) {
  const res = await GET(cb(`/api/v1/orders/reports/${OUTLET_ID}/daily-sales`), token);
  if (!res.body.success) throw new Error('Daily sales failed: ' + (res.body.message || res.status));
  return res.body.data.summary;
}

async function getTakeawayPending(token, status = 'all') {
  const res = await GET(cb(`/api/v1/orders/takeaway/pending/${OUTLET_ID}?status=${status}&page=1&limit=100`), token);
  if (!res.body.success) throw new Error('Takeaway pending failed: ' + (res.body.message || res.status));
  return { orders: res.body.data || [], total: res.body.pagination?.total || 0 };
}

// ───── Order flow ─────

async function createTakeawayOrder(token, items, customerName) {
  // Step 1: Create order
  const createRes = await POST('/api/v1/orders', {
    outletId: OUTLET_ID,
    orderType: 'takeaway',
    customerName,
    guestCount: 1
  }, token);
  if (!createRes.body.success) throw new Error('Create order failed: ' + JSON.stringify(createRes.body));
  const orderId = createRes.body.data.id || createRes.body.data.orderId;
  console.log(`    Created order #${createRes.body.data.orderNumber || orderId}`);

  // Step 2: Add items
  const addRes = await POST(`/api/v1/orders/${orderId}/items`, { items }, token);
  if (!addRes.body.success) throw new Error('Add items failed: ' + JSON.stringify(addRes.body));
  console.log(`    Added ${items.length} item(s)`);

  // Step 3: Generate bill
  const billRes = await POST(`/api/v1/orders/${orderId}/bill`, {}, token);
  if (!billRes.body.success) throw new Error('Bill failed: ' + JSON.stringify(billRes.body));
  const invoiceId = billRes.body.data?.invoiceId || billRes.body.data?.invoice?.id || billRes.body.data?.id;
  const grandTotal = parseFloat(billRes.body.data?.grandTotal || billRes.body.data?.invoice?.grand_total || 0);
  console.log(`    Bill generated — invoiceId=${invoiceId} grandTotal=${grandTotal}`);

  // Step 4: Process payment
  const payRes = await POST('/api/v1/orders/payment', {
    orderId,
    invoiceId,
    outletId: OUTLET_ID,
    paymentMode: 'cash',
    amount: grandTotal
  }, token);
  if (!payRes.body.success) throw new Error('Payment failed: ' + JSON.stringify(payRes.body));
  console.log(`    Payment done (cash Rs.${grandTotal})`);

  return { orderId, invoiceId, grandTotal };
}

// ───── Assertion helpers ─────

let passCount = 0, failCount = 0;
function assert(label, actual, expected, tolerance = 0) {
  const pass = tolerance > 0
    ? Math.abs(actual - expected) <= tolerance
    : actual === expected;
  if (pass) { passCount++; console.log(`  ✅ ${label}`); }
  else      { failCount++; console.log(`  ❌ ${label}  (got ${actual}, expected ${expected})`); }
}

function assertGte(label, actual, expected) {
  if (actual >= expected) { passCount++; console.log(`  ✅ ${label}`); }
  else                    { failCount++; console.log(`  ❌ ${label}  (got ${actual}, expected >= ${expected})`); }
}

// ───── Main ─────

async function main() {
  console.log('═'.repeat(60));
  console.log(' E2E: Cashier Takeaway Order Isolation — Outlet ' + OUTLET_ID);
  console.log('═'.repeat(60));

  // 1. Login
  console.log('\n── 1. LOGIN ──');
  const admin    = await login(USERS.admin.code,    USERS.admin.pin);
  const cashier1 = await login(USERS.cashier1.code, USERS.cashier1.pin);
  const cashier2 = await login(USERS.cashier2.code, USERS.cashier2.pin);
  console.log(`  Admin:    id=${admin.userId} (${admin.name})`);
  console.log(`  Cashier1: id=${cashier1.userId} (${cashier1.name}) floors=[${cashier1.floors.map(f=>f.floorName).join(',')}]`);
  console.log(`  Cashier2: id=${cashier2.userId} (${cashier2.name}) floors=[${cashier2.floors.map(f=>f.floorName).join(',')}]`);

  // 2. Baseline snapshot
  console.log('\n── 2. BASELINE SNAPSHOT ──');
  const base = {
    admin:    { dash: await getDashboard(admin.token),    ds: await getDailySales(admin.token),    tp: await getTakeawayPending(admin.token) },
    cashier1: { dash: await getDashboard(cashier1.token), ds: await getDailySales(cashier1.token), tp: await getTakeawayPending(cashier1.token) },
    cashier2: { dash: await getDashboard(cashier2.token), ds: await getDailySales(cashier2.token), tp: await getTakeawayPending(cashier2.token) }
  };
  console.log(`  Admin     — dashboard: orders=${base.admin.dash.total_orders} sale=${base.admin.dash.total_sale} takeaway=${base.admin.dash.takeaway_orders} | pending_takeaway=${base.admin.tp.total}`);
  console.log(`  Cashier1  — dashboard: orders=${base.cashier1.dash.total_orders} sale=${base.cashier1.dash.total_sale} takeaway=${base.cashier1.dash.takeaway_orders} | pending_takeaway=${base.cashier1.tp.total}`);
  console.log(`  Cashier2  — dashboard: orders=${base.cashier2.dash.total_orders} sale=${base.cashier2.dash.total_sale} takeaway=${base.cashier2.dash.takeaway_orders} | pending_takeaway=${base.cashier2.tp.total}`);

  // 3. Cashier1 creates takeaway order (1x Chilli Chicken Dry = ~Rs.319 + tax)
  console.log('\n── 3. CASHIER1 CREATES TAKEAWAY ORDER ──');
  const order1 = await createTakeawayOrder(cashier1.token, [ITEM_A], 'Test C1 Customer');

  // 4. Cashier2 creates takeaway order (2x Chicken 65 = ~Rs.638 + tax)
  console.log('\n── 4. CASHIER2 CREATES TAKEAWAY ORDER ──');
  const order2 = await createTakeawayOrder(cashier2.token, [ITEM_B], 'Test C2 Customer');

  // Small delay for DB consistency
  await new Promise(r => setTimeout(r, 1000));

  // 5. Post-order snapshot
  console.log('\n── 5. POST-ORDER SNAPSHOT ──');
  const after = {
    admin:    { dash: await getDashboard(admin.token),    ds: await getDailySales(admin.token),    tp: await getTakeawayPending(admin.token) },
    cashier1: { dash: await getDashboard(cashier1.token), ds: await getDailySales(cashier1.token), tp: await getTakeawayPending(cashier1.token) },
    cashier2: { dash: await getDashboard(cashier2.token), ds: await getDailySales(cashier2.token), tp: await getTakeawayPending(cashier2.token) }
  };
  console.log(`  Admin     — dashboard: orders=${after.admin.dash.total_orders} sale=${after.admin.dash.total_sale} takeaway=${after.admin.dash.takeaway_orders}`);
  console.log(`  Cashier1  — dashboard: orders=${after.cashier1.dash.total_orders} sale=${after.cashier1.dash.total_sale} takeaway=${after.cashier1.dash.takeaway_orders}`);
  console.log(`  Cashier2  — dashboard: orders=${after.cashier2.dash.total_orders} sale=${after.cashier2.dash.total_sale} takeaway=${after.cashier2.dash.takeaway_orders}`);

  // 6. Cross-verification
  console.log('\n── 6. CROSS-VERIFICATION ──');

  // Admin should see both new orders
  console.log('\n  [Dashboard — Admin]');
  assert('Admin total_orders increased by 2',
    after.admin.dash.total_orders, base.admin.dash.total_orders + 2);
  assert('Admin takeaway_orders increased by 2',
    after.admin.dash.takeaway_orders, base.admin.dash.takeaway_orders + 2);
  assert('Admin total_sale increased by both orders',
    after.admin.dash.total_sale, base.admin.dash.total_sale + order1.grandTotal + order2.grandTotal, 1);

  // Cashier1 should see ONLY their order
  console.log('\n  [Dashboard — Cashier1]');
  assert('C1 total_orders increased by 1',
    after.cashier1.dash.total_orders, base.cashier1.dash.total_orders + 1);
  assert('C1 takeaway_orders increased by 1',
    after.cashier1.dash.takeaway_orders, base.cashier1.dash.takeaway_orders + 1);
  assert('C1 total_sale increased by ONLY their order',
    after.cashier1.dash.total_sale, base.cashier1.dash.total_sale + order1.grandTotal, 1);

  // Cashier2 should see ONLY their order
  console.log('\n  [Dashboard — Cashier2]');
  assert('C2 total_orders increased by 1',
    after.cashier2.dash.total_orders, base.cashier2.dash.total_orders + 1);
  assert('C2 takeaway_orders increased by 1',
    after.cashier2.dash.takeaway_orders, base.cashier2.dash.takeaway_orders + 1);
  assert('C2 total_sale increased by ONLY their order',
    after.cashier2.dash.total_sale, base.cashier2.dash.total_sale + order2.grandTotal, 1);

  // Daily Sales
  console.log('\n  [Daily Sales — Admin]');
  assert('Admin DS total_orders increased by 2',
    parseInt(after.admin.ds.total_orders), parseInt(base.admin.ds.total_orders) + 2);
  assert('Admin DS takeaway increased by 2',
    parseInt(after.admin.ds.takeaway_orders), parseInt(base.admin.ds.takeaway_orders) + 2);

  console.log('\n  [Daily Sales — Cashier1]');
  assert('C1 DS total_orders increased by 1',
    parseInt(after.cashier1.ds.total_orders), parseInt(base.cashier1.ds.total_orders) + 1);
  assert('C1 DS takeaway increased by 1',
    parseInt(after.cashier1.ds.takeaway_orders), parseInt(base.cashier1.ds.takeaway_orders) + 1);

  console.log('\n  [Daily Sales — Cashier2]');
  assert('C2 DS total_orders increased by 1',
    parseInt(after.cashier2.ds.total_orders), parseInt(base.cashier2.ds.total_orders) + 1);
  assert('C2 DS takeaway increased by 1',
    parseInt(after.cashier2.ds.takeaway_orders), parseInt(base.cashier2.ds.takeaway_orders) + 1);

  // Takeaway Pending — completed orders won't be in pending, check "all" status
  console.log('\n  [Takeaway All — Admin]');
  assertGte('Admin takeaway total increased',
    after.admin.tp.total, base.admin.tp.total + 2);

  console.log('\n  [Takeaway All — Cashier1]');
  assertGte('C1 takeaway total increased by own order',
    after.cashier1.tp.total, base.cashier1.tp.total + 1);
  // Verify all orders belong to cashier1
  const c1Creators = [...new Set(after.cashier1.tp.orders.map(o => o.created_by))];
  assert('C1 sees ONLY own orders (created_by)',
    c1Creators.length === 1 && c1Creators[0] === cashier1.userId, true);

  console.log('\n  [Takeaway All — Cashier2]');
  assertGte('C2 takeaway total increased by own order',
    after.cashier2.tp.total, base.cashier2.tp.total + 1);
  const c2Creators = [...new Set(after.cashier2.tp.orders.map(o => o.created_by))];
  assert('C2 sees ONLY own orders (created_by)',
    c2Creators.length === 1 && c2Creators[0] === cashier2.userId, true);

  // Isolation check: C1 total should NOT include C2 order and vice versa
  console.log('\n  [Isolation Check]');
  const c1SaleIncrease = after.cashier1.dash.total_sale - base.cashier1.dash.total_sale;
  const c2SaleIncrease = after.cashier2.dash.total_sale - base.cashier2.dash.total_sale;
  assert('C1 sale increase matches ONLY order1',
    Math.abs(c1SaleIncrease - order1.grandTotal) < 1, true);
  assert('C2 sale increase matches ONLY order2',
    Math.abs(c2SaleIncrease - order2.grandTotal) < 1, true);
  assert('C1 did NOT get C2 order amount',
    Math.abs(c1SaleIncrease - (order1.grandTotal + order2.grandTotal)) > 1, true);
  assert('C2 did NOT get C1 order amount',
    Math.abs(c2SaleIncrease - (order1.grandTotal + order2.grandTotal)) > 1, true);

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(` RESULTS: ${passCount} passed, ${failCount} failed`);
  console.log('═'.repeat(60));

  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message || err);
  process.exit(1);
});
