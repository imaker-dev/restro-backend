require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTables() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [tables] = await pool.query("SHOW TABLES");
  console.log('All tables:');
  tables.forEach(t => console.log('  -', Object.values(t)[0]));

  // Check for items table
  const [itemTables] = await pool.query("SHOW TABLES LIKE '%item%'");
  console.log('\nItem related tables:');
  itemTables.forEach(t => console.log('  -', Object.values(t)[0]));

  // Check existing order_items structure
  const [cols] = await pool.query("DESCRIBE order_items");
  console.log('\norder_items columns:');
  cols.forEach(c => console.log('  -', c.Field, c.Type));

  // Get existing order items to understand structure
  const [existingItems] = await pool.query("SELECT * FROM order_items LIMIT 2");
  console.log('\nExisting order_items sample:', existingItems);

  await pool.end();
}

checkTables().catch(console.error);
