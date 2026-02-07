/**
 * Fix tables with empty/null status
 */
require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');

async function fixTableStatus() {
  await initializeDatabase();
  const pool = getPool();

  console.log('Checking tables with empty/null status...');
  
  // Find tables with empty or null status
  const [badTables] = await pool.query(
    `SELECT id, table_number, floor_id, status FROM tables WHERE status = '' OR status IS NULL`
  );
  console.log(`Found ${badTables.length} tables with invalid status:`);
  badTables.forEach(t => console.log(`  - Table ${t.id} (${t.table_number}) floor ${t.floor_id}: status='${t.status}'`));

  // Fix them
  if (badTables.length > 0) {
    await pool.query(`UPDATE tables SET status = 'available' WHERE status = '' OR status IS NULL`);
    console.log(`\nFixed ${badTables.length} tables to 'available' status`);
  }

  // Verify table 14
  const [t14] = await pool.query('SELECT id, table_number, floor_id, status FROM tables WHERE id = 14');
  console.log('\nTable 14 now:', t14[0]);

  // Show all tables on first floor (floor_id = 2)
  const [firstFloor] = await pool.query(
    'SELECT id, table_number, status FROM tables WHERE floor_id = 2'
  );
  console.log('\nFirst floor tables:');
  firstFloor.forEach(t => console.log(`  - ${t.table_number}: ${t.status}`));

  process.exit(0);
}

fixTableStatus().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
