/**
 * Test: Payment Mode Detail Report
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
  console.log('Payment Mode Detail Report — Test & Verification');
  await initializeDatabase();

  var login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  var token = login.data.data.accessToken || login.data.data.token;
  var api = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + token } });

  // 1. Fetch both reports
  section('1. Fetch reports');
  var summaryRes = await api.get('/orders/reports/' + OUTLET_ID + '/payment-modes?startDate=' + START + '&endDate=' + END);
  var detailRes = await api.get('/orders/reports/' + OUTLET_ID + '/payment-modes/detail?startDate=' + START + '&endDate=' + END);

  test('Summary status 200', summaryRes.status === 200);
  test('Detail status 200', detailRes.status === 200);

  var sData = summaryRes.data.data;
  var detail = detailRes.data.data;
  var dSum = detail.summary;
  var dModes = detail.modes;

  test('Detail has modes', dModes.length > 0, 'count: ' + dModes.length);
  test('Detail has summary', !!dSum);
  test('Detail has dateRange', !!detail.dateRange);
  test('Mode count matches', sData.modes.length === dModes.length,
    'summary=' + sData.modes.length + ' detail=' + dModes.length);

  // 2. Cross-verify totals
  section('2. Cross-verify totals (summary vs detail)');
  var sTotalCollected = parseFloat(sData.summary.total_collected);
  var sTotalTips = parseFloat(sData.summary.total_tips);
  var sTotalTxn = sData.summary.total_transactions;

  test('Total collected match', Math.abs(sTotalCollected - dSum.totalCollected) < 1,
    'summary=' + sTotalCollected + ' detail=' + dSum.totalCollected);
  test('Total tips match', Math.abs(sTotalTips - dSum.totalTips) < 0.1,
    'summary=' + sTotalTips + ' detail=' + dSum.totalTips);
  test('Total transactions match', sTotalTxn === dSum.totalTransactions,
    'summary=' + sTotalTxn + ' detail=' + dSum.totalTransactions);

  // 3. Per-mode cross-check
  section('3. Per-mode cross-check');
  var modeMismatch = 0;
  for (var i = 0; i < sData.modes.length; i++) {
    var sm = sData.modes[i];
    var dm = dModes.find(function(m) { return m.paymentMode === sm.payment_mode; });
    if (!dm) {
      console.log('   MISSING mode in detail: ' + sm.payment_mode);
      modeMismatch++;
      continue;
    }
    var txnOk = parseInt(sm.transaction_count) === dm.transactionCount;
    var amtOk = Math.abs(parseFloat(sm.total_amount) - dm.totalAmount) < 1;
    var baseOk = Math.abs(parseFloat(sm.base_amount) - dm.baseAmount) < 1;
    var tipOk = Math.abs(parseFloat(sm.tip_amount) - dm.tipAmount) < 0.1;
    if (!txnOk || !amtOk || !baseOk || !tipOk) {
      console.log('   MISMATCH ' + sm.payment_mode +
        ': txn=' + sm.transaction_count + '/' + dm.transactionCount +
        ' total=' + sm.total_amount + '/' + dm.totalAmount +
        ' base=' + sm.base_amount + '/' + dm.baseAmount +
        ' tip=' + sm.tip_amount + '/' + dm.tipAmount);
      modeMismatch++;
    }
  }
  test('All modes match summary', modeMismatch === 0, modeMismatch + ' mismatches');

  // 4. Percentage share sums to ~100
  section('4. Percentage share');
  var shareSum = dModes.reduce(function(s, m) { return s + m.percentageShare; }, 0);
  test('Percentage shares sum ~100', Math.abs(shareSum - 100) < 1, 'sum=' + shareSum.toFixed(2));

  // 5. Per-mode transaction count matches array length
  section('5. Transaction array integrity');
  var txnMismatch = 0;
  for (var j = 0; j < dModes.length; j++) {
    var mode = dModes[j];
    if (mode.transactionCount !== mode.transactions.length) {
      console.log('   MISMATCH ' + mode.paymentMode +
        ': count=' + mode.transactionCount + ' array=' + mode.transactions.length);
      txnMismatch++;
    }
    // Verify totalAmount matches sum of individual transactions
    var txnSum = mode.transactions.reduce(function(s, t) { return s + t.totalAmount; }, 0);
    if (Math.abs(txnSum - mode.totalAmount) >= 1) {
      console.log('   AMOUNT MISMATCH ' + mode.paymentMode +
        ': txnSum=' + txnSum.toFixed(2) + ' modeTotal=' + mode.totalAmount);
      txnMismatch++;
    }
    // Verify tipAmount matches sum
    var tipSum = mode.transactions.reduce(function(s, t) { return s + t.tipAmount; }, 0);
    if (Math.abs(tipSum - mode.tipAmount) >= 0.1) {
      console.log('   TIP MISMATCH ' + mode.paymentMode +
        ': tipSum=' + tipSum.toFixed(2) + ' modeTip=' + mode.tipAmount);
      txnMismatch++;
    }
  }
  test('All modes txn count matches array & amounts sum correctly', txnMismatch === 0,
    txnMismatch + ' mismatches');

  // 6. Transaction data quality
  section('6. Transaction data quality');
  var topMode = dModes[0];
  var txn = topMode.transactions[0];
  test('Transaction has paymentNumber', !!txn.paymentNumber);
  test('Transaction has orderNumber', !!txn.orderNumber);
  test('Transaction has orderType', !!txn.orderType);
  test('Transaction has totalAmount > 0', txn.totalAmount > 0);
  test('Transaction has amount >= 0', txn.amount >= 0);
  test('Transaction has paymentCreatedAt', !!txn.paymentCreatedAt);
  test('Transaction has orderCreatedAt', !!txn.orderCreatedAt);

  // Dine-in transaction should have table
  var dineInTxn = topMode.transactions.find(function(t) { return t.orderType === 'dine_in'; });
  if (dineInTxn) {
    test('Dine-in txn has tableNumber', dineInTxn.tableNumber !== null);
    test('Dine-in txn has floorName', dineInTxn.floorName !== null);
    test('Dine-in txn has captainName', dineInTxn.captainName !== null);
  }

  // Transaction with items
  var txnWithItems = topMode.transactions.find(function(t) { return t.items.length > 0; });
  if (txnWithItems) {
    test('Transaction has items array', txnWithItems.items.length > 0);
    test('Item has itemName', !!txnWithItems.items[0].itemName);
    test('Item has quantity > 0', txnWithItems.items[0].quantity > 0);
    test('Item has totalPrice >= 0', txnWithItems.items[0].totalPrice >= 0);
  }

  // 7. Daily breakdown
  section('7. Daily breakdown');
  test('Has daily breakdown', dSum.dailyBreakdown.length > 0, 'days: ' + dSum.dailyBreakdown.length);
  var dailyTotalAmt = dSum.dailyBreakdown.reduce(function(s, d) { return s + d.total; }, 0);
  var dailyTotalTxn = dSum.dailyBreakdown.reduce(function(s, d) { return s + d.transactionCount; }, 0);
  test('Daily amounts sum to total', Math.abs(dailyTotalAmt - dSum.totalCollected) < 1,
    'dailySum=' + dailyTotalAmt.toFixed(2) + ' total=' + dSum.totalCollected);
  test('Daily txn count sum to total', dailyTotalTxn === dSum.totalTransactions,
    'dailySum=' + dailyTotalTxn + ' total=' + dSum.totalTransactions);

  // 8. Hourly breakdown
  section('8. Hourly breakdown');
  test('Has hourly breakdown', dSum.hourlyBreakdown.length > 0, 'hours: ' + dSum.hourlyBreakdown.length);
  var hourlyTotalAmt = dSum.hourlyBreakdown.reduce(function(s, h) { return s + h.totalAmount; }, 0);
  var hourlyTotalTxn = dSum.hourlyBreakdown.reduce(function(s, h) { return s + h.transactionCount; }, 0);
  test('Hourly amounts sum to total', Math.abs(hourlyTotalAmt - dSum.totalCollected) < 1,
    'hourlySum=' + hourlyTotalAmt.toFixed(2) + ' total=' + dSum.totalCollected);
  test('Hourly txn count sum to total', hourlyTotalTxn === dSum.totalTransactions,
    'hourlySum=' + hourlyTotalTxn + ' total=' + dSum.totalTransactions);

  // 9. DB raw verification
  section('9. DB raw verification');
  var pool = getPool();
  var dbRes = await pool.query(
    'SELECT payment_mode, COUNT(*) as txn_count, ' +
    'SUM(total_amount) as total_amount, SUM(amount) as base_amount, SUM(tip_amount) as tip_amount ' +
    'FROM payments WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status = \'completed\' ' +
    'GROUP BY payment_mode ORDER BY total_amount DESC',
    [OUTLET_ID, START, END]
  );
  var dbRows = dbRes[0];

  test('DB mode count matches', dbRows.length === dModes.length,
    'db=' + dbRows.length + ' detail=' + dModes.length);

  var dbTotalAmt = dbRows.reduce(function(s, r) { return s + parseFloat(r.total_amount); }, 0);
  var dbTotalTxn = dbRows.reduce(function(s, r) { return s + parseInt(r.txn_count); }, 0);
  var dbTotalTips = dbRows.reduce(function(s, r) { return s + parseFloat(r.tip_amount); }, 0);

  test('DB total amount match', Math.abs(dbTotalAmt - dSum.totalCollected) < 1,
    'db=' + dbTotalAmt.toFixed(2) + ' detail=' + dSum.totalCollected);
  test('DB total transactions match', dbTotalTxn === dSum.totalTransactions,
    'db=' + dbTotalTxn + ' detail=' + dSum.totalTransactions);
  test('DB total tips match', Math.abs(dbTotalTips - dSum.totalTips) < 0.1,
    'db=' + dbTotalTips.toFixed(2) + ' detail=' + dSum.totalTips);

  // Per-mode DB spot check
  var dbModeMismatch = 0;
  for (var k = 0; k < dbRows.length; k++) {
    var dbMode = dbRows[k];
    var detMode = dModes.find(function(m) { return m.paymentMode === dbMode.payment_mode; });
    if (!detMode) { dbModeMismatch++; continue; }
    if (Math.abs(parseFloat(dbMode.total_amount) - detMode.totalAmount) >= 1 ||
        parseInt(dbMode.txn_count) !== detMode.transactionCount) {
      console.log('   DB MISMATCH ' + dbMode.payment_mode +
        ': dbAmt=' + dbMode.total_amount + '/' + detMode.totalAmount +
        ' dbTxn=' + dbMode.txn_count + '/' + detMode.transactionCount);
      dbModeMismatch++;
    }
  }
  test('All modes match DB', dbModeMismatch === 0, dbModeMismatch + ' mismatches');

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
