require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dbConfig = require('../config/database.config');

const migrationsDir = path.join(__dirname, 'migrations');

const getConnection = async () => {
  return mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    multipleStatements: true,
  });
};

const getPoolConnection = async () => {
  return mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    multipleStatements: false,
  });
};

const splitStatements = (sql) => {
  return sql
    .replace(/^[ \t]*--[^\n]*/gm, '') // strip pure comment lines only (-- at line start)
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block /* */ comments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

const createDatabase = async () => {
  const connection = await getConnection();
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✓ Database '${dbConfig.database}' ensured`);
  } finally {
    await connection.end();
  }
};

const createMigrationsTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL,
      batch INT NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_migration_name (migration_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const getMigrationFiles = () => {
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
};

const getExecutedMigrations = async (connection) => {
  try {
    const [rows] = await connection.query('SELECT migration_name FROM migrations ORDER BY id');
    return rows.map(row => row.migration_name);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw error;
  }
};

const getNextBatch = async (connection) => {
  try {
    const [rows] = await connection.query('SELECT MAX(batch) as maxBatch FROM migrations');
    return (rows[0].maxBatch || 0) + 1;
  } catch (error) {
    return 1;
  }
};

const runMigrations = async () => {
  console.log('\n🚀 Running migrations...\n');
  
  await createDatabase();
  
  const connection = await getPoolConnection();
  
  try {
    // Ensure migrations table exists
    await createMigrationsTable(connection);
    
    const migrationFiles = getMigrationFiles();
    const executedMigrations = await getExecutedMigrations(connection);
    const pendingMigrations = migrationFiles.filter(file => !executedMigrations.includes(file));
    
    if (pendingMigrations.length === 0) {
      console.log('✓ No pending migrations\n');
      return;
    }
    
    const batch = await getNextBatch(connection);
    console.log(`Batch: ${batch}`);
    console.log(`Pending migrations: ${pendingMigrations.length}\n`);
    
    // Best-effort: reduce lock wait timeouts so ALTER TABLE fails fast instead of hanging.
    // Non-fatal — some MariaDB/MySQL versions don't expose these as session variables.
    try { await connection.query('SET SESSION lock_wait_timeout = 30'); } catch (_) {}
    try { await connection.query('SET SESSION innodb_lock_wait_timeout = 30'); } catch (_) {}

    for (const migrationFile of pendingMigrations) {
      console.log(`→ Running: ${migrationFile}`);
      
      const sqlPath = path.join(migrationsDir, migrationFile);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      const statements = splitStatements(sql);
      let hasError = false;
      for (const stmt of statements) {
        try {
          await connection.query(stmt);
        } catch (stmtErr) {
          // Gracefully skip idempotent errors — these mean the object already exists
          // or has already been removed. Safe for re-running on updates.
          const safeToSkip = [
            'ER_DUP_FIELDNAME',        // ALTER TABLE ADD COLUMN — column already exists
            'ER_TABLE_EXISTS_ERROR',   // CREATE TABLE — table already exists
            'ER_DUP_KEYNAME',          // CREATE INDEX — index already exists
            'ER_DUP_INDEX',            // duplicate index name
            'ER_CANT_DROP_FIELD_OR_KEY', // DROP COLUMN/KEY that doesn't exist
            'ER_DB_CREATE_EXISTS',     // CREATE DATABASE — database already exists
          ];
          if (safeToSkip.includes(stmtErr.code)) {
            console.log(`  ⊘ Skipped (already exists): ${stmtErr.sqlMessage || stmtErr.message}`);
          } else {
            console.error(`  ✗ Statement failed: ${stmtErr.message}`);
            console.error(`    SQL: ${stmt.substring(0, 120)}`);
            hasError = true;
            throw stmtErr; // rethrow — non-idempotent errors must stop the migration
          }
        }
      }
      await connection.query(
        'INSERT INTO migrations (migration_name, batch) VALUES (?, ?)',
        [migrationFile, batch]
      );
      
      console.log(`  ✓ Completed: ${migrationFile}`);
    }
    
    console.log(`\n✓ All migrations completed successfully\n`);
    
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error.stack);
    if (require.main === module) process.exit(1);
    throw error;
  } finally {
    await connection.end();
  }
};

const rollbackMigrations = async () => {
  console.log('\n🔄 Rolling back last batch...\n');
  
  const connection = await getPoolConnection();
  
  try {
    const [batchRows] = await connection.query('SELECT MAX(batch) as maxBatch FROM migrations');
    const lastBatch = batchRows[0].maxBatch;
    
    if (!lastBatch) {
      console.log('✓ Nothing to rollback\n');
      return;
    }
    
    const [migrations] = await connection.query(
      'SELECT migration_name FROM migrations WHERE batch = ? ORDER BY id DESC',
      [lastBatch]
    );
    
    console.log(`Rolling back batch ${lastBatch} (${migrations.length} migrations)\n`);
    
    // Note: This simple rollback just removes migration records
    // For full rollback support, you'd need separate down migration files
    for (const migration of migrations) {
      console.log(`→ Removing record: ${migration.migration_name}`);
      await connection.query('DELETE FROM migrations WHERE migration_name = ?', [migration.migration_name]);
      console.log(`  ✓ Removed: ${migration.migration_name}`);
    }
    
    console.log(`\n✓ Rollback completed (batch ${lastBatch})\n`);
    console.log('Note: Tables were not dropped. Run manual cleanup if needed.\n');
    
  } catch (error) {
    console.error('\n✗ Rollback failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
};

const showStatus = async () => {
  console.log('\n📊 Migration Status\n');
  
  await createDatabase();
  
  const connection = await getPoolConnection();
  
  try {
    const migrationFiles = getMigrationFiles();
    const executedMigrations = await getExecutedMigrations(connection);
    
    console.log('Migration Files:');
    console.log('─'.repeat(60));
    
    for (const file of migrationFiles) {
      const status = executedMigrations.includes(file) ? '✓' : '○';
      console.log(`  ${status} ${file}`);
    }
    
    console.log('─'.repeat(60));
    console.log(`Total: ${migrationFiles.length} | Executed: ${executedMigrations.length} | Pending: ${migrationFiles.length - executedMigrations.length}\n`);
    
  } finally {
    await connection.end();
  }
};

module.exports = { runMigrations, rollbackMigrations, showStatus };

if (require.main === module) {
  const command = process.argv[2];
  switch (command) {
    case 'rollback':
      rollbackMigrations();
      break;
    case 'status':
      showStatus();
      break;
    default:
      runMigrations();
  }
}
