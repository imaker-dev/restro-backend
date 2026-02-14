/**
 * Test: Tax Detail Report
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
  console.log('Tax Detail Report — Test & Verification');
  await initializeDatabase();

  var login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  var token = login.data.data.accessToken || login.data.data.token;
  var api = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + token } });

  // 1. Fetch both reports
  section('1. Fetch reports');
  var summaryRes = await api.get('/orders/reports/' + OUTLET_ID + '/tax?startDate=' + START + '&endDate=' + END);
  var detailRes = await api.get('/orders/reports/' + OUTLET_ID + '/tax/detail?startDate=' + START + '&endDate=' + END);

  test('Summary status 200', summaryRes.status === 200);
  test('Detail status 200', detailRes.status === 200);

  var sData = summaryRes.data.data;
  var detail = detailRes.data.data;
  var dSum = detail.summary;
  var dInvoices = detail.invoices;

  test('Detail has invoices', dInvoices.length > 0, 'count: ' + dInvoices.length);
  test('Detail has summary', !!dSum);
  test('Detail has dateRange', !!detail.dateRange);

  // 2. Cross-verify totals against summary report
  section('2. Cross-verify totals (summary vs detail)');
  var sSummary = sData.summary;

  test('Invoice count match', parseInt(sSummary.total_invoices) === dSum.totalInvoices,
    'summary=' + sSummary.total_invoices + ' detail=' + dSum.totalInvoices);
  test('Subtotal match', Math.abs(parseFloat(sSummary.total_subtotal) - dSum.totalSubtotal) < 1,
    'summary=' + sSummary.total_subtotal + ' detail=' + dSum.totalSubtotal);
  test('Discount match', Math.abs(parseFloat(sSummary.total_discount) - dSum.totalDiscount) < 1,
    'summary=' + sSummary.total_discount + ' detail=' + dSum.totalDiscount);
  test('Taxable match', Math.abs(parseFloat(sSummary.total_taxable) - dSum.totalTaxable) < 1,
    'summary=' + sSummary.total_taxable + ' detail=' + dSum.totalTaxable);
  test('CGST match', Math.abs(parseFloat(sSummary.total_cgst) - dSum.totalCgst) < 1,
    'summary=' + sSummary.total_cgst + ' detail=' + dSum.totalCgst);
  test('SGST match', Math.abs(parseFloat(sSummary.total_sgst) - dSum.totalSgst) < 1,
    'summary=' + sSummary.total_sgst + ' detail=' + dSum.totalSgst);
  test('Total tax match', Math.abs(parseFloat(sSummary.total_tax) - dSum.totalTax) < 1,
    'summary=' + sSummary.total_tax + ' detail=' + dSum.totalTax);
  test('Grand total match', Math.abs(parseFloat(sSummary.total_grand) - dSum.totalGrandTotal) < 1,
    'summary=' + sSummary.total_grand + ' detail=' + dSum.totalGrandTotal);
  test('Service charge match', Math.abs(parseFloat(sSummary.total_service_charge) - dSum.totalServiceCharge) < 1,
    'summary=' + sSummary.total_service_charge + ' detail=' + dSum.totalServiceCharge);

  // 3. Cross-verify tax components
  section('3. Tax components cross-check');
  var sComponents = sData.taxComponents;
  var dComponents = dSum.taxComponents;
  test('Component count match', sComponents.length === dComponents.length,
    'summary=' + sComponents.length + ' detail=' + dComponents.length);

  var compMismatch = 0;
  for (var i = 0; i < sComponents.length; i++) {
    var sc = sComponents[i];
    var dc = dComponents.find(function(c) { return c.code === sc.code; });
    if (!dc) { compMismatch++; continue; }
    if (Math.abs(sc.taxAmount - dc.taxAmount) >= 0.1 || Math.abs(sc.taxableAmount - dc.taxableAmount) >= 0.1) {
      console.log('   MISMATCH component ' + sc.code +
        ': taxAmt=' + sc.taxAmount + '/' + dc.taxAmount +
        ' taxable=' + sc.taxableAmount + '/' + dc.taxableAmount);
      compMismatch++;
    }
  }
  test('All tax components match', compMismatch === 0, compMismatch + ' mismatches');

  // 4. Daily breakdown cross-check (summary daily rows vs detail daily breakdown)
  section('4. Daily breakdown cross-check');
  var sDaily = sData.daily;
  var dDaily = dSum.dailyBreakdown;
  test('Daily row count match', sDaily.length === dDaily.length,
    'summary=' + sDaily.length + ' detail=' + dDaily.length);

  var dailyMismatch = 0;
  for (var j = 0; j < sDaily.length; j++) {
    var sd = sDaily[j];
    var sdDate = sd.report_date;
    if (typeof sdDate === 'object' && sdDate !== null) {
      sdDate = new Date(sdDate).toISOString().slice(0, 10);
    }
    var dd = dDaily.find(function(d) { return d.date === sdDate; });
    if (!dd) {
      // Try matching with formatted date
      dd = dDaily.find(function(d) { return String(d.date) === String(sdDate); });
    }
    if (!dd) { dailyMismatch++; continue; }
    var taxOk = Math.abs(parseFloat(sd.total_tax) - dd.totalTax) < 1;
    var grandOk = Math.abs(parseFloat(sd.grand_total) - dd.grandTotal) < 1;
    var invOk = parseInt(sd.invoice_count) === dd.invoiceCount;
    if (!taxOk || !grandOk || !invOk) {
      console.log('   DAILY MISMATCH ' + sdDate +
        ': tax=' + sd.total_tax + '/' + dd.totalTax +
        ' grand=' + sd.grand_total + '/' + dd.grandTotal +
        ' inv=' + sd.invoice_count + '/' + dd.invoiceCount);
      dailyMismatch++;
    }
  }
  test('All daily rows match', dailyMismatch === 0, dailyMismatch + ' mismatches');

  // 5. Per-invoice sum verification
  section('5. Per-invoice sum verification');
  var invTaxSum = dInvoices.reduce(function(s, inv) { return s + inv.totalTax; }, 0);
  var invGrandSum = dInvoices.reduce(function(s, inv) { return s + inv.grandTotal; }, 0);
  var invSubSum = dInvoices.reduce(function(s, inv) { return s + inv.subtotal; }, 0);
  var invCgstSum = dInvoices.reduce(function(s, inv) { return s + inv.cgstAmount; }, 0);
  var invSgstSum = dInvoices.reduce(function(s, inv) { return s + inv.sgstAmount; }, 0);

  test('Invoice tax sum = summary totalTax', Math.abs(invTaxSum - dSum.totalTax) < 1,
    'invSum=' + invTaxSum.toFixed(2) + ' summary=' + dSum.totalTax);
  test('Invoice grand sum = summary grandTotal', Math.abs(invGrandSum - dSum.totalGrandTotal) < 1,
    'invSum=' + invGrandSum.toFixed(2) + ' summary=' + dSum.totalGrandTotal);
  test('Invoice subtotal sum = summary subtotal', Math.abs(invSubSum - dSum.totalSubtotal) < 1,
    'invSum=' + invSubSum.toFixed(2) + ' summary=' + dSum.totalSubtotal);
  test('Invoice CGST sum = summary CGST', Math.abs(invCgstSum - dSum.totalCgst) < 1,
    'invSum=' + invCgstSum.toFixed(2) + ' summary=' + dSum.totalCgst);
  test('Invoice SGST sum = summary SGST', Math.abs(invSgstSum - dSum.totalSgst) < 1,
    'invSum=' + invSgstSum.toFixed(2) + ' summary=' + dSum.totalSgst);

  // 6. Invoice data quality
  section('6. Invoice data quality');
  var inv0 = dInvoices[0];
  test('Invoice has invoiceNumber', !!inv0.invoiceNumber);
  test('Invoice has orderNumber', !!inv0.orderNumber);
  test('Invoice has orderType', !!inv0.orderType);
  test('Invoice has invoiceDate', !!inv0.invoiceDate);
  test('Invoice has subtotal >= 0', inv0.subtotal >= 0);
  test('Invoice has totalTax >= 0', inv0.totalTax >= 0);
  test('Invoice has grandTotal > 0', inv0.grandTotal > 0);
  test('Invoice has items array', Array.isArray(inv0.items));
  test('Invoice has payments array', Array.isArray(inv0.payments));
  test('Invoice has invoiceCreatedAt', !!inv0.invoiceCreatedAt);

  // Dine-in invoice should have table
  var dineInInv = dInvoices.find(function(inv) { return inv.orderType === 'dine_in'; });
  if (dineInInv) {
    test('Dine-in invoice has tableNumber', dineInInv.tableNumber !== null);
    test('Dine-in invoice has floorName', dineInInv.floorName !== null);
    test('Dine-in invoice has captainName', dineInInv.captainName !== null);
  }

  // Invoice with items should have per-item tax
  var invWithItems = dInvoices.find(function(inv) { return inv.items.length > 0; });
  if (invWithItems) {
    var item0 = invWithItems.items[0];
    test('Item has itemName', !!item0.itemName);
    test('Item has quantity > 0', item0.quantity > 0);
    test('Item has taxAmount field', item0.taxAmount !== undefined);
  }

  // 7. Effective tax rate & avg tax sanity
  section('7. Computed metrics sanity');
  test('effectiveTaxRate > 0', dSum.effectiveTaxRate > 0, 'rate=' + dSum.effectiveTaxRate);
  test('avgTaxPerInvoice > 0', dSum.avgTaxPerInvoice > 0, 'avg=' + dSum.avgTaxPerInvoice);
  var calcAvg = parseFloat((dSum.totalTax / dSum.totalInvoices).toFixed(2));
  test('avgTaxPerInvoice is correct', Math.abs(calcAvg - dSum.avgTaxPerInvoice) < 0.1,
    'calc=' + calcAvg + ' reported=' + dSum.avgTaxPerInvoice);
  var calcRate = parseFloat(((dSum.totalTax / dSum.totalTaxable) * 100).toFixed(2));
  test('effectiveTaxRate is correct', Math.abs(calcRate - dSum.effectiveTaxRate) < 0.1,
    'calc=' + calcRate + ' reported=' + dSum.effectiveTaxRate);

  // 8. Rate breakdown
  section('8. Rate breakdown');
  test('Has rate breakdown', dSum.rateBreakdown.length > 0);

  // 9. DB raw verification
  section('9. DB raw verification');
  var pool = getPool();
  var dbRes = await pool.query(
    'SELECT COUNT(*) as inv_count, ' +
    'SUM(subtotal) as total_subtotal, SUM(discount_amount) as total_discount, ' +
    'SUM(taxable_amount) as total_taxable, ' +
    'SUM(cgst_amount) as total_cgst, SUM(sgst_amount) as total_sgst, ' +
    'SUM(igst_amount) as total_igst, SUM(vat_amount) as total_vat, ' +
    'SUM(cess_amount) as total_cess, SUM(total_tax) as total_tax, ' +
    'SUM(service_charge) as total_sc, SUM(grand_total) as total_grand ' +
    'FROM invoices WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND is_cancelled = 0',
    [OUTLET_ID, START, END]
  );
  var db = dbRes[0][0];

  test('DB invoice count match', parseInt(db.inv_count) === dSum.totalInvoices,
    'db=' + db.inv_count + ' detail=' + dSum.totalInvoices);
  test('DB subtotal match', Math.abs(parseFloat(db.total_subtotal) - dSum.totalSubtotal) < 1,
    'db=' + db.total_subtotal + ' detail=' + dSum.totalSubtotal);
  test('DB taxable match', Math.abs(parseFloat(db.total_taxable) - dSum.totalTaxable) < 1,
    'db=' + db.total_taxable + ' detail=' + dSum.totalTaxable);
  test('DB CGST match', Math.abs(parseFloat(db.total_cgst) - dSum.totalCgst) < 1,
    'db=' + db.total_cgst + ' detail=' + dSum.totalCgst);
  test('DB SGST match', Math.abs(parseFloat(db.total_sgst) - dSum.totalSgst) < 1,
    'db=' + db.total_sgst + ' detail=' + dSum.totalSgst);
  test('DB total tax match', Math.abs(parseFloat(db.total_tax) - dSum.totalTax) < 1,
    'db=' + db.total_tax + ' detail=' + dSum.totalTax);
  test('DB grand total match', Math.abs(parseFloat(db.total_grand) - dSum.totalGrandTotal) < 1,
    'db=' + db.total_grand + ' detail=' + dSum.totalGrandTotal);
  test('DB service charge match', Math.abs(parseFloat(db.total_sc) - dSum.totalServiceCharge) < 1,
    'db=' + db.total_sc + ' detail=' + dSum.totalServiceCharge);

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
