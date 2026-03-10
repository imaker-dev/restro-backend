/**
 * Test Script: New CSV Export Verification (Shift + Day-End)
 * Run: node tests/test-new-csv-exports.js
 */

const { initializeDatabase } = require('../src/database');
const paymentService = require('../src/services/payment.service');
const reportsService = require('../src/services/reports.service');
const csvExport = require('../src/utils/csv-export');

const OUTLET_ID = 43;
const START = '2026-03-01';
const END = '2026-03-07';
const FILTERS = { startDate: START, endDate: END, outletId: OUTLET_ID };

async function runTests() {
  await initializeDatabase();
  
  console.log('═'.repeat(60));
  console.log('  NEW CSV EXPORT VERIFICATION');
  console.log('═'.repeat(60));
  console.log(`  Outlet: ${OUTLET_ID}, Date: ${START} to ${END}\n`);

  let passed = 0, failed = 0;

  const tests = [
    {
      name: 'Shift History',
      run: async () => {
        const data = await paymentService.getShiftHistory({
          outletId: OUTLET_ID,
          startDate: START,
          endDate: END
        });
        return csvExport.shiftHistoryCSV(data, FILTERS);
      }
    },
    {
      name: 'Shift Detail',
      run: async () => {
        const data = await paymentService.getShiftDetail(82);
        return csvExport.shiftDetailCSV(data, { shiftId: 82 });
      }
    },
    {
      name: 'Day End Summary',
      run: async () => {
        const data = await reportsService.getDayEndSummary(OUTLET_ID, START, END, []);
        return csvExport.dayEndSummaryCSV(data, FILTERS);
      }
    },
    {
      name: 'Day End Detail',
      run: async () => {
        const data = await reportsService.getDayEndSummaryDetail(OUTLET_ID, '2026-03-07', '2026-03-07', []);
        return csvExport.dayEndSummaryDetailCSV(data, FILTERS);
      }
    }
  ];

  for (const test of tests) {
    try {
      const result = await test.run();
      const hasContent = result && result.length > 50;
      const noObjectObject = !result.includes('[object Object]');
      const hasDataRows = result.split('\n').length > 5;
      
      const ok = hasContent && noObjectObject && hasDataRows;
      
      if (ok) {
        console.log(`  ✅ ${test.name.padEnd(20)} ${result.length} chars`);
        // Show first 400 chars preview
        console.log(`     Preview: ${result.substring(0, 200).replace(/\n/g, ' | ')}`);
        passed++;
      } else {
        const issues = [];
        if (!hasContent) issues.push('empty');
        if (!noObjectObject) issues.push('[object Object]');
        if (!hasDataRows) issues.push('no rows');
        console.log(`  ❌ ${test.name.padEnd(20)} ISSUES: ${issues.join(', ')}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ ${test.name.padEnd(20)} ERROR: ${err.message}`);
      failed++;
    }
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
