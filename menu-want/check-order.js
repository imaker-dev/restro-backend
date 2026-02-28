require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function checkOrders() {
  await initializeDatabase();
  const pool = getPool();
  
  // Check recent orders
  const [orders] = await pool.query(`
    SELECT id, order_number, subtotal, discount_amount, tax_amount, 
           total_amount, paid_amount, status 
    FROM orders 
    WHERE outlet_id = 43 AND DATE(created_at) = '2026-02-28'
    ORDER BY id DESC
  `);
  
  console.log('Orders for 2026-02-28:');
  console.log('='.repeat(100));
  for (const o of orders) {
    console.log(`${o.order_number}: subtotal=${o.subtotal}, discount=${o.discount_amount}, tax=${o.tax_amount}, total=${o.total_amount}, paid=${o.paid_amount}, status=${o.status}`);
  }
  
  // Specifically check ORD2602280008
  const [specific] = await pool.query(`
    SELECT * FROM orders WHERE order_number = 'ORD2602280008'
  `);
  
  if (specific.length > 0) {
    console.log('\n\nOrder ORD2602280008 details:');
    console.log(JSON.stringify(specific[0], null, 2));
  }
  
  process.exit(0);
}

checkOrders();
