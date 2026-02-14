/**
 * Test: Category Sales Detail Report
 * Cross-verifies detail report against summary report + raw DB
 */
require('dotenv').config();
var axios = require('axios');
var { initializeDatabase, getPool } = require('../database');

var BASE = 'http://localhost:3000/api/v1';
var OUTLET_ID = 4;
var START = '2026-02-01';
var END = '2026-02-12';

var passed = 0, failed = 0;

function section(t) { console.log('\n' + '='.repeat(60) + '\n  ' + t + '\n' + '='.repeat(60)); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log('   OK ' + name); }
  else { failed++; console.log('   FAIL: ' + name + (detail ? ' -> ' + detail : '')); }
}

(async function() {
  console.log('Category Sales Detail Report — Test & Verification');
  await initializeDatabase();

  var login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  var token = login.data.data.accessToken || login.data.data.token;
  var api = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + token } });

  // 1. Fetch both reports
  section('1. Fetch reports');
  var summaryRes = await api.get('/orders/reports/' + OUTLET_ID + '/category-sales?startDate=' + START + '&endDate=' + END);
  var detailRes = await api.get('/orders/reports/' + OUTLET_ID + '/category-sales/detail?startDate=' + START + '&endDate=' + END);

  test('Summary status 200', summaryRes.status === 200);
  test('Detail status 200', detailRes.status === 200);

  var sRows = summaryRes.data.data;
  var detail = detailRes.data.data;
  var dSum = detail.summary;
  var dCats = detail.categories;

  test('Detail has categories', dCats.length > 0, 'count: ' + dCats.length);
  test('Detail has summary', !!dSum);
  test('Detail has dateRange', !!detail.dateRange);
  test('Category count matches', sRows.length === dCats.length,
    'summary=' + sRows.length + ' detail=' + dCats.length);

  // 2. Cross-verify totals
  section('2. Cross-verify totals (summary vs detail)');
  var sTotalQty = sRows.reduce(function(s, r) { return s + parseFloat(r.total_quantity); }, 0);
  var sGross = sRows.reduce(function(s, r) { return s + parseFloat(r.gross_revenue); }, 0);
  var sDisc = sRows.reduce(function(s, r) { return s + parseFloat(r.discount_amount); }, 0);
  var sNet = sRows.reduce(function(s, r) { return s + parseFloat(r.net_revenue); }, 0);
  var sItemCount = sRows.reduce(function(s, r) { return s + parseInt(r.item_count); }, 0);
  var sOrderCount = sRows.reduce(function(s, r) { return s + parseInt(r.order_count); }, 0);

  test('Total qty match', Math.abs(sTotalQty - dSum.totalQuantitySold) < 1,
    'summary=' + sTotalQty + ' detail=' + dSum.totalQuantitySold);
  test('Gross revenue match', Math.abs(sGross - dSum.grossRevenue) < 1,
    'summary=' + sGross.toFixed(2) + ' detail=' + dSum.grossRevenue);
  test('Discount match', Math.abs(sDisc - dSum.totalDiscount) < 1,
    'summary=' + sDisc.toFixed(2) + ' detail=' + dSum.totalDiscount);
  test('Net revenue match', Math.abs(sNet - dSum.netRevenue) < 1,
    'summary=' + sNet.toFixed(2) + ' detail=' + dSum.netRevenue);

  // 3. Per-category cross-check
  section('3. Per-category cross-check (all categories)');
  var catMismatch = 0;
  for (var i = 0; i < sRows.length; i++) {
    var sr = sRows[i];
    var dr = dCats.find(function(c) {
      return (c.categoryName || 'Uncategorized') === (sr.category_name || 'Uncategorized');
    });
    if (!dr) {
      console.log('   MISSING category in detail: ' + sr.category_name);
      catMismatch++;
      continue;
    }
    var qOk = Math.abs(parseFloat(sr.total_quantity) - dr.totalQuantity) < 1;
    var rOk = Math.abs(parseFloat(sr.gross_revenue) - dr.grossRevenue) < 1;
    var nOk = Math.abs(parseFloat(sr.net_revenue) - dr.netRevenue) < 1;
    var iOk = parseInt(sr.item_count) === dr.uniqueItemCount;
    var oOk = parseInt(sr.order_count) === dr.orderCount;
    if (!qOk || !rOk || !nOk || !iOk || !oOk) {
      console.log('   MISMATCH ' + sr.category_name +
        ': qty=' + sr.total_quantity + '/' + dr.totalQuantity +
        ' gross=' + sr.gross_revenue + '/' + dr.grossRevenue +
        ' net=' + sr.net_revenue + '/' + dr.netRevenue +
        ' items=' + sr.item_count + '/' + dr.uniqueItemCount +
        ' orders=' + sr.order_count + '/' + dr.orderCount);
      catMismatch++;
    }
  }
  test('All categories match summary', catMismatch === 0, catMismatch + ' mismatches');

  // 4. Verify contribution percent sums to ~100
  section('4. Contribution percent');
  var contribSum = dCats.reduce(function(s, c) { return s + c.contributionPercent; }, 0);
  test('Contribution percents sum ~100', Math.abs(contribSum - 100) < 1,
    'sum=' + contribSum.toFixed(2));

  // 5. Verify per-category item data
  section('5. Per-category item data quality');
  var topCat = dCats[0];
  test('Top category has items array', topCat.items.length > 0);
  test('Top category items have occurrences', topCat.items[0].occurrences.length > 0);

  // Category-level qty should equal sum of item qty
  var itemQtySum = topCat.items.reduce(function(s, it) { return s + it.totalQuantity; }, 0);
  test('Top cat item qty sums to category qty', Math.abs(itemQtySum - topCat.totalQuantity) < 1,
    'itemSum=' + itemQtySum.toFixed(2) + ' catQty=' + topCat.totalQuantity);

  var itemRevSum = topCat.items.reduce(function(s, it) { return s + it.grossRevenue; }, 0);
  test('Top cat item rev sums to category rev', Math.abs(itemRevSum - topCat.grossRevenue) < 1,
    'itemSum=' + itemRevSum.toFixed(2) + ' catRev=' + topCat.grossRevenue);

  // 6. Verify occurrence data
  section('6. Occurrence data quality');
  var topItem = topCat.items[0];
  var occ = topItem.occurrences[0];
  test('Occurrence has orderNumber', !!occ.orderNumber);
  test('Occurrence has orderType', !!occ.orderType);
  test('Occurrence has status', !!occ.status);
  test('Occurrence has itemCreatedAt', !!occ.itemCreatedAt);
  test('Occurrence has quantity > 0', occ.quantity > 0);
  test('Occurrence has totalPrice >= 0', occ.totalPrice >= 0);

  // Dine-in occurrence should have table info
  var dineIn = topItem.occurrences.find(function(o) { return o.orderType === 'dine_in'; });
  if (dineIn) {
    test('Dine-in has tableNumber', dineIn.tableNumber !== null);
    test('Dine-in has floorName', dineIn.floorName !== null);
    test('Dine-in has captainName', dineIn.captainName !== null);
  }

  // 7. Per-item occurrence qty sums
  section('7. Per-item occurrence qty sums (top 5 items of top category)');
  var occMismatch = 0;
  for (var j = 0; j < Math.min(5, topCat.items.length); j++) {
    var it = topCat.items[j];
    var activeOcc = it.occurrences.filter(function(o) { return o.status !== 'cancelled'; });
    var occSum = activeOcc.reduce(function(s, o) { return s + o.quantity; }, 0);
    if (Math.abs(occSum - it.totalQuantity) >= 1) {
      console.log('   MISMATCH ' + it.itemName + ': occSum=' + occSum + ' totalQty=' + it.totalQuantity);
      occMismatch++;
    }
  }
  test('All top items occurrence qty matches', occMismatch === 0, occMismatch + ' mismatches');

  // 8. DB raw verification
  section('8. DB raw verification');
  var pool = getPool();
  var dbRes = await pool.query(
    'SELECT c.name as category_name, ' +
    'SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.quantity ELSE 0 END) as total_qty, ' +
    'SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.total_price ELSE 0 END) as gross_rev, ' +
    'SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.discount_amount ELSE 0 END) as disc, ' +
    'SUM(CASE WHEN oi.status != \'cancelled\' THEN oi.tax_amount ELSE 0 END) as tax_amt, ' +
    'SUM(CASE WHEN oi.status = \'cancelled\' THEN oi.quantity ELSE 0 END) as cancelled_qty, ' +
    'COUNT(DISTINCT oi.item_id) as item_count, ' +
    'COUNT(DISTINCT oi.order_id) as order_count ' +
    'FROM order_items oi ' +
    'JOIN orders o ON oi.order_id = o.id ' +
    'LEFT JOIN items i ON oi.item_id = i.id ' +
    'LEFT JOIN categories c ON i.category_id = c.id ' +
    'WHERE o.outlet_id = ? AND DATE(o.created_at) BETWEEN ? AND ? ' +
    'GROUP BY c.name ORDER BY gross_rev DESC',
    [OUTLET_ID, START, END]
  );
  var dbRows = dbRes[0];

  test('DB category count matches', dbRows.length === dCats.length,
    'db=' + dbRows.length + ' detail=' + dCats.length);

  var dbTotalQty = dbRows.reduce(function(s, r) { return s + parseFloat(r.total_qty); }, 0);
  var dbGrossRev = dbRows.reduce(function(s, r) { return s + parseFloat(r.gross_rev); }, 0);
  var dbTax = dbRows.reduce(function(s, r) { return s + parseFloat(r.tax_amt); }, 0);
  var dbCancelQty = dbRows.reduce(function(s, r) { return s + parseFloat(r.cancelled_qty); }, 0);

  test('DB total qty match', Math.abs(dbTotalQty - dSum.totalQuantitySold) < 1,
    'db=' + dbTotalQty + ' detail=' + dSum.totalQuantitySold);
  test('DB gross revenue match', Math.abs(dbGrossRev - dSum.grossRevenue) < 1,
    'db=' + dbGrossRev.toFixed(2) + ' detail=' + dSum.grossRevenue);
  test('DB tax match', Math.abs(dbTax - dSum.totalTax) < 1,
    'db=' + dbTax.toFixed(2) + ' detail=' + dSum.totalTax);
  test('DB cancelled qty match', Math.abs(dbCancelQty - dSum.totalCancelledQuantity) < 1,
    'db=' + dbCancelQty + ' detail=' + dSum.totalCancelledQuantity);

  // Per-category DB spot check
  var dbMismatch = 0;
  for (var k = 0; k < dbRows.length; k++) {
    var dbCat = dbRows[k];
    var detCat = dCats.find(function(c) {
      return (c.categoryName || 'Uncategorized') === (dbCat.category_name || 'Uncategorized');
    });
    if (!detCat) { dbMismatch++; continue; }
    if (Math.abs(parseFloat(dbCat.total_qty) - detCat.totalQuantity) >= 1 ||
        Math.abs(parseFloat(dbCat.gross_rev) - detCat.grossRevenue) >= 1) {
      console.log('   DB MISMATCH ' + dbCat.category_name +
        ': dbQty=' + dbCat.total_qty + '/' + detCat.totalQuantity +
        ' dbRev=' + dbCat.gross_rev + '/' + detCat.grossRevenue);
      dbMismatch++;
    }
  }
  test('All categories match DB', dbMismatch === 0, dbMismatch + ' mismatches');

  // RESULTS
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
