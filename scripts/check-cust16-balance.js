require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  const [[s]] = await pool.query(`
    SELECT 
      SUM(CASE WHEN transaction_type='due_created' THEN amount ELSE 0 END) as created,
      SUM(CASE WHEN transaction_type='due_collected' THEN amount ELSE 0 END) as collected,
      SUM(CASE WHEN transaction_type='due_waived' THEN amount ELSE 0 END) as waived
    FROM customer_due_transactions WHERE customer_id=16
  `);
  
  console.log('Customer 16 transactions:');
  console.log('  Due created:', parseFloat(s.created));
  console.log('  Due collected:', parseFloat(s.collected));
  console.log('  Due waived:', parseFloat(s.waived));
  console.log('  Expected balance:', parseFloat(s.created) - parseFloat(s.collected) - parseFloat(s.waived));
  
  // Check actual orders
  const [[orders]] = await pool.query(`
    SELECT SUM(due_amount) as total_due FROM orders 
    WHERE customer_id=16 AND due_amount > 0 AND status != 'cancelled'
  `);
  console.log('  Actual due from orders:', parseFloat(orders.total_due) || 0);
  
  await pool.end();
})();
