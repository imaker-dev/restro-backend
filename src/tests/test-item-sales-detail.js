/**
 * Test: Item Sales Detail Report
 * Cross-verifies detail report against summary report
 */
require('dotenv').config();
const axios = require('axios');
const { initializeDatabase } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const START = '2026-02-01';
const END = '2026-02-12';

let passed = 0, failed = 0;

function section(t) { console.log('\n' + '='.repeat(60) + '\n  ' + t + '\n' + '='.repeat(60)); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log('   OK ' + name); }
  else { failed++; console.log('   FAIL: ' + name + (detail ? ' -> ' + detail : '')); }
}

(async () => {
  console.log('Item Sales Detail Report — Test & Verification');
  await initializeDatabase();

  const login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  const token = login.data.data.accessToken || login.data.data.token;
  const api = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + token } });

  // ── 1. Fetch both reports ──
  section('1. Fetch reports');
  const [summaryRes, detailRes] = await Promise.all([
    api.get('/orders/reports/' + OUTLET_ID + '/item-sales?startDate=' + START + '&endDate=' + END + '&limit=100'),
    api.get('/orders/reports/' + OUTLET_ID + '/item-sales/detail?startDate=' + START + '&endDate=' + END + '&limit=100')
  ]);

  test('Summary status 200', summaryRes.status === 200);
  test('Detail status 200', detailRes.status === 200);

  const sRows = summaryRes.data.data;
  const detail = detailRes.data.data;
  const dSum = detail.summary;
  const dItems = detail.items;

  test('Detail has items', dItems.length > 0, 'count: ' + dItems.length);
  test('Detail has summary', !!dSum);
  test('Detail has dateRange', !!detail.dateRange);

  // ── 2. Cross-verify totals ──
  section('2. Cross-verify totals (summary vs detail)');

  const sTotalQty = sRows.reduce(function(s, r) { return s + parseFloat(r.total_quantity); }, 0);
  const sGross = sRows.reduce(function(s, r) { return s + parseFloat(r.gross_revenue); }, 0);
  const sTax = sRows.reduce(function(s, r) { return s + parseFloat(r.tax_amount); }, 0);
  const sDisc = sRows.reduce(function(s, r) { return s + parseFloat(r.discount_amount); }, 0);
  const sCancelQty = sRows.reduce(function(s, r) { return s + parseFloat(r.cancelled_quantity); }, 0);

  test('Total qty match', Math.abs(sTotalQty - dSum.totalQuantitySold) < 1,
    'summary=' + sTotalQty + ' detail=' + dSum.totalQuantitySold);
  test('Gross revenue match', Math.abs(sGross - dSum.grossRevenue) < 1,
    'summary=' + sGross.toFixed(2) + ' detail=' + dSum.grossRevenue);
  test('Tax match', Math.abs(sTax - dSum.totalTax) < 1,
    'summary=' + sTax.toFixed(2) + ' detail=' + dSum.totalTax);
  test('Discount match', Math.abs(sDisc - dSum.totalDiscount) < 1,
    'summary=' + sDisc.toFixed(2) + ' detail=' + dSum.totalDiscount);
  test('Cancelled qty match', Math.abs(sCancelQty - dSum.totalCancelledQuantity) < 1,
    'summary=' + sCancelQty + ' detail=' + dSum.totalCancelledQuantity);
  test('Unique items match', sRows.length === dSum.totalUniqueItems,
    'summary=' + sRows.length + ' detail=' + dSum.totalUniqueItems);

  // ── 3. Spot check top 5 items ──
  section('3. Spot check top 5 items');
  for (var i = 0; i < 5 && i < sRows.length; i++) {
    var sr = sRows[i];
    var dr = dItems.find(function(d) {
      return d.itemName === sr.item_name && (d.variantName || '') === (sr.variant_name || '');
    });
    if (dr) {
      var qtyMatch = Math.abs(parseFloat(sr.total_quantity) - dr.totalQuantity) < 1;
      var revMatch = Math.abs(parseFloat(sr.gross_revenue) - dr.grossRevenue) < 1;
      test(sr.item_name + ' qty & revenue', qtyMatch && revMatch,
        'SumQty=' + sr.total_quantity + ' DetQty=' + dr.totalQuantity +
        ' SumRev=' + sr.gross_revenue + ' DetRev=' + dr.grossRevenue);
    } else {
      test(sr.item_name + ' found in detail', false, 'NOT FOUND');
    }
  }

  // ── 4. Verify occurrence data quality ──
  section('4. Verify occurrence data quality');
  var topItem = dItems[0];
  test('Top item has occurrences', topItem.occurrences.length > 0);
  test('occurrenceCount matches array', topItem.occurrenceCount === topItem.occurrences.length);

  var occ = topItem.occurrences[0];
  test('Occurrence has orderNumber', !!occ.orderNumber);
  test('Occurrence has orderType', !!occ.orderType);
  test('Occurrence has status', !!occ.status);
  test('Occurrence has itemCreatedAt', !!occ.itemCreatedAt);
  test('Occurrence has quantity > 0', occ.quantity > 0);
  test('Occurrence has unitPrice >= 0', occ.unitPrice >= 0);
  test('Occurrence has totalPrice >= 0', occ.totalPrice >= 0);

  // Check that table/floor/captain info is present for dine-in
  var dineInOcc = topItem.occurrences.find(function(o) { return o.orderType === 'dine_in'; });
  if (dineInOcc) {
    test('Dine-in has tableNumber', dineInOcc.tableNumber !== null, 'table=' + dineInOcc.tableNumber);
    test('Dine-in has floorName', dineInOcc.floorName !== null, 'floor=' + dineInOcc.floorName);
    test('Dine-in has captainName', dineInOcc.captainName !== null, 'captain=' + dineInOcc.captainName);
  }

  // ── 5. Verify summary breakdowns ──
  section('5. Verify summary breakdowns');
  test('Has itemTypeBreakdown', Array.isArray(dSum.itemTypeBreakdown) && dSum.itemTypeBreakdown.length > 0);
  test('Has categoryBreakdown', Array.isArray(dSum.categoryBreakdown) && dSum.categoryBreakdown.length > 0);

  var typeQtySum = dSum.itemTypeBreakdown.reduce(function(s, t) { return s + t.quantity; }, 0);
  test('Type breakdown qty sums to total', Math.abs(typeQtySum - dSum.totalQuantitySold) < 1,
    'typeSum=' + typeQtySum + ' total=' + dSum.totalQuantitySold);

  var catQtySum = dSum.categoryBreakdown.reduce(function(s, c) { return s + c.totalQuantity; }, 0);
  test('Category breakdown qty sums to total', Math.abs(catQtySum - dSum.totalQuantitySold) < 1,
    'catSum=' + catQtySum + ' total=' + dSum.totalQuantitySold);

  // ── 6. Verify per-item occurrence qty sums ──
  section('6. Verify per-item occurrence qty sums');
  var mismatchCount = 0;
  for (var j = 0; j < Math.min(10, dItems.length); j++) {
    var item = dItems[j];
    var activeOcc = item.occurrences.filter(function(o) { return o.status !== 'cancelled'; });
    var occQtySum = activeOcc.reduce(function(s, o) { return s + o.quantity; }, 0);
    if (Math.abs(occQtySum - item.totalQuantity) >= 1) {
      console.log('   MISMATCH ' + item.itemName + ': occSum=' + occQtySum + ' vs totalQty=' + item.totalQuantity);
      mismatchCount++;
    }
  }
  test('All top-10 items occurrence qty matches totalQuantity', mismatchCount === 0,
    mismatchCount + ' mismatches');

  // ── 7. DB raw verification ──
  section('7. DB raw verification');
  const { getPool } = require('../database');
  const pool = getPool();
  const [dbRows] = await pool.query(
    'SELECT SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.quantity ELSE 0 END) as total_qty, ' +
    'SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.total_price ELSE 0 END) as gross_rev, ' +
    'SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.tax_amount ELSE 0 END) as total_tax, ' +
    'SUM(CASE WHEN oi.status = \'cancelled\' THEN oi.quantity ELSE 0 END) as cancelled_qty ' +
    'FROM order_items oi JOIN orders o ON oi.order_id = o.id ' +
    'WHERE o.outlet_id = ? AND DATE(o.created_at) BETWEEN ? AND ?',
    [OUTLET_ID, START, END]
  );
  var db = dbRows[0];
  test('DB total qty match', Math.abs(parseFloat(db.total_qty) - dSum.totalQuantitySold) < 1,
    'db=' + db.total_qty + ' detail=' + dSum.totalQuantitySold);
  test('DB gross revenue match', Math.abs(parseFloat(db.gross_rev) - dSum.grossRevenue) < 1,
    'db=' + db.gross_rev + ' detail=' + dSum.grossRevenue);
  test('DB tax match', Math.abs(parseFloat(db.total_tax) - dSum.totalTax) < 1,
    'db=' + db.total_tax + ' detail=' + dSum.totalTax);
  test('DB cancelled qty match', Math.abs(parseFloat(db.cancelled_qty) - dSum.totalCancelledQuantity) < 1,
    'db=' + db.cancelled_qty + ' detail=' + dSum.totalCancelledQuantity);

  // ── RESULTS ──
  console.log('\n' + '='.repeat(60));
  console.log('  RESULTS: OK ' + passed + ' passed, FAIL ' + failed + ' failed');
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n' + failed + ' test(s) failed');
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
})().catch(function(err) {
  console.error('Fatal:', err.response ? err.response.data : err.message);
  process.exit(1);
});
