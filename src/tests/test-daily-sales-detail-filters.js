/**
 * Test: Daily Sales Detail — Filters, Pagination, Search
 * Cross-verifies against unfiltered results + raw DB
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
  console.log('Daily Sales Detail — Filter/Pagination/Search Tests');
  await initializeDatabase();
  var pool = getPool();

  var login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  var token = login.data.data.accessToken || login.data.data.token;
  var api = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + token } });

  var baseUrl = '/orders/reports/' + OUTLET_ID + '/daily-sales/detail?startDate=' + START + '&endDate=' + END;

  // =============================================
  section('1. Default (no filters) — backward compatibility');
  // =============================================
  var r1 = await api.get(baseUrl);
  test('Status 200', r1.status === 200);
  test('Has pagination', !!r1.data.data.pagination);
  test('Has filters', r1.data.data.filters !== undefined);
  test('Has summary', !!r1.data.data.summary);
  test('Has orders array', Array.isArray(r1.data.data.orders));

  var pag = r1.data.data.pagination;
  test('Default page = 1', pag.page === 1);
  test('Default limit = 50', pag.limit === 50);
  test('totalCount > 0', pag.totalCount > 0, 'count=' + pag.totalCount);
  test('totalPages calculated', pag.totalPages === Math.ceil(pag.totalCount / pag.limit));
  test('Orders length <= limit', r1.data.data.orders.length <= pag.limit);
  test('Summary totalOrders = totalCount', r1.data.data.summary.totalOrders === pag.totalCount);

  var fullTotal = pag.totalCount;
  var fullSummary = r1.data.data.summary;

  // =============================================
  section('2. Pagination');
  // =============================================
  var r2a = await api.get(baseUrl + '&limit=5&page=1');
  var r2b = await api.get(baseUrl + '&limit=5&page=2');
  test('Page 1: 5 orders', r2a.data.data.orders.length === 5);
  test('Page 1: page=1', r2a.data.data.pagination.page === 1);
  test('Page 1: hasNext', r2a.data.data.pagination.hasNext === true);
  test('Page 1: hasPrev false', r2a.data.data.pagination.hasPrev === false);
  test('Page 2: 5 orders', r2b.data.data.orders.length === 5);
  test('Page 2: page=2', r2b.data.data.pagination.page === 2);
  test('Page 2: hasPrev true', r2b.data.data.pagination.hasPrev === true);

  // Pages should have different orders
  var p1Ids = r2a.data.data.orders.map(function(o) { return o.orderId; });
  var p2Ids = r2b.data.data.orders.map(function(o) { return o.orderId; });
  var overlap = p1Ids.filter(function(id) { return p2Ids.indexOf(id) >= 0; });
  test('No overlap between pages', overlap.length === 0, 'overlap=' + overlap.length);

  // Summary should be same across pages (covers ALL filtered orders)
  test('Summary same across pages', r2a.data.data.summary.totalOrders === r2b.data.data.summary.totalOrders);
  test('Summary totalOrders = totalCount', r2a.data.data.summary.totalOrders === r2a.data.data.pagination.totalCount);

  // =============================================
  section('3. Filter: orderType=dine_in');
  // =============================================
  var r3 = await api.get(baseUrl + '&orderType=dine_in&limit=200');
  var dineOrders = r3.data.data.orders;
  var allDineIn = dineOrders.every(function(o) { return o.orderType === 'dine_in'; });
  test('All orders are dine_in', allDineIn);
  test('Filtered count < full count', r3.data.data.pagination.totalCount <= fullTotal);
  test('Summary dine_in = totalOrders', r3.data.data.summary.orderTypeBreakdown.dine_in === r3.data.data.summary.totalOrders);
  test('filters.orderType = dine_in', r3.data.data.filters.orderType === 'dine_in');

  // DB verify
  var dbDine = await pool.query(
    'SELECT COUNT(*) as cnt FROM orders WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND order_type = ?',
    [OUTLET_ID, START, END, 'dine_in']
  );
  test('DB dine_in count match', parseInt(dbDine[0][0].cnt) === r3.data.data.pagination.totalCount,
    'db=' + dbDine[0][0].cnt + ' api=' + r3.data.data.pagination.totalCount);

  // =============================================
  section('4. Filter: status=completed');
  // =============================================
  var r4 = await api.get(baseUrl + '&status=completed&limit=200');
  var compOrders = r4.data.data.orders;
  var allComp = compOrders.every(function(o) { return o.status === 'completed'; });
  test('All orders are completed', allComp);
  test('Summary completedOrders = totalOrders', r4.data.data.summary.completedOrders === r4.data.data.summary.totalOrders);

  var dbComp = await pool.query(
    'SELECT COUNT(*) as cnt FROM orders WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status = ?',
    [OUTLET_ID, START, END, 'completed']
  );
  test('DB completed count match', parseInt(dbComp[0][0].cnt) === r4.data.data.pagination.totalCount,
    'db=' + dbComp[0][0].cnt + ' api=' + r4.data.data.pagination.totalCount);

  // =============================================
  section('5. Filter: status=cancelled');
  // =============================================
  var r5 = await api.get(baseUrl + '&status=cancelled&limit=200');
  if (r5.data.data.pagination.totalCount > 0) {
    var cancelOrders = r5.data.data.orders;
    var allCancel = cancelOrders.every(function(o) { return o.status === 'cancelled'; });
    test('All orders are cancelled', allCancel);
    test('Summary cancelledOrders = totalOrders', r5.data.data.summary.cancelledOrders === r5.data.data.summary.totalOrders);
  } else {
    test('No cancelled orders (OK)', true);
  }

  // =============================================
  section('6. Filter: combined orderType + status');
  // =============================================
  var r6 = await api.get(baseUrl + '&orderType=dine_in&status=completed&limit=200');
  var combOrders = r6.data.data.orders;
  var allComb = combOrders.every(function(o) { return o.orderType === 'dine_in' && o.status === 'completed'; });
  test('All orders match combined filter', allComb);
  test('Combined count <= dine_in count', r6.data.data.pagination.totalCount <= r3.data.data.pagination.totalCount);
  test('Combined count <= completed count', r6.data.data.pagination.totalCount <= r4.data.data.pagination.totalCount);

  // =============================================
  section('7. Search by order number');
  // =============================================
  // Get first order number from unfiltered
  var sampleOrder = r1.data.data.orders[0];
  var orderNum = sampleOrder.orderNumber;
  var r7 = await api.get(baseUrl + '&search=' + encodeURIComponent(orderNum));
  test('Search found results', r7.data.data.pagination.totalCount > 0);
  var found = r7.data.data.orders.some(function(o) { return o.orderNumber === orderNum; });
  test('Search result contains target order', found);

  // =============================================
  section('8. Search by partial order number');
  // =============================================
  var partial = orderNum.slice(0, Math.max(3, orderNum.length - 2));
  var r8 = await api.get(baseUrl + '&search=' + encodeURIComponent(partial));
  test('Partial search found results', r8.data.data.pagination.totalCount > 0);

  // =============================================
  section('9. Filter: floorName (if dine_in exists)');
  // =============================================
  if (dineOrders.length > 0 && dineOrders[0].floorName) {
    var floorSample = dineOrders[0].floorName;
    var r9 = await api.get(baseUrl + '&floorName=' + encodeURIComponent(floorSample) + '&limit=200');
    var allFloor = r9.data.data.orders.every(function(o) { return o.floorName && o.floorName.indexOf(floorSample) >= 0; });
    test('All orders match floor filter', allFloor);
    test('Floor filter count > 0', r9.data.data.pagination.totalCount > 0);
  } else {
    test('No dine-in with floor (skip)', true);
  }

  // =============================================
  section('10. Filter: tableNumber (if dine_in exists)');
  // =============================================
  var dineWithTable = dineOrders.find(function(o) { return o.tableNumber !== null; });
  if (dineWithTable) {
    var tblNum = dineWithTable.tableNumber;
    var r10 = await api.get(baseUrl + '&tableNumber=' + tblNum + '&limit=200');
    var allTbl = r10.data.data.orders.every(function(o) { return o.tableNumber === tblNum; });
    test('All orders match table filter', allTbl);
    test('Table filter count > 0', r10.data.data.pagination.totalCount > 0);
  } else {
    test('No dine-in with table (skip)', true);
  }

  // =============================================
  section('11. Sorting: total_amount DESC vs ASC');
  // =============================================
  var r11d = await api.get(baseUrl + '&sortBy=total_amount&sortOrder=DESC&limit=10');
  var r11a = await api.get(baseUrl + '&sortBy=total_amount&sortOrder=ASC&limit=10');
  var descAmts = r11d.data.data.orders.map(function(o) { return o.totalAmount; });
  var ascAmts = r11a.data.data.orders.map(function(o) { return o.totalAmount; });
  var isDesc = true, isAsc = true;
  for (var i = 1; i < descAmts.length; i++) { if (descAmts[i] > descAmts[i-1]) isDesc = false; }
  for (var j = 1; j < ascAmts.length; j++) { if (ascAmts[j] < ascAmts[j-1]) isAsc = false; }
  test('DESC sort is correct', isDesc);
  test('ASC sort is correct', isAsc);

  // =============================================
  section('12. Summary accuracy: all dine_in orders from DB');
  // =============================================
  var dbDineSummary = await pool.query(
    'SELECT ' +
    'SUM(CASE WHEN status != \'cancelled\' THEN subtotal ELSE 0 END) as gross, ' +
    'SUM(CASE WHEN status != \'cancelled\' THEN discount_amount ELSE 0 END) as disc, ' +
    'SUM(CASE WHEN status != \'cancelled\' THEN tax_amount ELSE 0 END) as tax, ' +
    'SUM(CASE WHEN status IN (\'paid\',\'completed\') THEN total_amount ELSE 0 END) as net ' +
    'FROM orders WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND order_type = ?',
    [OUTLET_ID, START, END, 'dine_in']
  );
  var dbs = dbDineSummary[0][0];
  var apiS = r3.data.data.summary;
  test('Dine_in gross sales match DB', Math.abs(parseFloat(dbs.gross) - apiS.grossSales) < 1,
    'db=' + dbs.gross + ' api=' + apiS.grossSales);
  test('Dine_in discount match DB', Math.abs(parseFloat(dbs.disc) - apiS.totalDiscount) < 1,
    'db=' + dbs.disc + ' api=' + apiS.totalDiscount);
  test('Dine_in tax match DB', Math.abs(parseFloat(dbs.tax) - apiS.totalTax) < 1,
    'db=' + dbs.tax + ' api=' + apiS.totalTax);
  test('Dine_in net sales match DB', Math.abs(parseFloat(dbs.net) - apiS.netSales) < 1,
    'db=' + dbs.net + ' api=' + apiS.netSales);

  // =============================================
  section('13. Summary: unfiltered totals match full report');
  // =============================================
  // Fetch unfiltered with high limit to get full summary
  var rFull = await api.get(baseUrl + '&limit=1');
  var fullS = rFull.data.data.summary;
  test('Unfiltered totalOrders match', fullS.totalOrders === fullTotal);
  test('Unfiltered grossSales match', Math.abs(fullS.grossSales - fullSummary.grossSales) < 1);
  test('Unfiltered netSales match', Math.abs(fullS.netSales - fullSummary.netSales) < 1);
  test('Unfiltered totalTax match', Math.abs(fullS.totalTax - fullSummary.totalTax) < 1);

  // =============================================
  section('14. Edge: invalid filter returns empty');
  // =============================================
  var r14 = await api.get(baseUrl + '&search=NONEXISTENT_ORDER_12345');
  test('No results for invalid search', r14.data.data.pagination.totalCount === 0);
  test('Empty orders array', r14.data.data.orders.length === 0);
  test('Summary totalOrders = 0', r14.data.data.summary.totalOrders === 0);

  // =============================================
  section('15. Edge: page beyond range');
  // =============================================
  var r15 = await api.get(baseUrl + '&page=9999&limit=50');
  test('Beyond-range page: empty orders', r15.data.data.orders.length === 0);
  test('Beyond-range page: totalCount still correct', r15.data.data.pagination.totalCount === fullTotal);

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
