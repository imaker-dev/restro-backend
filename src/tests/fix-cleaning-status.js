/**
 * Fix tables with 'cleaning' status - change to 'available'
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixCleaningStatus() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // Update cleaning status to available
  const [result] = await pool.query(
    "UPDATE tables SET status = 'available' WHERE status = 'cleaning'"
  );
  console.log(`Updated ${result.affectedRows} tables from 'cleaning' to 'available'`);

  // Show current status distribution
  const [rows] = await pool.query(`
    SELECT status, COUNT(*) as count, GROUP_CONCAT(table_number ORDER BY id) as tables 
    FROM tables WHERE outlet_id = 4 AND is_active = 1
    GROUP BY status ORDER BY status
  `);
  
  console.log('\nCurrent Table Statuses:');
  rows.forEach(r => {
    console.log(`  ${r.status.padEnd(10)}: ${r.count} tables (${r.tables})`);
  });

  await pool.end();
}

fixCleaningStatus().catch(console.error);
