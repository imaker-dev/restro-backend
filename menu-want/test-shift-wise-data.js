require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');
const paymentService = require('../src/services/payment.service');
const { initializeDatabase } = require('../src/database');

async function testShiftWiseData() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('=== SHIFT-WISE DATA VERIFICATION ===\n');
  
  // Get all sessions for today
  const [sessions] = await pool.query(`
    SELECT ds.*, f.name as floor_name 
    FROM day_sessions ds 
    JOIN floors f ON ds.floor_id = f.id
    WHERE ds.outlet_id = 43 AND ds.session_date = CURDATE()
    ORDER BY ds.floor_id
  `);
  
  await initializeDatabase();
  
  for (const session of sessions) {
    console.log(`\n=== Floor: ${session.floor_name} (ID: ${session.floor_id}) ===`);
    console.log(`Status: ${session.status}`);
    console.log(`Opening Time: ${session.opening_time}`);
    console.log(`Cashier ID: ${session.cashier_id}`);
    
    // Get API response for this floor
    const apiResponse = await paymentService.getCashDrawerStatus(43, session.floor_id, session.cashier_id);
    
    if (session.status === 'open') {
      // Verify orders count from shift start
      const [orders] = await pool.query(`
        SELECT COUNT(DISTINCT o.id) as cnt
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE o.outlet_id = 43 AND o.created_at >= ? AND o.status != 'cancelled'
        AND (t.floor_id = ? OR (o.table_id IS NULL AND o.order_type != 'dine_in'))
      `, [session.opening_time, session.floor_id]);
      
      // Verify payments from shift start
      const [payments] = await pool.query(`
        SELECT COUNT(DISTINCT p.order_id) as cnt, COALESCE(SUM(p.amount), 0) as total
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE p.outlet_id = 43 AND p.created_at >= ? AND p.status = 'completed'
        AND (t.floor_id = ? OR (o.table_id IS NULL AND o.order_type != 'dine_in'))
      `, [session.opening_time, session.floor_id]);
      
      console.log('\n--- Direct DB Calculation (Shift-Wise) ---');
      console.log(`Orders since shift start: ${orders[0].cnt}`);
      console.log(`Payments since shift start: ${payments[0].cnt} | Amount: ₹${payments[0].total}`);
      
      console.log('\n--- API Response ---');
      console.log(`totalOrders: ${apiResponse.sales.totalOrders}`);
      console.log(`totalCollected: ₹${apiResponse.sales.totalCollected}`);
      console.log(`ordersPaidInShift: ${apiResponse.sales.ordersPaidInShift}`);
      console.log(`paymentBreakdown.total: ₹${apiResponse.paymentBreakdown.total}`);
      
      console.log('\n--- Verification ---');
      const ordersMatch = apiResponse.sales.totalOrders === orders[0].cnt;
      const paymentsMatch = apiResponse.sales.totalCollected === parseFloat(payments[0].total);
      const ordersPaidMatch = apiResponse.sales.ordersPaidInShift === payments[0].cnt;
      const breakdownMatch = apiResponse.sales.totalCollected === apiResponse.paymentBreakdown.total;
      
      console.log(`Orders Match: ${ordersMatch ? '✅' : '❌'} (API: ${apiResponse.sales.totalOrders}, DB: ${orders[0].cnt})`);
      console.log(`Payments Amount Match: ${paymentsMatch ? '✅' : '❌'} (API: ${apiResponse.sales.totalCollected}, DB: ${payments[0].total})`);
      console.log(`Orders Paid Match: ${ordersPaidMatch ? '✅' : '❌'} (API: ${apiResponse.sales.ordersPaidInShift}, DB: ${payments[0].cnt})`);
      console.log(`Collected = Breakdown Total: ${breakdownMatch ? '✅' : '❌'}`);
      
    } else {
      console.log('\n--- API Response (Closed Shift) ---');
      console.log(`totalOrders: ${apiResponse.sales.totalOrders}`);
      console.log(`totalCollected: ${apiResponse.sales.totalCollected}`);
      console.log(`ordersPaidInShift: ${apiResponse.sales.ordersPaidInShift}`);
      
      const allZero = apiResponse.sales.totalOrders === 0 && 
                      apiResponse.sales.totalCollected === 0 && 
                      apiResponse.sales.ordersPaidInShift === 0;
      console.log(`All values zero for closed shift: ${allZero ? '✅' : '❌'}`);
    }
  }
  
  await pool.end();
  process.exit(0);
}

testShiftWiseData().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
