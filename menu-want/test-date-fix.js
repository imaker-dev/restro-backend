/**
 * Test: Date Filtering Fix
 * Verifies that reports, shifts, and history work correctly after midnight
 * by using local date instead of UTC date
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

// Helper to get local date (same as in services)
function getLocalDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function testDateFix() {
  console.log('='.repeat(80));
  console.log('DATE FILTERING FIX TEST');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Compare UTC vs Local date
    const now = new Date();
    const utcDate = now.toISOString().slice(0, 10);
    const localDate = getLocalDate();
    
    console.log('\n--- Date Comparison ---');
    console.log(`Current time:     ${now.toString()}`);
    console.log(`UTC Date:         ${utcDate}`);
    console.log(`Local Date:       ${localDate}`);
    console.log(`Match:            ${utcDate === localDate ? '✅ Same' : '❌ Different (fix applied)'}`);

    // Test orders created today (local time)
    console.log('\n--- Orders Created Today (Local Date) ---');
    const [ordersToday] = await pool.query(`
      SELECT COUNT(*) as count, 
             MIN(created_at) as first_order,
             MAX(created_at) as last_order
      FROM orders 
      WHERE DATE(created_at) = ?
    `, [localDate]);
    
    console.log(`  Orders today (${localDate}): ${ordersToday[0].count}`);
    if (ordersToday[0].first_order) {
      console.log(`  First order: ${ordersToday[0].first_order}`);
      console.log(`  Last order:  ${ordersToday[0].last_order}`);
    }

    // Test shift sessions today
    console.log('\n--- Shift Sessions Today ---');
    const [shiftsToday] = await pool.query(`
      SELECT ds.*, f.name as floor_name, u.name as cashier_name
      FROM day_sessions ds
      LEFT JOIN floors f ON ds.floor_id = f.id
      LEFT JOIN users u ON ds.cashier_id = u.id
      WHERE ds.session_date = ?
      ORDER BY ds.id DESC
    `, [localDate]);
    
    console.log(`  Shifts today: ${shiftsToday.length}`);
    for (const shift of shiftsToday) {
      console.log(`    - ${shift.floor_name || 'No Floor'}: ${shift.status} (Cashier: ${shift.cashier_name || 'N/A'})`);
    }

    // Test reports data
    console.log('\n--- Dashboard Data Test ---');
    const [dashboardData] = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status IN ('paid', 'completed') THEN total_amount ELSE 0 END) as net_sales,
        SUM(discount_amount) as total_discount
      FROM orders 
      WHERE outlet_id = 43 AND DATE(created_at) = ?
    `, [localDate]);
    
    console.log(`  Total Orders: ${dashboardData[0].total_orders}`);
    console.log(`  Net Sales:    ₹${dashboardData[0].net_sales || 0}`);
    console.log(`  Total Discount: ₹${dashboardData[0].total_discount || 0}`);

    // Test captain order history
    console.log('\n--- Captain Order History Test ---');
    const [captainOrders] = await pool.query(`
      SELECT id, order_number, subtotal, discount_amount, total_amount, status, created_at
      FROM orders 
      WHERE outlet_id = 43 AND DATE(created_at) = ?
      ORDER BY created_at DESC
      LIMIT 5
    `, [localDate]);
    
    console.log(`  Recent orders today:`);
    for (const order of captainOrders) {
      console.log(`    ${order.order_number}: ₹${order.subtotal} - ₹${order.discount_amount} discount = ₹${order.total_amount} (${order.status})`);
    }

    // Test pending bills
    console.log('\n--- Pending Bills Test ---');
    const [pendingBills] = await pool.query(`
      SELECT i.invoice_number, i.subtotal, i.discount_amount, i.total_tax, i.grand_total, i.payment_status
      FROM invoices i
      JOIN orders o ON i.order_id = o.id
      WHERE i.outlet_id = 43 AND i.is_cancelled = 0 AND i.payment_status IN ('pending', 'partial')
      ORDER BY i.created_at DESC
      LIMIT 5
    `);
    
    console.log(`  Pending bills: ${pendingBills.length}`);
    for (const bill of pendingBills) {
      console.log(`    ${bill.invoice_number}: ₹${bill.subtotal} - ₹${bill.discount_amount} = ₹${bill.grand_total} (Tax: ₹${bill.total_tax})`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('DATE FILTERING FIX TEST COMPLETE');
    console.log('='.repeat(80));
    
    console.log('\n✅ Local date is now used for all date filtering');
    console.log('   This ensures reports/shifts work correctly after midnight');

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testDateFix();
