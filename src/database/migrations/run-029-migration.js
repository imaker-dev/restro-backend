/**
 * Run migration 029: Allow multiple shifts per day per floor
 * 
 * Usage: node src/database/migrations/run-029-migration.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db',
    multipleStatements: true
  });

  try {
    console.log('Running migration 029: Allow multiple shifts per day...');
    
    // Read and execute migration SQL
    const sqlPath = path.join(__dirname, '029_allow_multiple_shifts_per_day.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by statements and run each (skip empty/comment-only lines)
    const statements = sql.split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement) {
        try {
          await connection.query(statement);
          console.log('✓ Executed:', statement.substring(0, 60) + '...');
        } catch (err) {
          // Ignore if constraint doesn't exist
          if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            console.log('⚠ Constraint already dropped, skipping...');
          } else if (err.code === 'ER_DUP_KEYNAME') {
            console.log('⚠ Index already exists, skipping...');
          } else {
            throw err;
          }
        }
      }
    }
    
    console.log('\n✓ Migration 029 completed successfully!');
    console.log('Multiple shifts per day per floor are now allowed.');
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
