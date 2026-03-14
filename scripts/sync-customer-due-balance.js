/**
 * Sync customer due_balance with actual order dues
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Syncing customer due_balance...');
    
    const [result] = await pool.query(`
      UPDATE customers c 
      LEFT JOIN (
        SELECT customer_id, SUM(due_amount) as total_due 
        FROM orders 
        WHERE due_amount > 0 AND status != 'cancelled' 
        GROUP BY customer_id
      ) od ON c.id = od.customer_id 
      SET c.due_balance = COALESCE(od.total_due, 0)
    `);
    
    console.log('Updated:', result.affectedRows, 'customers');

    // Verify
    const [check] = await pool.query(`
      SELECT c.id, c.name, c.outlet_id, c.due_balance,
             COALESCE(SUM(o.due_amount), 0) as actual_due
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0 AND o.status != 'cancelled'
      WHERE c.due_balance > 0 OR COALESCE(o.due_amount, 0) > 0
      GROUP BY c.id
    `);
    
    console.log('\nCustomers with due:');
    console.table(check);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
