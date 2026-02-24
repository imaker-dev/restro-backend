const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos',
    multipleStatements: true
  });

  try {
    console.log('Running migration 027_app_versions.sql...');
    
    const sqlPath = path.join(__dirname, '027_app_versions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await connection.query(sql);
    
    console.log('Migration 027_app_versions.sql completed successfully!');
    
    // Verify the table was created
    const [tables] = await connection.query("SHOW TABLES LIKE 'app_versions'");
    if (tables.length > 0) {
      console.log('Table app_versions exists.');
      
      // Show the initial data
      const [rows] = await connection.query('SELECT * FROM app_versions');
      console.log('Initial data:', rows);
    }
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
