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
    const [cols] = await pool.query("SHOW COLUMNS FROM invoices LIKE 'nc_tax_amount'");
    if (cols.length === 0) {
      await pool.query('ALTER TABLE invoices ADD COLUMN nc_tax_amount DECIMAL(12, 2) DEFAULT 0 AFTER nc_amount');
      console.log('Added nc_tax_amount column to invoices');
    } else {
      console.log('nc_tax_amount column already exists');
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
  await pool.end();
}

main();
