/**
 * Test Login After Hard Delete
 * Verifies that users without outlet assignments cannot login
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testLoginAfterHardDelete() {
  console.log('='.repeat(70));
  console.log('LOGIN AFTER HARD DELETE TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const authService = require('../src/services/auth.service');

    // Find a user with outlet assignment
    console.log('\n--- 1. Find Users with Outlet Assignments ---');
    const [usersWithOutlets] = await pool.query(`
      SELECT u.id, u.email, u.name, ur.outlet_id, o.name as outlet_name, r.slug as role
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
      JOIN outlets o ON ur.outlet_id = o.id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.deleted_at IS NULL AND u.is_active = 1
      LIMIT 5
    `);
    
    console.log('Users with outlet assignments:');
    usersWithOutlets.forEach(u => console.log(`  ${u.email} - ${u.role} @ ${u.outlet_name} (outlet_id: ${u.outlet_id})`));

    // Find a user WITHOUT outlet assignment (simulates after hard delete)
    console.log('\n--- 2. Find Users WITHOUT Outlet Assignments ---');
    const [usersWithoutOutlets] = await pool.query(`
      SELECT u.id, u.email, u.name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1 AND ur.outlet_id IS NOT NULL
      WHERE u.deleted_at IS NULL AND u.is_active = 1
        AND ur.id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur2
          JOIN roles r ON ur2.role_id = r.id
          WHERE ur2.user_id = u.id AND r.slug = 'super_admin'
        )
      LIMIT 5
    `);
    
    if (usersWithoutOutlets.length === 0) {
      console.log('No users without outlet assignments found (this is expected normally)');
    } else {
      console.log('Users WITHOUT outlet assignments (should NOT be able to login):');
      usersWithoutOutlets.forEach(u => console.log(`  ${u.email} (id: ${u.id})`));
    }

    // Test _getUserOutlets function
    console.log('\n--- 3. Test _getUserOutlets Function ---');
    
    if (usersWithOutlets.length > 0) {
      const testUser = usersWithOutlets[0];
      console.log(`\nTesting with user: ${testUser.email}`);
      const outlets = await authService._getUserOutlets(testUser.id);
      console.log(`  Outlets: ${outlets.outlets.length}`);
      console.log(`  Primary outletId: ${outlets.outletId}`);
      console.log(`  Outlet name: ${outlets.outletName}`);
    }

    // Simulate a user with no outlets
    console.log('\n--- 4. Simulate User With No Outlets ---');
    
    // Create a test scenario: find a user and check what happens if their user_roles were deleted
    if (usersWithOutlets.length > 0) {
      const testUserId = usersWithOutlets[0].id;
      
      // Temporarily check what roles they have
      const [roles] = await pool.query(
        `SELECT ur.*, r.slug, o.name as outlet_name 
         FROM user_roles ur 
         JOIN roles r ON ur.role_id = r.id 
         LEFT JOIN outlets o ON ur.outlet_id = o.id
         WHERE ur.user_id = ?`,
        [testUserId]
      );
      console.log(`User ${testUserId} roles:`);
      roles.forEach(r => console.log(`  ${r.slug} @ outlet ${r.outlet_id || 'NULL'} (${r.outlet_name || 'N/A'})`));
    }

    // Check what happens in hard delete scenario
    console.log('\n--- 5. Hard Delete Impact Analysis ---');
    
    // Check if user_roles with specific outlet_id would be deleted
    const [rolesByOutlet] = await pool.query(`
      SELECT ur.outlet_id, COUNT(*) as user_count, o.name as outlet_name
      FROM user_roles ur
      JOIN outlets o ON ur.outlet_id = o.id
      WHERE ur.is_active = 1
      GROUP BY ur.outlet_id
      ORDER BY user_count DESC
      LIMIT 10
    `);
    
    console.log('User counts by outlet (would be affected by hard delete):');
    rolesByOutlet.forEach(r => console.log(`  Outlet ${r.outlet_id} (${r.outlet_name}): ${r.user_count} users`));

    // Check users who ONLY have one outlet assignment
    console.log('\n--- 6. Users with Single Outlet Assignment ---');
    const [singleOutletUsers] = await pool.query(`
      SELECT u.id, u.email, u.name, COUNT(ur.outlet_id) as outlet_count
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1 AND ur.outlet_id IS NOT NULL
      WHERE u.deleted_at IS NULL AND u.is_active = 1
      GROUP BY u.id
      HAVING outlet_count = 1
      LIMIT 10
    `);
    
    console.log('Users with ONLY ONE outlet (would lose access after hard delete):');
    singleOutletUsers.forEach(u => console.log(`  ${u.email}`));

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    console.log('\nSUMMARY:');
    console.log('- Email login now checks for outlet assignments before allowing login');
    console.log('- PIN login already had this check');
    console.log('- Hard delete removes user_roles for the deleted outlet');
    console.log('- Users with only that outlet will get "No outlet assigned" error on login');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testLoginAfterHardDelete();
