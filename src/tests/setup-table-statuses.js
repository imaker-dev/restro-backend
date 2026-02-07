/**
 * Setup tables with different statuses for testing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupTableStatuses() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('Setting up tables with different statuses...\n');

  // Set different statuses for testing
  const statusUpdates = [
    { ids: [1, 2], status: 'available' },
    { ids: [3], status: 'reserved' },
    { ids: [4], status: 'running' },
    { ids: [5], status: 'billing' },
    { ids: [6], status: 'occupied' },  // Keep table 6 occupied (has order)
    { ids: [7], status: 'cleaning' },
    { ids: [8], status: 'blocked' }
  ];

  for (const update of statusUpdates) {
    await pool.query(
      `UPDATE tables SET status = ? WHERE id IN (${update.ids.join(',')})`,
      [update.status]
    );
    console.log(`  Set tables ${update.ids.join(', ')} to "${update.status}"`);
  }

  // Show final distribution
  console.log('\n📊 Table Status Distribution:');
  const [rows] = await pool.query(`
    SELECT status, COUNT(*) as count, GROUP_CONCAT(table_number ORDER BY id) as tables 
    FROM tables WHERE outlet_id = 4 AND is_active = 1
    GROUP BY status ORDER BY status
  `);
  
  rows.forEach(r => {
    console.log(`  ${r.status.padEnd(10)}: ${r.count} tables (${r.tables})`);
  });

  await pool.end();
  console.log('\n✅ Table statuses configured for testing');
}

setupTableStatuses().catch(console.error);
