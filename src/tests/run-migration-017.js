// One-time migration script: Add 'merged' to tables.status ENUM
const axios = require('axios');
const BASE = 'http://localhost:3000/api/v1';

async function run() {
  // We'll run the ALTER TABLE via a direct DB connection
  // First, require the database module from the running app
  const mysql = require('mysql2/promise');
  const dotenv = require('dotenv');
  dotenv.config();

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro',
    port: process.env.DB_PORT || 3306
  });

  try {
    // 1. Add 'merged' to ENUM
    await pool.query(
      "ALTER TABLE tables MODIFY COLUMN status ENUM('available','occupied','running','reserved','billing','cleaning','blocked','merged') DEFAULT 'available'"
    );
    console.log('✓ Migration applied: added "merged" to table status ENUM');

    // 2. Clean up any stale merge records and reset tables
    const [stale] = await pool.query(
      "SELECT * FROM table_merges WHERE unmerged_at IS NULL"
    );
    console.log('Active merge records:', stale.length);
    for (const m of stale) {
      console.log('  primary:', m.primary_table_id, 'merged:', m.merged_table_id);
    }

    // Mark all stale merges as unmerged
    if (stale.length > 0) {
      await pool.query("UPDATE table_merges SET unmerged_at = NOW() WHERE unmerged_at IS NULL");
      console.log('✓ Cleaned up stale merge records');
    }

    // Reset FF1 and FF3 to available
    await pool.query("UPDATE tables SET status = 'available' WHERE id IN (27, 29) AND status IN ('occupied', 'merged')");
    console.log('✓ Reset test tables to available');

    // Verify
    const [tables] = await pool.query("SELECT id, table_number, status, capacity FROM tables WHERE id IN (27, 28, 29)");
    console.log('\nCurrent state:');
    tables.forEach(t => console.log('  ', t.table_number, 'status:', t.status, 'capacity:', t.capacity));

    process.exit(0);
  } catch (e) {
    console.log('ERR:', e.message);
    process.exit(1);
  }
}
run();
