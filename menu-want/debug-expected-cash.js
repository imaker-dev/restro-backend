require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');
const { initializeDatabase } = require('../src/database');
const paymentService = require('../src/services/payment.service');

async function debug() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('=== DEBUG EXPECTED CASH ===\n');

  // Get session for floor 33
  const [sessions] = await pool.query(`
    SELECT id, floor_id, opening_time, opening_cash, status, cashier_id 
    FROM day_sessions 
    WHERE outlet_id = 43 AND floor_id = 33 AND session_date = CURDATE()
  `);
  
  console.log('Session Details:');
  console.log('  ID:', sessions[0].id);
  console.log('  Opening Time:', sessions[0].opening_time);
  console.log('  Opening Cash:', sessions[0].opening_cash);
  console.log('  Status:', sessions[0].status);
  console.log('  Cashier ID:', sessions[0].cashier_id);
  
  const openingTime = sessions[0].opening_time;
  
  // Get payments AFTER shift start for floor 33
  const [paymentsAfter] = await pool.query(`
    SELECT p.id, p.amount, p.payment_mode, p.created_at
    FROM payments p
    JOIN orders o ON p.order_id = o.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE p.outlet_id = 43 
      AND p.created_at >= ? 
      AND t.floor_id = 33 
      AND p.status = 'completed'
    ORDER BY p.created_at
  `, [openingTime]);
  
  console.log('\nPayments AFTER shift start:');
  let totalCash = 0;
  for (const p of paymentsAfter) {
    console.log(`  ID: ${p.id}, Amount: ${p.amount}, Mode: ${p.payment_mode}, Time: ${p.created_at}`);
    if (p.payment_mode === 'cash') {
      totalCash += parseFloat(p.amount);
    }
  }
  console.log('  Total Cash Payments:', totalCash);
  
  // Get API response
  await initializeDatabase();
  const apiResponse = await paymentService.getCashDrawerStatus(43, 33, sessions[0].cashier_id);
  
  console.log('\n=== API Response ===');
  console.log('Session Opening Time:', apiResponse.session?.openingTime);
  console.log('Opening Cash:', apiResponse.cashMovements.openingCash);
  console.log('Cash Sales:', apiResponse.cashMovements.cashSales);
  console.log('Expected Cash:', apiResponse.cashMovements.expectedCash);
  console.log('paymentBreakdown.cash:', apiResponse.paymentBreakdown.cash);
  
  console.log('\n=== Expected Calculation ===');
  const expected = parseFloat(sessions[0].opening_cash) + totalCash;
  console.log(`Opening (${sessions[0].opening_cash}) + Cash Payments (${totalCash}) = ${expected}`);
  console.log('API expectedCash:', apiResponse.cashMovements.expectedCash);
  console.log('Match:', expected === apiResponse.cashMovements.expectedCash ? '✅' : '❌');
  
  await pool.end();
  process.exit(0);
}

debug().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
