/**
 * Diagnostic script to check print jobs and bridge configuration
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

  console.log('\n=== RECENT BILL PRINT JOBS ===');
  const [jobs] = await pool.query(`
    SELECT id, outlet_id, station, job_type, status, reference_number, 
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created
    FROM print_jobs 
    WHERE job_type IN ('bill', 'duplicate_bill') 
    ORDER BY created_at DESC LIMIT 10
  `);
  console.table(jobs);

  console.log('\n=== ALL PENDING PRINT JOBS ===');
  const [pending] = await pool.query(`
    SELECT id, outlet_id, station, job_type, status, reference_number,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created
    FROM print_jobs 
    WHERE status = 'pending'
    ORDER BY created_at DESC LIMIT 20
  `);
  console.table(pending);

  console.log('\n=== PRINTER BRIDGES ===');
  const [bridges] = await pool.query(`
    SELECT id, outlet_id, bridge_code, assigned_stations, is_online,
           DATE_FORMAT(last_poll_at, '%Y-%m-%d %H:%i:%s') as last_poll
    FROM printer_bridges
  `);
  console.table(bridges);

  console.log('\n=== PRINTERS ===');
  const [printers] = await pool.query(`
    SELECT id, outlet_id, name, station, ip_address, port, is_active
    FROM printers
    WHERE is_active = 1
  `);
  console.table(printers);

  console.log('\n=== DUPLICATE PENDING JOBS (same reference) ===');
  const [dups] = await pool.query(`
    SELECT reference_number, COUNT(*) as count 
    FROM print_jobs 
    WHERE status = 'pending' 
    GROUP BY reference_number 
    HAVING count > 1
  `);
  console.table(dups);

  await pool.end();
}

main().catch(console.error);
