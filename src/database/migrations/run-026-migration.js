/**
 * Run migration 026: KOT Station Type Fix
 * Usage: node src/database/migrations/run-026-migration.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load database config
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restro',
  port: parseInt(process.env.DB_PORT) || 3306
};

async function runMigration() {
  console.log('Connecting to database...');
  console.log(`Host: ${dbConfig.host}, Database: ${dbConfig.database}`);
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log('\n--- Running Migration 026: KOT Station Type Fix ---\n');

    // Step 1: Change station column from ENUM to VARCHAR
    console.log('1. Changing kot_tickets.station from ENUM to VARCHAR(50)...');
    try {
      await connection.query(`
        ALTER TABLE kot_tickets 
        MODIFY COLUMN station VARCHAR(50) DEFAULT 'main_kitchen'
      `);
      console.log('   ✓ Column type changed to VARCHAR(50)');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('   ⚠ Column already VARCHAR, skipping...');
      } else {
        console.log('   ⚠ Warning:', err.message);
      }
    }

    // Step 2: Add station_id column
    console.log('2. Adding station_id column...');
    try {
      await connection.query(`
        ALTER TABLE kot_tickets 
        ADD COLUMN station_id BIGINT UNSIGNED NULL AFTER station
      `);
      console.log('   ✓ station_id column added');
    } catch (err) {
      if (err.message.includes('Duplicate column')) {
        console.log('   ⚠ Column already exists, skipping...');
      } else {
        console.log('   ⚠ Warning:', err.message);
      }
    }

    // Step 3: Add index on station_id
    console.log('3. Adding index on station_id...');
    try {
      await connection.query(`
        ALTER TABLE kot_tickets 
        ADD INDEX idx_kot_station_id (station_id)
      `);
      console.log('   ✓ Index added');
    } catch (err) {
      if (err.message.includes('Duplicate key name')) {
        console.log('   ⚠ Index already exists, skipping...');
      } else {
        console.log('   ⚠ Warning:', err.message);
      }
    }

    // Step 4: Update existing records
    console.log('4. Updating existing records (kitchen → main_kitchen)...');
    try {
      const [result] = await connection.query(`
        UPDATE kot_tickets SET station = 'main_kitchen' WHERE station = 'kitchen'
      `);
      console.log(`   ✓ Updated ${result.affectedRows} records`);
    } catch (err) {
      console.log('   ⚠ Warning:', err.message);
    }

    // Verify
    console.log('\n5. Verifying migration...');
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM kot_tickets WHERE Field IN ('station', 'station_id')
    `);
    console.log('   Columns:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type} (Default: ${col.Default})`);
    });

    console.log('\n✅ Migration 026 completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
