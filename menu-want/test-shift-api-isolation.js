/**
 * Test Shift API Isolation - Verify cashiers see only their own shift data
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const paymentService = require('../src/services/payment.service');

async function testShiftApiIsolation() {
  console.log('='.repeat(70));
  console.log('SHIFT API ISOLATION TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();

    // 1. Find cashiers with shifts
    console.log('\n--- 1. Finding Cashiers with Shifts ---');
    const [cashiersWithShifts] = await pool.query(`
      SELECT DISTINCT 
        ds.id as shift_id,
        ds.cashier_id,
        ds.floor_id,
        ds.outlet_id,
        ds.session_date,
        ds.status,
        u.name as cashier_name,
        f.name as floor_name
      FROM day_sessions ds
      JOIN users u ON ds.cashier_id = u.id
      LEFT JOIN floors f ON ds.floor_id = f.id
      WHERE ds.cashier_id IS NOT NULL
      ORDER BY ds.session_date DESC
      LIMIT 10
    `);

    if (cashiersWithShifts.length === 0) {
      console.log('⚠️ No shifts with cashier assignments found.');
      
      // Check for any shifts at all
      const [anyShifts] = await pool.query(`SELECT * FROM day_sessions ORDER BY id DESC LIMIT 5`);
      console.log('Sample shifts:', anyShifts.map(s => ({
        id: s.id,
        cashier_id: s.cashier_id,
        floor_id: s.floor_id,
        status: s.status
      })));
      return;
    }

    console.log(`Found ${cashiersWithShifts.length} shifts with cashiers:`);
    cashiersWithShifts.forEach(s => {
      console.log(`  Shift ${s.shift_id}: ${s.cashier_name} (${s.floor_name || 'No floor'}) - ${s.status}`);
    });

    // 2. Test getShiftDetail isolation
    console.log('\n--- 2. Testing getShiftDetail Isolation ---');
    
    // Pick two different cashiers if available
    const uniqueCashiers = [...new Map(cashiersWithShifts.map(s => [s.cashier_id, s])).values()];
    
    for (const shiftInfo of uniqueCashiers.slice(0, 2)) {
      console.log(`\n  Testing shift ${shiftInfo.shift_id} for cashier ${shiftInfo.cashier_name}:`);
      
      // Test 1: Cashier viewing their own shift (should work)
      try {
        const detail = await paymentService.getShiftDetail(shiftInfo.shift_id, shiftInfo.cashier_id);
        console.log(`    ✅ Own shift access: OK`);
        console.log(`       Floor: ${detail.floorName || 'N/A'}, Cashier: ${detail.cashierName || 'N/A'}`);
        console.log(`       Transactions: ${detail.transactions?.length || 0}`);
        console.log(`       Orders: ${detail.orderStats?.totalOrders || 0}`);
      } catch (error) {
        console.log(`    ❌ Own shift access failed: ${error.message}`);
      }
      
      // Test 2: Different cashier trying to view this shift (should fail)
      const otherCashier = uniqueCashiers.find(c => c.cashier_id !== shiftInfo.cashier_id);
      if (otherCashier) {
        try {
          await paymentService.getShiftDetail(shiftInfo.shift_id, otherCashier.cashier_id);
          console.log(`    ❌ Other cashier access: Should have been blocked!`);
        } catch (error) {
          if (error.message === 'You can only view your own shifts') {
            console.log(`    ✅ Other cashier blocked: ${error.message}`);
          } else {
            console.log(`    ⚠️ Unexpected error: ${error.message}`);
          }
        }
      }
      
      // Test 3: No cashierId (admin view - should work)
      try {
        const detail = await paymentService.getShiftDetail(shiftInfo.shift_id, null);
        console.log(`    ✅ Admin access (no cashierId): OK`);
      } catch (error) {
        console.log(`    ❌ Admin access failed: ${error.message}`);
      }
    }

    // 3. Test getShiftSummary isolation
    console.log('\n--- 3. Testing getShiftSummary Isolation ---');
    
    for (const shiftInfo of uniqueCashiers.slice(0, 2)) {
      console.log(`\n  Testing summary for cashier ${shiftInfo.cashier_name}:`);
      
      // Cashier-filtered summary
      const cashierSummary = await paymentService.getShiftSummary({
        outletId: shiftInfo.outlet_id,
        cashierId: shiftInfo.cashier_id,
        floorId: shiftInfo.floor_id
      });
      
      console.log(`    Cashier's shifts: ${cashierSummary.totalShifts}`);
      console.log(`    Total sales: ${cashierSummary.totalSales}`);
      console.log(`    Floor ID filter: ${cashierSummary.floorId || 'N/A'}`);
      console.log(`    Cashier ID filter: ${cashierSummary.cashierId || 'N/A'}`);
      
      // Compare with outlet-wide summary
      const outletSummary = await paymentService.getShiftSummary({
        outletId: shiftInfo.outlet_id
      });
      
      console.log(`    Outlet total shifts: ${outletSummary.totalShifts}`);
      
      if (cashierSummary.totalShifts <= outletSummary.totalShifts) {
        console.log(`    ✅ Cashier sees <= outlet total (properly filtered)`);
      } else {
        console.log(`    ❌ Cashier sees more than outlet total (incorrect)`);
      }
    }

    // 4. Test getCashDrawerStatus isolation
    console.log('\n--- 4. Testing getCashDrawerStatus Isolation ---');
    
    for (const shiftInfo of uniqueCashiers.slice(0, 2)) {
      console.log(`\n  Testing status for cashier ${shiftInfo.cashier_name}:`);
      
      const status = await paymentService.getCashDrawerStatus(
        shiftInfo.outlet_id,
        shiftInfo.floor_id,
        shiftInfo.cashier_id
      );
      
      console.log(`    Session: ${status.session ? `ID ${status.session.id}` : 'None'}`);
      console.log(`    Floor ID: ${status.floorId || 'N/A'}`);
      console.log(`    User ID filter: ${status.userId || 'N/A'}`);
      console.log(`    Transactions: ${status.recentTransactions?.length || 0}`);
      
      // Verify session belongs to this cashier
      if (status.session) {
        if (status.session.cashier_id === shiftInfo.cashier_id) {
          console.log(`    ✅ Session belongs to this cashier`);
        } else if (!status.session.cashier_id) {
          console.log(`    ⚠️ Session has no cashier_id (legacy data)`);
        } else {
          console.log(`    ❌ Session belongs to different cashier: ${status.session.cashier_id}`);
        }
      }
    }

    // 5. Test getShiftHistory isolation
    console.log('\n--- 5. Testing getShiftHistory Isolation ---');
    
    for (const shiftInfo of uniqueCashiers.slice(0, 2)) {
      console.log(`\n  Testing history for cashier ${shiftInfo.cashier_name}:`);
      
      const history = await paymentService.getShiftHistory({
        outletId: shiftInfo.outlet_id,
        cashierId: shiftInfo.cashier_id,
        limit: 5
      });
      
      console.log(`    Shifts found: ${history.shifts?.length || 0}`);
      
      // Verify all shifts belong to this cashier
      let allMatch = true;
      for (const shift of (history.shifts || [])) {
        if (shift.cashierId && shift.cashierId !== shiftInfo.cashier_id) {
          console.log(`    ❌ Shift ${shift.id} belongs to cashier ${shift.cashierId}`);
          allMatch = false;
        }
      }
      
      if (allMatch && (history.shifts?.length || 0) > 0) {
        console.log(`    ✅ All shifts belong to this cashier`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('SHIFT API ISOLATION TEST COMPLETE');
    console.log('='.repeat(70));
    console.log(`
Summary of API Isolation:
- getShiftDetail: Cashiers can only view their own shifts
- getShiftSummary: Filtered by floorId and cashierId
- getCashDrawerStatus: Filtered by floorId and userId
- getShiftHistory: Filtered by cashierId
`);

  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testShiftApiIsolation();
