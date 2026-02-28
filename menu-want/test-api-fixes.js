/**
 * Test: API Fixes Verification
 * Tests:
 * 1. GET /tables/floor/:floorId - shift status and sections
 * 2. GET /reports/:outletId/floor-section - sections inside floors
 * 3. Bulk upload preview - VAT and serviceType
 * 4. Cancellation report - all roles
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testAPIFixes() {
  console.log('='.repeat(80));
  console.log('API FIXES VERIFICATION TEST');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Test 1: Tables/Floor API with shift status
    console.log('\n--- Test 1: Tables/Floor API Structure ---');
    const tableService = require('../src/services/table.service');
    
    // Get a floor ID to test
    const [floors] = await pool.query('SELECT id, name, outlet_id FROM floors WHERE is_active = 1 LIMIT 1');
    if (floors.length > 0) {
      const floorId = floors[0].id;
      console.log(`Testing floor: ${floors[0].name} (ID: ${floorId})`);
      
      const result = await tableService.getByFloor(floorId);
      
      console.log('Response structure:');
      console.log('  - floor:', result.floor ? '✅ Present' : '❌ Missing');
      console.log('  - shift:', result.shift ? '✅ Present' : '❌ Missing');
      console.log('  - sections:', result.sections ? `✅ Present (${result.sections.length} sections)` : '❌ Missing');
      console.log('  - tables:', result.tables ? `✅ Present (${result.tables.length} tables)` : '❌ Missing');
      
      if (result.shift) {
        console.log('  Shift details:');
        console.log(`    - isOpen: ${result.shift.isOpen}`);
        console.log(`    - cashierName: ${result.shift.cashierName || 'N/A'}`);
      }
    } else {
      console.log('  No floors found to test');
    }

    // Test 2: Floor-Section Report Structure
    console.log('\n--- Test 2: Floor-Section Report Structure ---');
    const reportsService = require('../src/services/reports.service');
    
    const [outlets] = await pool.query('SELECT id FROM outlets WHERE is_active = 1 LIMIT 1');
    if (outlets.length > 0) {
      const outletId = outlets[0].id;
      const report = await reportsService.getFloorSectionReport(outletId, null, null, {});
      
      console.log('Response structure:');
      console.log('  - dateRange:', report.dateRange ? '✅ Present' : '❌ Missing');
      console.log('  - floors:', report.floors ? `✅ Present (${report.floors.length} floors)` : '❌ Missing');
      console.log('  - summary:', report.summary ? '✅ Present' : '❌ Missing');
      console.log('  - pagination:', report.pagination ? '✅ Present' : '❌ Missing');
      
      if (report.floors && report.floors.length > 0) {
        const firstFloor = report.floors[0];
        console.log('  First floor structure:');
        console.log(`    - floorId: ${firstFloor.floorId}`);
        console.log(`    - floorName: ${firstFloor.floorName}`);
        console.log(`    - sections: ${firstFloor.sections ? `✅ Present (${firstFloor.sections.length} sections)` : '❌ Missing'}`);
        console.log(`    - orderCount: ${firstFloor.orderCount}`);
        console.log(`    - netSales: ₹${firstFloor.netSales}`);
      }
    }

    // Test 3: Bulk Upload Preview Structure
    console.log('\n--- Test 3: Bulk Upload Preview Structure ---');
    const bulkUploadService = require('../src/services/bulkUpload.service');
    
    // Test CSV with VAT and ServiceType
    const testCSV = `Type,Name,Category,Price,ItemType,GST,VAT,Station,Description,ServiceType
CATEGORY,Test Category,,,,,,,Test description,restaurant
ITEM,Test Item,Test Category,100,veg,5,,Kitchen,Test item desc,restaurant
ITEM,Test Liquor,Beverages,200,veg,,18,Bar,Liquor item,bar`;
    
    const parseResult = bulkUploadService.parseCSV(testCSV);
    console.log('  Parse result:', parseResult.success ? '✅ Success' : '❌ Failed');
    
    if (parseResult.success) {
      console.log('  Records parsed:', parseResult.records.length);
      const itemRecord = parseResult.records.find(r => r.Type === 'ITEM' && r.VAT);
      if (itemRecord) {
        console.log('  VAT item found:');
        console.log(`    - Name: ${itemRecord.Name}`);
        console.log(`    - VAT: ${itemRecord.VAT}`);
        console.log(`    - ServiceType: ${itemRecord.ServiceType}`);
      }
    }

    // Test 4: Cancellation Report
    console.log('\n--- Test 4: Cancellation Report Structure ---');
    if (outlets.length > 0) {
      const outletId = outlets[0].id;
      const cancelReport = await reportsService.getCancellationReport(outletId, null, null, []);
      
      console.log('Response structure:');
      console.log('  - dateRange:', cancelReport.dateRange ? '✅ Present' : '❌ Missing');
      console.log('  - order_cancellations:', cancelReport.order_cancellations ? `✅ Present (${cancelReport.order_cancellations.length})` : '❌ Missing');
      console.log('  - item_cancellations:', cancelReport.item_cancellations ? `✅ Present (${cancelReport.item_cancellations.length})` : '❌ Missing');
      console.log('  - daily_breakdown:', cancelReport.daily_breakdown ? `✅ Present (${cancelReport.daily_breakdown.length} days)` : '❌ Missing');
      console.log('  - summary:', cancelReport.summary ? '✅ Present' : '❌ Missing');
      
      if (cancelReport.summary) {
        console.log('  Summary:');
        console.log(`    - total_order_cancellations: ${cancelReport.summary.total_order_cancellations}`);
        console.log(`    - total_item_cancellations: ${cancelReport.summary.total_item_cancellations}`);
        console.log(`    - total_cancel_amount: ₹${cancelReport.summary.total_cancel_amount}`);
      }
      
      if (cancelReport.order_cancellations.length > 0) {
        const firstCancel = cancelReport.order_cancellations[0];
        console.log('  First order cancellation fields:');
        console.log(`    - order_number: ${firstCancel.order_number}`);
        console.log(`    - captain_name: ${firstCancel.captain_name || 'N/A'}`);
        console.log(`    - floor_name: ${firstCancel.floor_name || 'N/A'}`);
        console.log(`    - cancelled_by_name: ${firstCancel.cancelled_by_name || 'N/A'}`);
      }
    }

    // Test 5: Template Structure (VAT and ServiceType columns)
    console.log('\n--- Test 5: Bulk Upload Template ---');
    const template = bulkUploadService.generateTemplate();
    const hasVAT = template.includes('VAT');
    const hasServiceType = template.includes('ServiceType');
    console.log(`  Template has VAT column: ${hasVAT ? '✅ Yes' : '❌ No'}`);
    console.log(`  Template has ServiceType column: ${hasServiceType ? '✅ Yes' : '❌ No'}`);

    console.log('\n' + '='.repeat(80));
    console.log('API FIXES VERIFICATION COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testAPIFixes();
