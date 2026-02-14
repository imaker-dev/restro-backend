const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
  const p = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });
  await p.query("UPDATE tables SET capacity = 4, status = 'available' WHERE id = 27");
  await p.query("UPDATE tables SET capacity = 6, status = 'available' WHERE id = 29");
  await p.query("UPDATE table_merges SET unmerged_at = NOW() WHERE unmerged_at IS NULL");
  console.log('Reset done');
  process.exit(0);
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });
