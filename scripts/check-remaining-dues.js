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
    // Check remaining due mismatches
    const [rows] = await pool.query(`
      SELECT id, order_number, total_amount, paid_amount, due_amount, 
             (total_amount - paid_amount) as calc_due,
             payment_status, status
      FROM orders 
      WHERE status != 'cancelled' 
        AND ABS(due_amount - (total_amount - paid_amount)) > 0.01
      LIMIT 15
    `);
    
    console.log('Remaining due mismatches:');
    console.table(rows);

    // These might be NC orders or have invoice payable_amount different
    // Check if they have invoices
    for (const row of rows) {
      const [inv] = await pool.query(`
        SELECT id, grand_total, payable_amount, nc_amount
        FROM invoices WHERE order_id = ?
      `, [row.id]);
      if (inv.length > 0) {
        console.log(`Order ${row.order_number}: Invoice grand_total=${inv[0].grand_total}, payable=${inv[0].payable_amount}, nc=${inv[0].nc_amount}`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
