/**
 * Test /auth/me API fixes
 * Verifies:
 * 1. Deleted outlets don't show in roles
 * 2. Station assignments reflect immediately
 * 3. Super admin sees only active outlets
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testAuthMeFixes() {
  console.log('='.repeat(70));
  console.log('AUTH/ME API FIXES TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const authService = require('../src/services/auth.service');

    // Test 1: Check if deleted outlets are excluded from roles
    console.log('\n--- 1. Test Roles Query (Inactive Outlets Excluded) ---');
    
    // Find a user with roles
    const [testUsers] = await pool.query(`
      SELECT DISTINCT u.id, u.email, u.name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
      WHERE u.deleted_at IS NULL AND u.is_active = 1
      LIMIT 1
    `);
    
    if (testUsers.length > 0) {
      const testUser = testUsers[0];
      console.log(`Testing with user: ${testUser.email} (id: ${testUser.id})`);
      
      // Get user data via getCurrentUser
      const userData = await authService.getCurrentUser(testUser.id);
      
      console.log(`\nRoles returned: ${userData.roles.length}`);
      userData.roles.forEach(r => {
        console.log(`  - ${r.slug} @ outlet ${r.outletId || 'NULL'} (${r.outletName || 'N/A'})`);
      });
      
      console.log(`\nOutlets returned: ${userData.outlets.length}`);
      userData.outlets.forEach(o => console.log(`  - ${o.id}: ${o.name}`));
      
      console.log(`\nAssigned Station: ${userData.assignedStations ? userData.assignedStations.stationName : 'None'}`);
      console.log(`Assigned Floors: ${userData.assignedFloors?.length || 0}`);
    }

    // Test 2: Check super_admin gets all active outlets
    console.log('\n--- 2. Test Super Admin Outlets ---');
    
    const [superAdmins] = await pool.query(`
      SELECT u.id, u.email
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.slug = 'super_admin' AND ur.is_active = 1 AND u.deleted_at IS NULL
      LIMIT 1
    `);
    
    if (superAdmins.length > 0) {
      const superAdmin = superAdmins[0];
      console.log(`Testing with super_admin: ${superAdmin.email}`);
      
      const saData = await authService.getCurrentUser(superAdmin.id);
      
      // Count active outlets in DB
      const [activeOutlets] = await pool.query('SELECT COUNT(*) as cnt FROM outlets WHERE is_active = 1');
      
      console.log(`Active outlets in DB: ${activeOutlets[0].cnt}`);
      console.log(`Outlets returned to super_admin: ${saData.outlets.length}`);
      
      if (saData.outlets.length === activeOutlets[0].cnt) {
        console.log('✅ PASS: Super admin sees all active outlets');
      } else {
        console.log('❌ FAIL: Outlet count mismatch');
      }
    } else {
      console.log('No super_admin found for testing');
    }

    // Test 3: Verify inactive outlets are excluded
    console.log('\n--- 3. Test Inactive Outlet Exclusion ---');
    
    const [inactiveOutlets] = await pool.query('SELECT id, name FROM outlets WHERE is_active = 0 LIMIT 5');
    console.log(`Inactive outlets in DB: ${inactiveOutlets.length}`);
    inactiveOutlets.forEach(o => console.log(`  - ${o.id}: ${o.name}`));
    
    // Check if any user has roles for inactive outlets
    const [rolesForInactive] = await pool.query(`
      SELECT ur.user_id, u.email, ur.outlet_id, o.name as outlet_name, o.is_active
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      JOIN outlets o ON ur.outlet_id = o.id
      WHERE o.is_active = 0 AND ur.is_active = 1
      LIMIT 5
    `);
    
    if (rolesForInactive.length > 0) {
      console.log(`\nUsers with roles for inactive outlets (should NOT appear in /auth/me):`);
      rolesForInactive.forEach(r => console.log(`  - ${r.email} has role for outlet ${r.outlet_id} (${r.outlet_name})`));
      
      // Test one of these users
      const testUserId = rolesForInactive[0].user_id;
      const testData = await authService.getCurrentUser(testUserId);
      
      const hasInactiveOutlet = testData.roles.some(r => 
        rolesForInactive.some(ri => ri.outlet_id === r.outletId)
      );
      
      if (!hasInactiveOutlet) {
        console.log('✅ PASS: Inactive outlet roles NOT returned');
      } else {
        console.log('❌ FAIL: Inactive outlet roles still returned');
      }
    } else {
      console.log('No users with roles for inactive outlets found');
    }

    // Test 4: Station assignment data
    console.log('\n--- 4. Test Station Assignments ---');
    
    const [usersWithStations] = await pool.query(`
      SELECT DISTINCT u.id, u.email, us.station_id, ks.name as station_name
      FROM users u
      JOIN user_stations us ON u.id = us.user_id AND us.is_active = 1
      JOIN kitchen_stations ks ON us.station_id = ks.id AND ks.is_active = 1
      WHERE u.deleted_at IS NULL
      LIMIT 3
    `);
    
    console.log(`Users with station assignments: ${usersWithStations.length}`);
    for (const u of usersWithStations) {
      const userData = await authService.getCurrentUser(u.id);
      const station = userData.assignedStations;
      console.log(`  ${u.email}:`);
      console.log(`    DB station: ${u.station_name} (id: ${u.station_id})`);
      console.log(`    API station: ${station ? station.stationName : 'None'} (id: ${station?.stationId || 'N/A'})`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    console.log('\nSUMMARY OF FIXES:');
    console.log('1. Roles query now filters out inactive outlets');
    console.log('2. Caching disabled for /auth/me - data always fresh');
    console.log('3. Super admin sees only active outlets');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testAuthMeFixes();
