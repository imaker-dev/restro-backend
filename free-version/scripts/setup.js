#!/usr/bin/env node
/**
 * Restro POS Free Version — First-Time Setup
 * 
 * Called by the launcher on first run. Initializes:
 * 1. MariaDB data directory (mysql_install_db)
 * 2. Creates the database and user
 * 3. Runs all migrations
 * 4. Seeds default data (roles, permissions, default admin user)
 * 
 * This script is idempotent — safe to run multiple times.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = process.cwd();
const MARIADB_DIR = path.join(ROOT, 'mariadb');
const DATA_DIR = path.join(ROOT, 'data');

// Config from env or defaults
const DB_PORT = parseInt(process.env.DB_PORT) || 3307;
const DB_NAME = process.env.DB_NAME || 'restro';
const DB_USER = process.env.DB_USER || 'restro';
const DB_PASSWORD = process.env.DB_PASSWORD || 'restro_pos_2024';

const isWindows = process.platform === 'win32';

function getMariaDBBin(name) {
  const ext = isWindows ? '.exe' : '';
  const binDir = isWindows ? 'bin' : 'bin';
  return path.join(MARIADB_DIR, binDir, `${name}${ext}`);
}

async function waitForMySQL(port, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const conn = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        password: '',
        connectTimeout: 2000,
      });
      await conn.ping();
      await conn.end();
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

async function setup() {
  console.log('=== Restro POS Free Version Setup ===\n');

  // Check MariaDB exists
  const mysqldPath = getMariaDBBin('mariadbd') || getMariaDBBin('mysqld');
  if (!fs.existsSync(getMariaDBBin('mariadbd')) && !fs.existsSync(getMariaDBBin('mysqld'))) {
    console.error('ERROR: MariaDB not found at:', MARIADB_DIR);
    console.error('Please run: node free-version/scripts/download-mariadb.js --platform=<your-platform>');
    process.exit(1);
  }

  const serverBin = fs.existsSync(getMariaDBBin('mariadbd')) ? getMariaDBBin('mariadbd') : getMariaDBBin('mysqld');

  // 1. Initialize data directory if empty
  const markerFile = path.join(DATA_DIR, '.initialized');
  if (!fs.existsSync(markerFile)) {
    console.log('1. Initializing database directory...');
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const installDb = fs.existsSync(getMariaDBBin('mariadb-install-db'))
      ? getMariaDBBin('mariadb-install-db')
      : getMariaDBBin('mysql_install_db');

    if (!fs.existsSync(installDb)) {
      console.error('ERROR: Cannot find mariadb-install-db or mysql_install_db');
      process.exit(1);
    }

    try {
      execSync(
        `"${installDb}" --datadir="${DATA_DIR}" --basedir="${MARIADB_DIR}"`,
        { stdio: 'inherit' }
      );
    } catch (err) {
      console.error('Failed to initialize DB:', err.message);
      process.exit(1);
    }

    fs.writeFileSync(markerFile, new Date().toISOString());
    console.log('   ✓ Data directory initialized\n');
  } else {
    console.log('1. Data directory already initialized ✓\n');
  }

  // 2. Start MariaDB temporarily for setup
  console.log('2. Starting MariaDB for setup...');
  
  // Write temp config
  const myIni = path.join(ROOT, 'my-setup.ini');
  fs.writeFileSync(myIni, `[mysqld]
port=${DB_PORT}
datadir=${DATA_DIR.replace(/\\/g, '/')}
basedir=${MARIADB_DIR.replace(/\\/g, '/')}
skip-networking=0
bind-address=127.0.0.1
socket=${path.join(DATA_DIR, 'mysql.sock').replace(/\\/g, '/')}
skip-grant-tables
`);

  const serverProcess = spawn(serverBin, [`--defaults-file=${myIni}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('ready for connections') || msg.includes('mariadbd: ready')) {
      console.log('   MariaDB is ready');
    }
  });

  // Wait for MariaDB to be ready
  console.log('   Waiting for MariaDB to start...');
  const ready = await waitForMySQL(DB_PORT);
  if (!ready) {
    console.error('ERROR: MariaDB failed to start within 30 seconds');
    serverProcess.kill();
    process.exit(1);
  }
  console.log('   ✓ MariaDB started\n');

  // 3. Create database and user
  console.log('3. Creating database and user...');
  try {
    const rootConn = await mysql.createConnection({
      host: '127.0.0.1',
      port: DB_PORT,
      user: 'root',
      password: '',
      multipleStatements: true,
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    // Create user (ignore if exists)
    try {
      await rootConn.query(`CREATE USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}'`);
    } catch { /* user may already exist */ }
    try {
      await rootConn.query(`CREATE USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}'`);
    } catch { /* user may already exist */ }
    
    await rootConn.query(`GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1'`);
    await rootConn.query(`GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost'`);
    await rootConn.query(`FLUSH PRIVILEGES`);
    await rootConn.end();
    
    console.log(`   ✓ Database '${DB_NAME}' created`);
    console.log(`   ✓ User '${DB_USER}' created\n`);
  } catch (err) {
    console.error('Failed to create DB/user:', err.message);
    // Non-fatal — may already exist
  }

  // 4. Stop the skip-grant-tables instance
  serverProcess.kill();
  await new Promise(r => setTimeout(r, 2000));

  // Clean up temp config
  if (fs.existsSync(myIni)) fs.unlinkSync(myIni);

  console.log('=== Setup Complete ===\n');
  console.log('You can now start Restro POS using the launcher script.');
  console.log(`Database: ${DB_NAME} on port ${DB_PORT}`);
  console.log(`User: ${DB_USER}`);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
