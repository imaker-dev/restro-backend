/**
 * Clear Pending Print Jobs
 * Run this to mark all old pending jobs as cancelled so bridge only prints new ones.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

async function clearPendingJobs() {
  console.log('\n🧹 Clearing pending print jobs...\n');
  
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos',
    waitForConnections: true,
    connectionLimit: 1,
  });

  try {
    // Get count of pending jobs first
    const [pending] = await pool.query(
      'SELECT COUNT(*) as count FROM print_jobs WHERE status = ?',
      ['pending']
    );
    
    console.log(`Found ${pending[0].count} pending print jobs`);
    
    if (pending[0].count > 0) {
      // Mark all pending jobs as cancelled
      const [result] = await pool.query(
        'UPDATE print_jobs SET status = ? WHERE status = ?',
        ['cancelled', 'pending']
      );
      
      console.log(`✅ Cleared ${result.affectedRows} pending jobs\n`);
      console.log('Now when you run the bridge agent, it will only print NEW KOTs.\n');
    } else {
      console.log('✅ No pending jobs to clear\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

clearPendingJobs();
