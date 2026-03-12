/**
 * Cleanup duplicate pending print jobs
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db'
  });

  console.log('Cleaning up duplicate pending print jobs...');
  
  // Delete duplicate pending jobs, keeping only the oldest one for each reference
  const [result] = await pool.query(`
    DELETE p1 FROM print_jobs p1
    INNER JOIN print_jobs p2 
    WHERE p1.id > p2.id 
      AND p1.reference_number = p2.reference_number 
      AND p1.job_type = p2.job_type 
      AND p1.status = 'pending' 
      AND p2.status = 'pending'
  `);
  
  console.log(`Cleaned up ${result.affectedRows} duplicate pending jobs`);
  
  // Show remaining pending jobs
  const [remaining] = await pool.query(`
    SELECT reference_number, job_type, COUNT(*) as count 
    FROM print_jobs 
    WHERE status = 'pending' 
    GROUP BY reference_number, job_type
  `);
  console.log('\nRemaining pending jobs:');
  console.table(remaining);
  
  await pool.end();
}

main().catch(console.error);
