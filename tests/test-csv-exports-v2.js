/**
 * Test Script: CSV Export Verification
 * Run: node tests/test-csv-exports-v2.js
 */

const { initializeDatabase } = require('../src/database');
const rs = require('../src/services/reports.service');
const csv = require('../src/utils/csv-export');

const OUTLET_ID = 43;
const START = '2026-03-01';
const END = '2026-03-07';
const FILTERS = { startDate: START, endDate: END, outletId: OUTLET_ID };

async function runTests() {
  await initializeDatabase();
  
  console.log('═'.repeat(60));
  console.log('  CSV EXPORT VERIFICATION');
  console.log('═'.repeat(60));
  console.log(`  Outlet: ${OUTLET_ID}, Date: ${START} to ${END}\n`);

  let passed = 0, failed = 0;

  const tests = [
    {
      name: 'Daily Sales',
      run: async () => {
        const data = await rs.getDailySalesReport(OUTLET_ID, START, END, []);
        return csv.dailySalesCSV(data, FILTERS);
      }
    },
    {
      name: 'Item Sales',
      run: async () => {
        const data = await rs.getItemSalesReport(OUTLET_ID, START, END, 100, []);
        return csv.itemSalesCSV(data, FILTERS);
      }
    },
    {
      name: 'Category Sales',
      run: async () => {
        const data = await rs.getCategorySalesReport(OUTLET_ID, START, END, []);
        return csv.categorySalesCSV(data, FILTERS);
      }
    },
    {
      name: 'Staff Report',
      run: async () => {
        const data = await rs.getStaffReport(OUTLET_ID, START, END, []);
        return csv.staffReportCSV(data, FILTERS);
      }
    },
    {
      name: 'Payment Mode',
      run: async () => {
        const data = await rs.getPaymentModeReport(OUTLET_ID, START, END, []);
        return csv.paymentModeCSV(data, FILTERS);
      }
    },
    {
      name: 'Tax Report',
      run: async () => {
        const data = await rs.getTaxReport(OUTLET_ID, START, END, []);
        return csv.taxReportCSV(data, FILTERS);
      }
    },
    {
      name: 'Floor Section',
      run: async () => {
        const data = await rs.getFloorSectionReport(OUTLET_ID, START, END, []);
        return csv.floorSectionCSV(data, FILTERS);
      }
    },
    {
      name: 'Counter Sales',
      run: async () => {
        const data = await rs.getCounterSalesReport(OUTLET_ID, START, END, []);
        return csv.counterSalesCSV(data, FILTERS);
      }
    },
    {
      name: 'Cancellation',
      run: async () => {
        const data = await rs.getCancellationReport(OUTLET_ID, START, END, []);
        return csv.cancellationCSV(data, FILTERS);
      }
    },
    {
      name: 'Service Type',
      run: async () => {
        const data = await rs.getServiceTypeSalesBreakdown(OUTLET_ID, START, END, []);
        return csv.serviceTypeCSV(data, FILTERS);
      }
    },
    {
      name: 'Running Tables',
      run: async () => {
        const data = await rs.getRunningTables(OUTLET_ID, []);
        return csv.runningTablesCSV(data, { outletId: OUTLET_ID });
      }
    },
    {
      name: 'Running Orders',
      run: async () => {
        const data = await rs.getRunningOrders(OUTLET_ID, []);
        return csv.runningOrdersCSV(data, { outletId: OUTLET_ID });
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
        console.log(`  ✅ ${test.name.padEnd(18)} ${result.length} chars`);
        passed++;
      } else {
        const issues = [];
        if (!hasContent) issues.push('empty');
        if (!noObjectObject) issues.push('[object Object]');
        if (!hasDataRows) issues.push('no rows');
        console.log(`  ❌ ${test.name.padEnd(18)} ISSUES: ${issues.join(', ')}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ ${test.name.padEnd(18)} ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
