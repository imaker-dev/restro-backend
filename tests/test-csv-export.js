/**
 * Test Script: CSV Export API Verification
 * 
 * Tests all CSV export endpoints with filters
 * Run: node tests/test-csv-export.js
 */

const { initializeDatabase, getPool } = require('../src/database');
const reportsService = require('../src/services/reports.service');
const csvExport = require('../src/utils/csv-export');

const OUTLET_ID = 43;
const START_DATE = '2026-03-01';
const END_DATE = '2026-03-07';
const FILTERS = { startDate: START_DATE, endDate: END_DATE, outletId: OUTLET_ID };

let passed = 0, failed = 0;

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`   ✅ ${name}${detail ? ` - ${detail}` : ''}`);
    passed++;
    return true;
  } else {
    console.log(`   ❌ ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
    return false;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(70));
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  CSV EXPORT API VERIFICATION TEST');
  console.log('═'.repeat(70));

  await initializeDatabase();
  const pool = getPool();

  // Get an outlet for testing
  const [outlets] = await pool.query('SELECT id, name FROM outlets LIMIT 1');
  if (outlets.length === 0) {
    console.log('\n   ⚠️ No outlets found for testing');
    process.exit(0);
  }

  const outletId = outlets[0].id;
  const outletName = outlets[0].name;
  const startDate = '2026-01-01';
  const endDate = '2026-03-31';
  const filters = { startDate, endDate, outletId, outletName };

  console.log(`\n   Testing with Outlet: ${outletName} (ID: ${outletId})`);
  console.log(`   Date Range: ${startDate} to ${endDate}`);

  // ══════════════════════════════════════════════════════════════
  // TEST 1: Daily Sales Export
  // ══════════════════════════════════════════════════════════════
  section('1. Daily Sales Export');
  try {
    const report = await reportsService.getDailySalesReport(outletId, startDate, endDate, []);
    const csv = csvExport.dailySalesCSV(report, filters);
    
    test('Daily Sales CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has header row', csv.includes('Date,'), 'Found header');
    test('CSV has title', csv.includes('Daily Sales Report'), 'Found title');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Daily Sales Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 2: Item Sales Export
  // ══════════════════════════════════════════════════════════════
  section('2. Item Sales Export');
  try {
    const report = await reportsService.getItemSalesReport(outletId, startDate, endDate, 100, []);
    const csv = csvExport.itemSalesCSV(report, filters);
    
    test('Item Sales CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Item Name column', csv.includes('Item Name'), 'Found column');
    test('CSV has Qty Sold column', csv.includes('Qty Sold'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Item Sales Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 3: Category Sales Export
  // ══════════════════════════════════════════════════════════════
  section('3. Category Sales Export');
  try {
    const report = await reportsService.getCategorySalesReport(outletId, startDate, endDate, []);
    const csv = csvExport.categorySalesCSV(report, filters);
    
    test('Category Sales CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Category column', csv.includes('Category'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Category Sales Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 4: Staff Report Export
  // ══════════════════════════════════════════════════════════════
  section('4. Staff Report Export');
  try {
    const report = await reportsService.getStaffReport(outletId, startDate, endDate, []);
    const csv = csvExport.staffReportCSV(report, filters);
    
    test('Staff Report CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Staff Name column', csv.includes('Staff Name'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Staff Report Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 5: Payment Mode Export
  // ══════════════════════════════════════════════════════════════
  section('5. Payment Mode Export');
  try {
    const report = await reportsService.getPaymentModeReport(outletId, startDate, endDate, []);
    const csv = csvExport.paymentModeCSV(report, filters);
    
    test('Payment Mode CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Payment Mode column', csv.includes('Payment Mode'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Payment Mode Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 6: Tax Report Export
  // ══════════════════════════════════════════════════════════════
  section('6. Tax Report Export');
  try {
    const report = await reportsService.getTaxReport(outletId, startDate, endDate, []);
    const csv = csvExport.taxReportCSV(report, filters);
    
    test('Tax Report CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Date column', csv.includes('Date,'), 'Found column');
    test('CSV has Total Tax column', csv.includes('Total Tax'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Tax Report Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 7: Floor Section Export
  // ══════════════════════════════════════════════════════════════
  section('7. Floor Section Export');
  try {
    const report = await reportsService.getFloorSectionReport(outletId, startDate, endDate, []);
    const csv = csvExport.floorSectionCSV(report, filters);
    
    test('Floor Section CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Floor/Section column', csv.includes('Floor'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Floor Section Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 8: Counter Sales Export
  // ══════════════════════════════════════════════════════════════
  section('8. Counter Sales Export');
  try {
    const report = await reportsService.getCounterSalesReport(outletId, startDate, endDate, []);
    const csv = csvExport.counterSalesCSV(report, filters);
    
    test('Counter Sales CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Counter/Station column', csv.includes('Counter') || csv.includes('Station'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Counter Sales Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 9: Cancellation Report Export
  // ══════════════════════════════════════════════════════════════
  section('9. Cancellation Report Export');
  try {
    const report = await reportsService.getCancellationReport(outletId, startDate, endDate, []);
    const csv = csvExport.cancellationCSV(report, filters);
    
    test('Cancellation CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Cancel Type column', csv.includes('Cancel Type'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Cancellation Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 10: Running Tables Export
  // ══════════════════════════════════════════════════════════════
  section('10. Running Tables Export');
  try {
    const report = await reportsService.getRunningTables(outletId, []);
    const csv = csvExport.runningTablesCSV(report, { outletId });
    
    test('Running Tables CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Table No column', csv.includes('Table No'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Running Tables Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 11: Running Orders Export
  // ══════════════════════════════════════════════════════════════
  section('11. Running Orders Export');
  try {
    const report = await reportsService.getRunningOrders(outletId, []);
    const csv = csvExport.runningOrdersCSV(report, { outletId });
    
    test('Running Orders CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Order No column', csv.includes('Order No'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Running Orders Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 12: Service Type Breakdown Export
  // ══════════════════════════════════════════════════════════════
  section('12. Service Type Breakdown Export');
  try {
    const report = await reportsService.getServiceTypeSalesBreakdown(outletId, startDate, endDate, []);
    const csv = csvExport.serviceTypeCSV(report, filters);
    
    test('Service Type CSV generated', csv && csv.length > 0, `${csv.length} chars`);
    test('CSV has Service Type column', csv.includes('Service Type'), 'Found column');
    
    console.log(`   Preview (first 300 chars):\n   ${csv.substring(0, 300).replace(/\n/g, '\n   ')}`);
  } catch (err) {
    test('Service Type Export', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 13: Filename Generation
  // ══════════════════════════════════════════════════════════════
  section('13. Filename Generation');
  const fn1 = csvExport.generateFilename('daily_sales', { startDate: '2026-01-01', endDate: '2026-01-31' });
  const fn2 = csvExport.generateFilename('running_tables', {});
  
  test('Filename includes report name', fn1.includes('daily_sales'), fn1);
  test('Filename includes date range', fn1.includes('2026-01-01'), fn1);
  test('Filename has .csv extension', fn1.endsWith('.csv'), fn1);
  test('Running report filename works', fn2.includes('running_tables'), fn2);

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  TEST RESULTS SUMMARY');
  console.log('═'.repeat(70));
  console.log(`\n   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log(`\n   ✅ ALL CSV EXPORT TESTS PASSED!`);
  } else {
    console.log(`\n   ⚠️ ${failed} TEST(S) FAILED`);
  }
  
  console.log('═'.repeat(70));
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
