/**
 * Test Reports API Fixes
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const reportsService = require('../src/services/reports.service');

async function testReportsFix() {
  console.log('='.repeat(70));
  console.log('REPORTS API FIX TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Get a test outlet
    const [outlets] = await pool.query(`SELECT id FROM outlets WHERE is_active = 1 LIMIT 1`);
    if (outlets.length === 0) {
      console.log('No active outlets found');
      process.exit(0);
    }
    const outletId = outlets[0].id;
    const today = new Date().toISOString().slice(0, 10);

    // 1. Test Counter Report (original format)
    console.log('\n--- 1. Testing Counter Report (Original Format) ---');
    const counterReport = await reportsService.getCounterSalesReport(outletId, today, today, []);
    
    console.log('Response structure:');
    console.log('  dateRange:', counterReport.dateRange ? '✅' : '❌');
    console.log('  stations:', Array.isArray(counterReport.stations) ? '✅' : '❌');
    console.log('  summary:', counterReport.summary ? '✅' : '❌');
    console.log('  floors:', counterReport.floors ? '❌ (should not exist)' : '✅ (correct)');
    
    if (counterReport.stations?.length > 0) {
      console.log('\nStation data sample:');
      const s = counterReport.stations[0];
      console.log(`  station: ${s.station}`);
      console.log(`  ticket_count: ${s.ticket_count}`);
      console.log(`  item_count: ${s.item_count}`);
      console.log(`  served_count: ${s.served_count}`);
      console.log(`  cancelled_count: ${s.cancelled_count}`);
    }
    
    console.log('\nSummary:');
    console.log(`  total_stations: ${counterReport.summary?.total_stations}`);
    console.log(`  total_tickets: ${counterReport.summary?.total_tickets}`);
    console.log(`  served_count: ${counterReport.summary?.served_count}`);
    console.log(`  busiest_station: ${counterReport.summary?.busiest_station}`);

    // 2. Test Floor-Section Report (new format with floors + pagination)
    console.log('\n--- 2. Testing Floor-Section Report (New Format) ---');
    const floorReport = await reportsService.getFloorSectionReport(outletId, today, today, {
      floorIds: [],
      page: 1,
      limit: 10
    });
    
    console.log('Response structure:');
    console.log('  dateRange:', floorReport.dateRange ? '✅' : '❌');
    console.log('  floors:', Array.isArray(floorReport.floors) ? '✅' : '❌');
    console.log('  sections:', Array.isArray(floorReport.sections) ? '✅' : '❌');
    console.log('  summary:', floorReport.summary ? '✅' : '❌');
    console.log('  pagination:', floorReport.pagination ? '✅' : '❌');
    
    if (floorReport.floors?.length > 0) {
      console.log('\nFloor data:');
      floorReport.floors.forEach(f => {
        console.log(`  ${f.floorName}: ${f.orderCount} orders, ${f.guestCount} guests, ₹${f.netSales}`);
      });
    }
    
    if (floorReport.sections?.length > 0) {
      console.log('\nSection data (first 3):');
      floorReport.sections.slice(0, 3).forEach(s => {
        console.log(`  ${s.floorName} > ${s.sectionName}: ${s.orderCount} orders, ₹${s.netSales}`);
      });
    }
    
    console.log('\nSummary:');
    console.log(`  total_floors: ${floorReport.summary?.total_floors}`);
    console.log(`  total_sections: ${floorReport.summary?.total_sections}`);
    console.log(`  total_orders: ${floorReport.summary?.total_orders}`);
    console.log(`  total_guests: ${floorReport.summary?.total_guests} (should be number, not string)`);
    console.log(`  total_sales: ${floorReport.summary?.total_sales}`);
    console.log(`  top_section: ${floorReport.summary?.top_section}`);
    
    // Verify guest count is numeric
    const guestType = typeof floorReport.summary?.total_guests;
    if (guestType === 'number') {
      console.log(`  ✅ total_guests is numeric: ${floorReport.summary?.total_guests}`);
    } else {
      console.log(`  ⚠️ total_guests type: ${guestType} (value: ${floorReport.summary?.total_guests})`);
    }
    
    console.log('\nPagination:');
    console.log(`  page: ${floorReport.pagination?.page}`);
    console.log(`  limit: ${floorReport.pagination?.limit}`);
    console.log(`  total: ${floorReport.pagination?.total}`);
    console.log(`  totalPages: ${floorReport.pagination?.totalPages}`);

    // 3. Test search functionality
    console.log('\n--- 3. Testing Search Functionality ---');
    const searchReport = await reportsService.getFloorSectionReport(outletId, today, today, {
      floorIds: [],
      search: 'First',
      page: 1,
      limit: 10
    });
    console.log(`Search 'First' results: ${searchReport.sections?.length || 0} sections`);

    // 4. Verify data accuracy
    console.log('\n--- 4. Verifying Data Accuracy ---');
    const [orderCheck] = await pool.query(`
      SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(CAST(guest_count AS UNSIGNED)), 0) as guest_count,
        COALESCE(SUM(CASE WHEN status IN ('paid', 'completed') THEN total_amount ELSE 0 END), 0) as total_sales
      FROM orders 
      WHERE outlet_id = ? AND DATE(created_at) = ?
    `, [outletId, today]);
    
    console.log('Database totals:');
    console.log(`  Orders: ${orderCheck[0]?.order_count || 0}`);
    console.log(`  Guests: ${orderCheck[0]?.guest_count || 0}`);
    console.log(`  Sales: ${orderCheck[0]?.total_sales || 0}`);
    
    console.log('\nAPI totals:');
    console.log(`  Orders: ${floorReport.summary?.total_orders}`);
    console.log(`  Guests: ${floorReport.summary?.total_guests}`);
    console.log(`  Sales: ${floorReport.summary?.total_sales}`);

    console.log('\n' + '='.repeat(70));
    console.log('REPORTS API FIX TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testReportsFix();
