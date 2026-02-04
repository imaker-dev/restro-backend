/**
 * Fix permissions table - add missing columns
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos'
  });

  console.log('\n🔧 Fixing permissions table...\n');

  const alterations = [
    { col: 'category', sql: 'ALTER TABLE permissions ADD COLUMN category VARCHAR(50) DEFAULT "general" AFTER module' },
    { col: 'display_order', sql: 'ALTER TABLE permissions ADD COLUMN display_order INT DEFAULT 0 AFTER category' },
    { col: 'is_active', sql: 'ALTER TABLE permissions ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER display_order' }
  ];

  for (const alt of alterations) {
    try {
      await pool.query(alt.sql);
      console.log(`✓ Added ${alt.col} column`);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log(`⏭ ${alt.col} already exists`);
      } else {
        console.log(`✗ ${alt.col}: ${e.message}`);
      }
    }
  }

  // Create user_permissions table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        permission_id BIGINT UNSIGNED NOT NULL,
        outlet_id BIGINT UNSIGNED,
        granted BOOLEAN DEFAULT TRUE,
        granted_by BIGINT UNSIGNED NOT NULL,
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_permission_outlet (user_id, permission_id, outlet_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
        INDEX idx_user_perms_user (user_id)
      )
    `);
    console.log('✓ user_permissions table ready');
  } catch (e) {
    console.log('⏭ user_permissions:', e.message.substring(0, 50));
  }

  // Create permission_logs table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permission_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        changed_by BIGINT UNSIGNED NOT NULL,
        target_user_id BIGINT UNSIGNED NOT NULL,
        target_role_id BIGINT UNSIGNED,
        action ENUM('grant', 'revoke', 'bulk_update') NOT NULL,
        permission_ids JSON,
        old_permissions JSON,
        new_permissions JSON,
        outlet_id BIGINT UNSIGNED,
        reason VARCHAR(500),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_perm_logs_target (target_user_id),
        INDEX idx_perm_logs_created (created_at)
      )
    `);
    console.log('✓ permission_logs table ready');
  } catch (e) {
    console.log('⏭ permission_logs:', e.message.substring(0, 50));
  }

  console.log('\n✅ Table fixes complete!\n');
  await pool.end();
}

run();
