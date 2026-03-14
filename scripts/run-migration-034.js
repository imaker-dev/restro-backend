/**
 * Migration Script: 034_daily_sales_nc_columns.sql
 * Adds NC columns to daily_sales and staff_sales tables
 * 
 * Usage: node scripts/run-migration-034.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Migration 034: Add NC columns to aggregation tables');
  console.log('='.repeat(60));

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro',
    multipleStatements: true
  });

  try {
    // Check if columns already exist
    console.log('\n[1/4] Checking existing columns...');
    
    const [dailySalesCols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_sales' AND COLUMN_NAME IN ('nc_orders', 'nc_amount')`,
      [process.env.DB_NAME || 'restro_db']
    );
    
    const [staffSalesCols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_sales' AND COLUMN_NAME IN ('nc_orders', 'nc_amount')`,
      [process.env.DB_NAME || 'restro_db']
    );

    const dailySalesHasNC = dailySalesCols.length >= 2;
    const staffSalesHasNC = staffSalesCols.length >= 2;

    // Add columns to daily_sales if not exists
    console.log('\n[2/4] Adding NC columns to daily_sales...');
    if (dailySalesHasNC) {
      console.log('  ✓ NC columns already exist in daily_sales');
    } else {
      try {
        if (!dailySalesCols.find(c => c.COLUMN_NAME === 'nc_orders')) {
          await pool.query(`ALTER TABLE daily_sales ADD COLUMN nc_orders INT DEFAULT 0 AFTER cancelled_orders`);
          console.log('  ✓ Added nc_orders column');
        }
        if (!dailySalesCols.find(c => c.COLUMN_NAME === 'nc_amount')) {
          await pool.query(`ALTER TABLE daily_sales ADD COLUMN nc_amount DECIMAL(14, 2) DEFAULT 0 AFTER nc_orders`);
          console.log('  ✓ Added nc_amount column');
        }
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log('  ✓ Columns already exist (duplicate field)');
        } else {
          throw err;
        }
      }
    }

    // Add columns to staff_sales if not exists
    console.log('\n[3/4] Adding NC columns to staff_sales...');
    if (staffSalesHasNC) {
      console.log('  ✓ NC columns already exist in staff_sales');
    } else {
      try {
        if (!staffSalesCols.find(c => c.COLUMN_NAME === 'nc_orders')) {
          await pool.query(`ALTER TABLE staff_sales ADD COLUMN nc_orders INT DEFAULT 0 AFTER cancelled_amount`);
          console.log('  ✓ Added nc_orders column');
        }
        if (!staffSalesCols.find(c => c.COLUMN_NAME === 'nc_amount')) {
          await pool.query(`ALTER TABLE staff_sales ADD COLUMN nc_amount DECIMAL(14, 2) DEFAULT 0 AFTER nc_orders`);
          console.log('  ✓ Added nc_amount column');
        }
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log('  ✓ Columns already exist (duplicate field)');
        } else {
          throw err;
        }
      }
    }

    // Verify columns
    console.log('\n[4/4] Verifying columns...');
    
    const [verifyDaily] = await pool.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_sales' AND COLUMN_NAME IN ('nc_orders', 'nc_amount')
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME || 'restro_db']
    );
    
    const [verifyStaff] = await pool.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'staff_sales' AND COLUMN_NAME IN ('nc_orders', 'nc_amount')
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME || 'restro_db']
    );

    console.log('\n  daily_sales columns:');
    verifyDaily.forEach(c => console.log(`    - ${c.COLUMN_NAME}: ${c.DATA_TYPE} (default: ${c.COLUMN_DEFAULT})`));
    
    console.log('\n  staff_sales columns:');
    verifyStaff.forEach(c => console.log(`    - ${c.COLUMN_NAME}: ${c.DATA_TYPE} (default: ${c.COLUMN_DEFAULT})`));

    console.log('\n' + '='.repeat(60));
    console.log('Migration 034 completed successfully!');
    console.log('='.repeat(60));

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
