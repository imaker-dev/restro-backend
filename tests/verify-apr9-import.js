/**
 * Verify Apr 9 import shows correctly in all APIs and DB
 */
const http = require('http');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dbCfg = require('../src/config/database.config');

const BASE = 'http://localhost:3005/api/v1';
const OUTLET_ID = 46;
const DATE_STR = '2026-04-09';
const ORDER_PREFIX = 'ORD260409';
let token = null, pool = null;
let pass = 0, fail = 0;

function apiPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } }); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function api(method, urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } }); });
    req.on('error', reject); req.end();
  });
}

const r2 = (n) => parseFloat((parseFloat(n) || 0).toFixed(2));
function check(label, got, expected, tolerance = 1) {
  const g = r2(got), e = r2(expected);
  if (Math.abs(g - e) <= tolerance) { pass++; console.log(`  ✅ ${label}: ${g} === ${e}`); }
  else { fail++; console.log(`  ❌ ${label}: got ${g}, expected ${e} (diff: ${r2(g - e)})`); }
}
function checkInt(label, got, expected) {
  const g = parseInt(got) || 0, e = parseInt(expected) || 0;
  if (g === e) { pass++; console.log(`  ✅ ${label}: ${g} === ${e}`); }
  else { fail++; console.log(`  ❌ ${label}: got ${g}, expected ${e}`); }
}

// Expected values from dry run
const EXPECTED = {
  orders: 41,
  sale: 70880,
  discount: 341.35,
  tax: 4431.91,
  dueOrders: 1,
  dueAmount: 294,
  splitOrders: 0,
  paidTotal: 70586,  // 70880 - 294 due
  zomatoOC: 2,
  zomatoTotal: 645,
  shifts: 2,
  barOrders: 18,
  barSale: 31038,
  restOrders: 23,  // 12 restaurant + 11 roof top
  restSale: 39842, // 27925 + 11917
  // API reports include outside_collections in total sales
  apiTotalSale: 71525, // 70880 + 645 (Zomato OC)
};

async function run() {
  pool = mysql.createPool({ host: dbCfg.host, port: dbCfg.port, user: dbCfg.user, password: dbCfg.password, database: dbCfg.database });

  // Login
  const loginRes = await apiPost('/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  if (!loginRes.data || !loginRes.data.accessToken) {
    console.log('❌ Login failed:', JSON.stringify(loginRes));
    await pool.end(); return;
  }
  token = loginRes.data.accessToken;

  console.log('═'.repeat(100));
  console.log('  VERIFICATION: Apr 9 Import');
  console.log('═'.repeat(100));

  // ── 1. DB: Imported orders ──
  console.log('\n── DB: Imported Orders ──');
  const [dbImported] = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(total_amount) as sale, SUM(discount_amount) as disc, SUM(tax_amount) as tax
     FROM orders WHERE outlet_id = ? AND status = 'completed' AND order_number LIKE '${ORDER_PREFIX}%'`, [OUTLET_ID]
  );
  check('DB imported count', dbImported[0].cnt, EXPECTED.orders);
  check('DB imported sale', dbImported[0].sale, EXPECTED.sale);
  check('DB imported discount', dbImported[0].disc, EXPECTED.discount);
  check('DB imported tax', dbImported[0].tax, EXPECTED.tax);

  // ── 2. DB: Order Items ──
  console.log('\n── DB: Order Items ──');
  const [oiCheck] = await pool.query(
    `SELECT COUNT(DISTINCT o.id) as orders_with_items, COUNT(oi.id) as total_items
     FROM orders o JOIN order_items oi ON o.id = oi.order_id
     WHERE o.outlet_id = ? AND o.order_number LIKE '${ORDER_PREFIX}%'`, [OUTLET_ID]
  );
  checkInt('Orders with items', oiCheck[0].orders_with_items, EXPECTED.orders);
  console.log(`  Total order_items: ${oiCheck[0].total_items}`);

  // ── 3. DB: Payments ──
  console.log('\n── DB: Payments ──');
  const [payCheck] = await pool.query(
    `SELECT payment_mode, COUNT(*) as cnt, SUM(total_amount) as total
     FROM payments WHERE outlet_id = ? AND status = 'completed'
       AND order_id IN (SELECT id FROM orders WHERE outlet_id = ? AND order_number LIKE '${ORDER_PREFIX}%')
     GROUP BY payment_mode`, [OUTLET_ID, OUTLET_ID]
  );
  console.log('  Payment modes:');
  let payTotal = 0;
  payCheck.forEach(p => { console.log(`    ${p.payment_mode}: ${p.cnt} payments, Rs ${r2(p.total)}`); payTotal += r2(p.total); });
  check('Total payments', payTotal, EXPECTED.paidTotal);

  // ── 4. DB: Due Orders ──
  console.log('\n── DB: Due Orders ──');
  const [dueCheck] = await pool.query(
    `SELECT order_number, total_amount, paid_amount, due_amount, payment_status
     FROM orders WHERE outlet_id = ? AND payment_status = 'partial' AND order_number LIKE '${ORDER_PREFIX}%'`, [OUTLET_ID]
  );
  checkInt('Due orders count', dueCheck.length, EXPECTED.dueOrders);
  let dueTotal = 0;
  dueCheck.forEach(d => {
    console.log(`    ${d.order_number}: total=Rs ${d.total_amount}, paid=Rs ${d.paid_amount}, due=Rs ${d.due_amount}`);
    dueTotal += parseFloat(d.due_amount);
  });
  check('Total due amount', dueTotal, EXPECTED.dueAmount);

  // ── 5. DB: Shifts ──
  console.log('\n── DB: Shifts (day_sessions) ──');
  const [shifts] = await pool.query(
    `SELECT ds.id, ds.floor_id, ds.cashier_id, ds.total_sales, ds.total_orders, ds.opening_time, ds.closing_time, u.name
     FROM day_sessions ds LEFT JOIN users u ON ds.cashier_id = u.id
     WHERE ds.outlet_id = ? AND ds.session_date = '${DATE_STR}'`, [OUTLET_ID]
  );
  checkInt('Shifts for Apr 9', shifts.length, EXPECTED.shifts);
  let shiftSaleSum = 0, shiftOrderSum = 0;
  shifts.forEach(s => {
    const fl = s.floor_id === 38 ? 'BAR' : 'REST';
    console.log(`    Shift #${s.id} | ${fl} | ${s.name} | Rs ${r2(s.total_sales)} | ${s.total_orders} orders | ${s.opening_time} to ${s.closing_time}`);
    shiftSaleSum += r2(s.total_sales);
    shiftOrderSum += parseInt(s.total_orders);
  });
  check('Shift sales sum', shiftSaleSum, EXPECTED.sale);
  checkInt('Shift orders sum', shiftOrderSum, EXPECTED.orders);

  // ── 6. DB: Outside Collections (Zomato) ──
  console.log('\n── DB: Outside Collections (Zomato) ──');
  const [ocCheck] = await pool.query(
    `SELECT oc.id, oc.amount, oc.reason, oc.description, oc.shift_id, oc.floor_id, oc.collected_by, u.name as collector
     FROM outside_collections oc LEFT JOIN users u ON oc.collected_by = u.id
     WHERE oc.outlet_id = ? AND oc.collection_date = '${DATE_STR}' AND oc.status = 'active'`, [OUTLET_ID]
  );
  checkInt('Zomato OC count', ocCheck.length, EXPECTED.zomatoOC);
  let ocTotal = 0;
  ocCheck.forEach(oc => {
    console.log(`    OC #${oc.id} | Rs ${r2(oc.amount)} | shift_id=${oc.shift_id} | ${oc.collector} | ${oc.description}`);
    ocTotal += r2(oc.amount);
  });
  check('Zomato OC total', ocTotal, EXPECTED.zomatoTotal);

  // Verify Zomato OCs are in Shiv's shift
  const shivShift = shifts.find(s => s.cashier_id === 205);
  if (shivShift && ocCheck.length > 0) {
    const allInShivShift = ocCheck.every(oc => oc.shift_id === shivShift.id);
    if (allInShivShift) { pass++; console.log(`  ✅ All Zomato OCs in Shiv's shift #${shivShift.id}`); }
    else { fail++; console.log(`  ❌ Not all OCs in Shiv's shift!`); }
  }

  // ── 7. DB: By Floor check ──
  console.log('\n── DB: By Floor ──');
  const [byFloor] = await pool.query(
    `SELECT COALESCE(f.name, 'Takeaway') as floor_name, f.id as floor_id, COUNT(*) as cnt, SUM(o.total_amount) as sale
     FROM orders o LEFT JOIN floors f ON o.floor_id = f.id
     WHERE o.outlet_id = ? AND o.order_number LIKE '${ORDER_PREFIX}%'
     GROUP BY f.name, f.id`, [OUTLET_ID]
  );
  byFloor.forEach(f => {
    console.log(`    ${f.floor_name} (floor_id=${f.floor_id}): ${f.cnt} orders, Rs ${r2(f.sale)}`);
  });

  // ── 8. API: Daily Sales Report ──
  console.log('\n── API: Daily Sales Report ──');
  const ds = await api('GET', `/orders/reports/${OUTLET_ID}/daily-sales?startDate=${DATE_STR}&endDate=${DATE_STR}`);
  if (ds.success) {
    const s = ds.data.summary;
    console.log(`    total_sale=${s.total_sale}, total_orders=${s.total_orders}, discount=${s.discount_amount}`);
    check('daily-sales total_sale', s.total_sale, EXPECTED.apiTotalSale, 100);
    checkInt('daily-sales orders', s.total_orders, EXPECTED.orders);
  } else { fail++; console.log('  ❌ daily-sales failed:', ds.message); }

  // ── 9. API: Accurate DSR ──
  console.log('\n── API: Accurate DSR ──');
  const dsr = await api('GET', `/reports/accurate-dsr?outletId=${OUTLET_ID}&startDate=${DATE_STR}&endDate=${DATE_STR}`);
  if (dsr.success) {
    const gt = dsr.data.grandTotal || dsr.data.summary;
    console.log(`    total_sale=${gt.total_sale}, total_orders=${gt.total_orders}`);
    check('accurate-dsr total_sale', gt.total_sale, EXPECTED.apiTotalSale, 100);
    checkInt('accurate-dsr orders', gt.total_orders, EXPECTED.orders);
  } else { fail++; console.log('  ❌ accurate-dsr failed:', dsr.message); }

  // ── 10. API: Shift History ──
  console.log('\n── API: Shift History ──');
  const sh = await api('GET', `/orders/shifts/${OUTLET_ID}/history?startDate=${DATE_STR}&endDate=${DATE_STR}`);
  if (sh.success) {
    const shiftData = sh.data.shifts || sh.data.data || sh.data;
    let shiftSum = 0, shiftOrders = 0;
    if (Array.isArray(shiftData)) {
      for (const s of shiftData) {
        const sale = r2(s.totalSales);
        const orders = parseInt(s.totalOrders || s.completedOrders) || 0;
        shiftSum += sale;
        shiftOrders += orders;
        console.log(`    Shift #${s.id}: Rs ${sale} | ${orders} orders | ${s.cashierName} | ${s.floorName}`);
      }
      check('shift-history sum', shiftSum, EXPECTED.apiTotalSale, 100);
      checkInt('shift-history orders', shiftOrders, EXPECTED.orders);
    }
  } else { fail++; console.log('  ❌ shift-history failed:', sh.message); }

  // ── 11. API: Accurate Day End Summary ──
  console.log('\n── API: Accurate Day End Summary ──');
  const des = await api('GET', `/reports/accurate-day-end-summary?outletId=${OUTLET_ID}&startDate=${DATE_STR}&endDate=${DATE_STR}`);
  if (des.success) {
    const gt = des.data.grandTotal;
    if (gt) {
      console.log(`    total_sale=${gt.total_sale}, total_orders=${gt.total_orders}`);
      check('day-end total_sale', gt.total_sale, EXPECTED.apiTotalSale, 100);
      checkInt('day-end orders', gt.total_orders, EXPECTED.orders);
    } else {
      console.log('  Day end response:', JSON.stringify(des.data).substring(0, 200));
    }
  } else { fail++; console.log('  ❌ day-end failed:', des.message); }

  // ── 12. API: Outside Collections ──
  console.log('\n── API: Outside Collections ──');
  const ocApi = await api('GET', `/orders/outside-collections/${OUTLET_ID}?startDate=${DATE_STR}&endDate=${DATE_STR}`);
  if (ocApi.success) {
    const collections = ocApi.data.collections || ocApi.data.data || ocApi.data;
    if (Array.isArray(collections)) {
      console.log(`    Found ${collections.length} outside collections via API`);
      let apiOcTotal = 0;
      collections.forEach(c => {
        console.log(`    OC #${c.id}: Rs ${r2(c.amount)} | ${c.reason} | ${c.description}`);
        apiOcTotal += r2(c.amount);
      });
      check('API OC total', apiOcTotal, EXPECTED.zomatoTotal);
    }
  } else { console.log('  ℹ️ outside-collections API:', ocApi.message || 'no data'); }

  // ── SUMMARY ──
  console.log('\n' + '═'.repeat(100));
  console.log(`  RESULTS: ✅ ${pass} passed, ❌ ${fail} failed`);
  console.log('═'.repeat(100));

  if (fail === 0) {
    console.log('\n  🎉 ALL Apr 9 data imported and verified successfully!');
    console.log(`  ${EXPECTED.orders} orders (Rs ${EXPECTED.sale}) + ${EXPECTED.zomatoOC} Zomato outside_collections (Rs ${EXPECTED.zomatoTotal})`);
    console.log(`  ${EXPECTED.shifts} shifts, ${EXPECTED.dueOrders} due order (Rs ${EXPECTED.dueAmount})`);
  }

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
