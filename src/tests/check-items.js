require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkItems() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [items] = await pool.query(
    'SELECT id, name, base_price, item_type FROM items WHERE is_available = 1 LIMIT 10'
  );
  
  console.log('Available items:');
  items.forEach(i => console.log(`  ${i.id}: ${i.name} (${i.item_type}) - Rs.${i.base_price}`));
  
  await pool.end();
}

checkItems();
