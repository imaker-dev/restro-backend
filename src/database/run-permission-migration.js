/**
 * Run Permission System Migration and Seed
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos',
    waitForConnections: true,
    connectionLimit: 5
  });

  console.log('\n🔄 Running Permission System Migration...\n');

  try {
    // Run migration
    const migrationPath = path.join(__dirname, 'migrations', '013_permission_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
    
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await pool.query(stmt);
          console.log('✓', stmt.substring(0, 60).replace(/\n/g, ' ') + '...');
        } catch (e) {
          if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME' || e.message.includes('Duplicate')) {
            console.log('⏭', 'Already exists:', e.message.substring(0, 60));
          } else {
            console.log('✗', e.message.substring(0, 80));
          }
        }
      }
    }
    
    console.log('\n✅ Migration complete!\n');
    
    // Now seed permissions
    console.log('🔐 Seeding Permissions...\n');
    
    const { PERMISSIONS, ROLE_PERMISSIONS } = require('./seed-permissions');
    
    // Insert permissions
    const permissionMap = {};
    for (const perm of PERMISSIONS) {
      const [existing] = await pool.query(
        'SELECT id FROM permissions WHERE slug = ?',
        [perm.slug]
      );
      
      if (existing.length > 0) {
        permissionMap[perm.slug] = existing[0].id;
      } else {
        try {
          const [result] = await pool.query(
            `INSERT INTO permissions (name, slug, module, category, display_order, description, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [perm.name, perm.slug, perm.module, perm.category, perm.order, `Permission to ${perm.name.toLowerCase()}`]
          );
          permissionMap[perm.slug] = result.insertId;
          console.log('  ✓', perm.slug);
        } catch (e) {
          console.log('  ✗', perm.slug, e.message.substring(0, 40));
        }
      }
    }
    
    console.log(`\n   Total: ${Object.keys(permissionMap).length} permissions\n`);
    
    // Assign to roles
    console.log('👥 Assigning Role Permissions...\n');
    
    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (roleName === 'admin' || roleName === 'super_admin') {
        console.log(`  ⏭ ${roleName} (superuser - implicit all)`);
        continue;
      }
      
      const [roleRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleName]);
      if (roleRows.length === 0) {
        console.log(`  ⚠ ${roleName} role not found`);
        continue;
      }
      
      const roleId = roleRows[0].id;
      let added = 0;
      
      for (const permSlug of permissions) {
        const permId = permissionMap[permSlug];
        if (!permId) continue;
        
        try {
          await pool.query(
            'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [roleId, permId]
          );
          added++;
        } catch (e) {
          // Ignore duplicates
        }
      }
      
      console.log(`  ✓ ${roleName}: ${added} permissions`);
    }
    
    console.log('\n✅ Permission seeding complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

run();
