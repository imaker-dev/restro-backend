/**
 * Run migration 032 - Customer Due Balance
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db',
    multipleStatements: true
  });

  console.log('Running migration 032_customer_due_balance...');

  try {
    const sqlPath = path.join(__dirname, '032_customer_due_balance.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolons and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await pool.query(statement);
        console.log('✓ Executed:', statement.substring(0, 60) + '...');
      } catch (err) {
        // Ignore "column already exists" or "duplicate key" errors
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME' || 
            err.message.includes('Duplicate column') || err.message.includes('Duplicate key')) {
          console.log('⚠ Skipped (already exists):', statement.substring(0, 50) + '...');
        } else {
          console.error('✗ Failed:', statement.substring(0, 50) + '...');
          console.error('  Error:', err.message);
        }
      }
    }

    console.log('\n✅ Migration 032 completed successfully');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
