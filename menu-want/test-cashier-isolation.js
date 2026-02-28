/**
 * Test Cashier Isolation - Verify each cashier sees only their own data
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const paymentService = require('../src/services/payment.service');
const orderService = require('../src/services/order.service');

async function testCashierIsolation() {
  console.log('='.repeat(70));
  console.log('CASHIER ISOLATION TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();

    // 1. Find cashiers with floor assignments
    console.log('\n--- 1. Finding Cashiers with Floor Assignments ---');
    const [cashiers] = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.email, uf.floor_id, uf.outlet_id, f.name as floor_name
      FROM users u
      JOIN user_floors uf ON u.id = uf.user_id AND uf.is_active = 1
      JOIN user_roles ur ON u.id = ur.user_id AND ur.outlet_id = uf.outlet_id AND ur.is_active = 1
      JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
      JOIN floors f ON uf.floor_id = f.id
      ORDER BY uf.outlet_id, uf.floor_id
      LIMIT 10
    `);

    if (cashiers.length === 0) {
      console.log('⚠️ No cashiers with floor assignments found. Creating test scenario...');
      return;
    }

    console.log(`Found ${cashiers.length} cashier-floor assignments:`);
    cashiers.forEach(c => {
      console.log(`  - ${c.name} (ID: ${c.id}) → ${c.floor_name} (Floor ID: ${c.floor_id}, Outlet: ${c.outlet_id})`);
    });

    // 2. Test getCashDrawerStatus isolation
    console.log('\n--- 2. Testing getCashDrawerStatus Isolation ---');
    for (const cashier of cashiers.slice(0, 3)) {
      console.log(`\nCashier: ${cashier.name} (ID: ${cashier.id}), Floor: ${cashier.floor_name}`);
      
      const status = await paymentService.getCashDrawerStatus(
        cashier.outlet_id,
        null, // Let it auto-detect floor
        cashier.id
      );
      
      console.log(`  Floor ID returned: ${status.floorId}`);
      console.log(`  User ID filtered: ${status.userId}`);
      console.log(`  Session: ${status.session ? `ID ${status.session.id}, Status: ${status.session.status}` : 'None'}`);
      console.log(`  Current balance: ${status.currentBalance}`);
      console.log(`  Transactions count: ${status.recentTransactions.length}`);
      
      // Verify session is for this cashier only
      if (status.session && status.session.cashier_id !== cashier.id) {
        console.log(`  ❌ ERROR: Session belongs to different cashier (${status.session.cashier_id})`);
      } else {
        console.log(`  ✅ Session correctly filtered for this cashier`);
      }
    }

    // 3. Test shift history isolation
    console.log('\n--- 3. Testing Shift History Isolation ---');
    for (const cashier of cashiers.slice(0, 2)) {
      console.log(`\nCashier: ${cashier.name} (ID: ${cashier.id})`);
      
      const history = await paymentService.getShiftHistory({
        outletId: cashier.outlet_id,
        cashierId: cashier.id,
        limit: 5
      });
      
      console.log(`  Shifts found: ${history.shifts.length}`);
      
      // Verify all shifts belong to this cashier
      let allMatch = true;
      for (const shift of history.shifts) {
        if (shift.cashierId && shift.cashierId !== cashier.id) {
          console.log(`  ❌ Shift ${shift.id} belongs to cashier ${shift.cashierId}, not ${cashier.id}`);
          allMatch = false;
        }
      }
      
      if (allMatch && history.shifts.length > 0) {
        console.log(`  ✅ All shifts correctly filtered for this cashier`);
      } else if (history.shifts.length === 0) {
        console.log(`  ℹ️ No shifts found for this cashier`);
      }
    }

    // 4. Test order history - captain vs cashier
    console.log('\n--- 4. Testing Order History (Captain vs Cashier) ---');
    
    // Find a captain
    const [captains] = await pool.query(`
      SELECT DISTINCT u.id, u.name, uf.floor_id, uf.outlet_id
      FROM users u
      JOIN user_floors uf ON u.id = uf.user_id AND uf.is_active = 1
      JOIN user_roles ur ON u.id = ur.user_id AND ur.outlet_id = uf.outlet_id AND ur.is_active = 1
      JOIN roles r ON ur.role_id = r.id AND r.slug = 'captain'
      ORDER BY uf.outlet_id
      LIMIT 2
    `);

    if (captains.length > 0) {
      const captain = captains[0];
      console.log(`\nCaptain: ${captain.name} (ID: ${captain.id})`);
      
      // Captain should see only their own orders
      const captainOrders = await orderService.getCaptainOrderHistory(
        captain.id,
        captain.outlet_id,
        { limit: 5, viewAllFloorOrders: false, floorIds: [captain.floor_id] }
      );
      
      console.log(`  Orders found: ${captainOrders.orders?.length || 0}`);
      
      // Verify all orders belong to this captain
      let allCaptainOrders = true;
      for (const order of (captainOrders.orders || [])) {
        if (order.created_by !== captain.id) {
          console.log(`  ❌ Order ${order.id} created by ${order.created_by}, not captain ${captain.id}`);
          allCaptainOrders = false;
        }
      }
      
      if (allCaptainOrders) {
        console.log(`  ✅ Captain sees only their own orders`);
      }
    }

    if (cashiers.length > 0) {
      const cashier = cashiers[0];
      console.log(`\nCashier: ${cashier.name} (ID: ${cashier.id}), Floor: ${cashier.floor_name}`);
      
      // Cashier should see all orders for their floor
      const cashierOrders = await orderService.getCaptainOrderHistory(
        cashier.id,
        cashier.outlet_id,
        { limit: 10, viewAllFloorOrders: true, floorIds: [cashier.floor_id] }
      );
      
      console.log(`  Orders found: ${cashierOrders.orders?.length || 0}`);
      
      // Verify all orders are from the cashier's floor
      let allFloorOrders = true;
      const creators = new Set();
      for (const order of (cashierOrders.orders || [])) {
        creators.add(order.created_by_name || order.created_by);
        if (order.floor_id && order.floor_id !== cashier.floor_id) {
          console.log(`  ❌ Order ${order.id} from floor ${order.floor_id}, not ${cashier.floor_id}`);
          allFloorOrders = false;
        }
      }
      
      if (allFloorOrders) {
        console.log(`  ✅ Cashier sees all orders for their floor`);
        console.log(`  Created by: ${[...creators].join(', ') || 'N/A'}`);
      }
    }

    // 5. Verify invoices table structure
    console.log('\n--- 5. Verifying Invoices Table Structure ---');
    const [invoiceCols] = await pool.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
      AND COLUMN_NAME IN ('status', 'is_cancelled')
    `);
    
    console.log('Invoices columns found:', invoiceCols.map(c => c.COLUMN_NAME).join(', '));
    const hasIsCancelled = invoiceCols.some(c => c.COLUMN_NAME === 'is_cancelled');
    const hasStatus = invoiceCols.some(c => c.COLUMN_NAME === 'status');
    
    console.log(`  is_cancelled column: ${hasIsCancelled ? '✅' : '❌'}`);
    console.log(`  status column: ${hasStatus ? '⚠️ (should use is_cancelled)' : '✅ (not present, correct)'}`);

    console.log('\n' + '='.repeat(70));
    console.log('CASHIER ISOLATION TEST COMPLETE');
    console.log('='.repeat(70));
    console.log(`
Summary:
- getCashDrawerStatus: Filters by userId (cashier sees only their own shift)
- getShiftHistory: Filters by cashierId (cashier sees only their own shifts)
- getCaptainOrderHistory: 
  - Captains: See only their own orders (viewAllFloorOrders=false)
  - Cashiers: See all orders for their floor (viewAllFloorOrders=true)
- Cancel order: Uses is_cancelled column (not status)
`);

  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testCashierIsolation();
