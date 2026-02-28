/**
 * Test: Report API Fixes
 * Verifies:
 * 1. Floor-section report - sections nested inside floors
 * 2. Counter report - actual station names not just types
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testReportFixes() {
  console.log('='.repeat(80));
  console.log('REPORT API FIXES TEST');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();
    const reportsService = require('../src/services/reports.service');

    // Get an outlet to test
    const [outlets] = await pool.query('SELECT id, name FROM outlets WHERE is_active = 1 LIMIT 1');
    if (outlets.length === 0) {
      console.log('❌ No active outlets found');
      process.exit(1);
    }
    const outletId = outlets[0].id;
    console.log(`\nTesting outlet: ${outlets[0].name} (ID: ${outletId})`);

    // Test 1: Floor-Section Report
    console.log('\n--- 1. Floor-Section Report ---');
    const floorSectionReport = await reportsService.getFloorSectionReport(outletId, null, null, {});
    
    console.log('Response structure:');
    console.log(`  - dateRange: ${floorSectionReport.dateRange ? '✅' : '❌'}`);
    console.log(`  - floors: ${floorSectionReport.floors ? `✅ (${floorSectionReport.floors.length} floors)` : '❌'}`);
    console.log(`  - sections (separate): ${floorSectionReport.sections ? '❌ Should not exist!' : '✅ Correctly removed'}`);
    console.log(`  - summary: ${floorSectionReport.summary ? '✅' : '❌'}`);
    console.log(`  - pagination: ${floorSectionReport.pagination ? '✅' : '❌'}`);

    if (floorSectionReport.floors && floorSectionReport.floors.length > 0) {
      console.log('\n  Floor structure check:');
      for (const floor of floorSectionReport.floors) {
        const hasSections = floor.sections && Array.isArray(floor.sections);
        console.log(`    ${floor.floorName}: sections=${hasSections ? `✅ (${floor.sections.length})` : '❌ Missing'}`);
        if (hasSections && floor.sections.length > 0) {
          for (const section of floor.sections) {
            console.log(`      - ${section.sectionName}: orders=${section.orderCount}, sales=₹${section.netSales}`);
          }
        }
      }
    }

    // Test 2: Counter Sales Report  
    console.log('\n--- 2. Counter Sales Report ---');
    const counterReport = await reportsService.getCounterSalesReport(outletId, null, null, []);
    
    console.log('Response structure:');
    console.log(`  - dateRange: ${counterReport.dateRange ? '✅' : '❌'}`);
    console.log(`  - stations: ${counterReport.stations ? `✅ (${counterReport.stations.length} stations)` : '❌'}`);
    console.log(`  - summary: ${counterReport.summary ? '✅' : '❌'}`);

    if (counterReport.stations && counterReport.stations.length > 0) {
      console.log('\n  Station structure check:');
      for (const station of counterReport.stations) {
        console.log(`    ${station.stationName} (${station.stationType}):`);
        console.log(`      - stationId: ${station.stationId || 'N/A'}`);
        console.log(`      - stationCategory: ${station.stationCategory}`);
        console.log(`      - tickets: ${station.ticketCount}, items: ${station.itemCount}`);
        console.log(`      - served: ${station.servedCount}, cancelled: ${station.cancelledCount}`);
      }
    } else {
      console.log('  No stations found in date range');
    }

    // Summary
    console.log('\n--- Summary ---');
    const floorSectionOk = !floorSectionReport.sections && 
                          floorSectionReport.floors?.every(f => Array.isArray(f.sections));
    const counterOk = counterReport.stations?.every(s => s.stationName && s.stationType);
    
    console.log(`Floor-Section Report: ${floorSectionOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Counter Report: ${counterOk ? '✅ PASS' : '❌ FAIL'}`);

    console.log('\n' + '='.repeat(80));
    console.log('REPORT FIXES TEST COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testReportFixes();
