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
    const [cols] = await pool.query("SHOW COLUMNS FROM invoices WHERE Field = 'nc_tax_amount'");
    if (cols.length > 0) {
      console.log('nc_tax_amount column: EXISTS');
    } else {
      console.log('nc_tax_amount column: MISSING - Adding it now...');
      await pool.query("ALTER TABLE invoices ADD COLUMN nc_tax_amount DECIMAL(10,2) DEFAULT 0 AFTER nc_amount");
      console.log('nc_tax_amount column added successfully');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
