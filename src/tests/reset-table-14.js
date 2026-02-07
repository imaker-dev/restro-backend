/**
 * Reset table 14 for testing
 */
require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');

async function resetTable() {
  await initializeDatabase();
  const pool = getPool();

  console.log('Resetting table 14...');

  // Cancel any active orders for this table
  await pool.query(
    `UPDATE orders SET status = 'cancelled' 
     WHERE table_id = 14 AND status NOT IN ('cancelled', 'completed', 'paid')`
  );
  console.log('  Orders cancelled');

  // End any active sessions
  await pool.query(
    `UPDATE table_sessions SET status = 'completed', ended_at = NOW() 
     WHERE table_id = 14 AND status = 'active'`
  );
  console.log('  Sessions ended');

  // Set table to available
  await pool.query(`UPDATE tables SET status = 'available' WHERE id = 14`);
  console.log('  Table set to available');

  // Verify
  const [table] = await pool.query('SELECT id, table_number, status FROM tables WHERE id = 14');
  console.log('\nTable 14 now:', table[0]);

  process.exit(0);
}

resetTable().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
