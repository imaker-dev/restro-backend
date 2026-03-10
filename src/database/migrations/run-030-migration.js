/**
 * Migration Runner: 030_online_order_integration
 * Creates tables for Swiggy/Zomato integration via Dyno APIs
 * 
 * Run: node src/database/migrations/run-030-migration.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log('═'.repeat(60));
  console.log('  MIGRATION: 030_online_order_integration');
  console.log('  Dyno APIs Integration Tables');
  console.log('═'.repeat(60));

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos',
    multipleStatements: true
  });

  try {
    console.log('\n✓ Connected to database:', process.env.DB_NAME || 'restro_pos');

    // Read migration SQL file
    const sqlPath = path.join(__dirname, '030_online_order_integration.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL into individual statements for better error handling
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`\n📋 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      
      // Skip empty or comment-only statements
      if (!stmt || stmt.startsWith('--')) continue;

      // Extract table name or operation for logging
      let operation = 'Execute';
      if (stmt.toUpperCase().includes('CREATE TABLE')) {
        const match = stmt.match(/CREATE TABLE.*?(\w+)/i);
        operation = `Create table: ${match ? match[1] : 'unknown'}`;
      } else if (stmt.toUpperCase().includes('ALTER TABLE')) {
        const match = stmt.match(/ALTER TABLE\s+(\w+)/i);
        operation = `Alter table: ${match ? match[1] : 'unknown'}`;
      } else if (stmt.toUpperCase().includes('CREATE INDEX')) {
        const match = stmt.match(/CREATE INDEX\s+(\w+)/i);
        operation = `Create index: ${match ? match[1] : 'unknown'}`;
      } else if (stmt.toUpperCase().includes('INSERT')) {
        operation = 'Insert data';
      } else if (stmt.toUpperCase().includes('SET @')) {
        operation = 'Set variable';
      } else if (stmt.toUpperCase().includes('PREPARE')) {
        operation = 'Prepare statement';
      } else if (stmt.toUpperCase().includes('EXECUTE')) {
        operation = 'Execute prepared';
      } else if (stmt.toUpperCase().includes('DEALLOCATE')) {
        operation = 'Deallocate';
      }

      try {
        await connection.query(stmt);
        console.log(`  ✓ ${operation}`);
        successCount++;
      } catch (err) {
        // Handle expected errors gracefully
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`  ⊘ ${operation} (already exists)`);
          skipCount++;
        } else if (err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_DUP_INDEX') {
          console.log(`  ⊘ ${operation} (index exists)`);
          skipCount++;
        } else if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`  ⊘ ${operation} (column exists)`);
          skipCount++;
        } else if (err.code === 'ER_DUP_ENTRY') {
          console.log(`  ⊘ ${operation} (entry exists)`);
          skipCount++;
        } else if (err.message.includes('column exists')) {
          console.log(`  ⊘ ${operation} (column exists)`);
          skipCount++;
        } else {
          console.log(`  ✗ ${operation}`);
          console.log(`    Error: ${err.message}`);
          errorCount++;
        }
      }
    }

    // Verify tables created
    console.log('\n' + '─'.repeat(60));
    console.log('  VERIFICATION');
    console.log('─'.repeat(60));

    const tablesToCheck = [
      'integration_channels',
      'online_orders',
      'channel_menu_mapping',
      'integration_logs'
    ];

    for (const table of tablesToCheck) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = ? AND table_name = ?`,
        [process.env.DB_NAME || 'restro_pos', table]
      );
      
      if (rows[0].count > 0) {
        console.log(`  ✓ Table '${table}' exists`);
      } else {
        console.log(`  ✗ Table '${table}' NOT FOUND`);
      }
    }

    // Check orders table columns
    const columnsToCheck = ['source', 'external_order_id', 'online_order_id'];
    for (const col of columnsToCheck) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = ? AND table_name = 'orders' AND column_name = ?`,
        [process.env.DB_NAME || 'restro_pos', col]
      );
      
      if (rows[0].count > 0) {
        console.log(`  ✓ Column 'orders.${col}' exists`);
      } else {
        console.log(`  ✗ Column 'orders.${col}' NOT FOUND`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('  MIGRATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`  ✓ Successful: ${successCount}`);
    console.log(`  ⊘ Skipped:    ${skipCount}`);
    console.log(`  ✗ Errors:     ${errorCount}`);
    console.log('═'.repeat(60));

    if (errorCount === 0) {
      console.log('\n✅ Migration completed successfully!\n');
    } else {
      console.log('\n⚠️  Migration completed with errors. Please review above.\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
