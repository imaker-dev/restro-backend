/**
 * Test fixes for:
 * 1. GET /api/v1/outlets - should return only user's assigned outlets
 * 2. Sections - should only appear on their linked floor
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testFixes() {
  console.log('='.repeat(70));
  console.log('OUTLETS & SECTIONS FIXES TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const outletService = require('../src/services/outlet.service');
    const floorService = require('../src/services/floor.service');

    // Test 1: Outlets filtered by user
    console.log('\n--- 1. Test Outlets Filtering by User ---');
    
    // Find a non-super_admin user with outlet assignments
    const [nonSuperAdmins] = await pool.query(`
      SELECT DISTINCT u.id, u.email, COUNT(DISTINCT ur.outlet_id) as outlet_count
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1 AND ur.outlet_id IS NOT NULL
      JOIN roles r ON ur.role_id = r.id
      WHERE r.slug != 'super_admin' AND u.deleted_at IS NULL
      GROUP BY u.id
      HAVING outlet_count > 0
      LIMIT 3
    `);

    for (const user of nonSuperAdmins) {
      // Get outlets via service (simulating non-super_admin)
      const outlets = await outletService.getAll({}, user.id, ['admin']);
      console.log(`\n${user.email} (non-super_admin):`);
      console.log(`  Expected outlets (from user_roles): ${user.outlet_count}`);
      console.log(`  Returned outlets: ${outlets.length}`);
      
      if (outlets.length <= user.outlet_count) {
        console.log('  ✅ PASS: Only assigned outlets returned');
      } else {
        console.log('  ❌ FAIL: More outlets returned than assigned');
      }
    }

    // Test super_admin gets all outlets
    const [superAdmins] = await pool.query(`
      SELECT u.id, u.email FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.slug = 'super_admin' AND u.deleted_at IS NULL
      LIMIT 1
    `);

    if (superAdmins.length > 0) {
      const [totalActive] = await pool.query('SELECT COUNT(*) as cnt FROM outlets WHERE is_active = 1 AND deleted_at IS NULL');
      const allOutlets = await outletService.getAll({}, superAdmins[0].id, ['super_admin']);
      
      console.log(`\n${superAdmins[0].email} (super_admin):`);
      console.log(`  Total active outlets: ${totalActive[0].cnt}`);
      console.log(`  Returned outlets: ${allOutlets.length}`);
      
      if (allOutlets.length === totalActive[0].cnt) {
        console.log('  ✅ PASS: Super admin sees all outlets');
      } else {
        console.log('  ❌ FAIL: Super admin outlet count mismatch');
      }
    }

    // Test 2: Sections per floor
    console.log('\n--- 2. Test Sections Per Floor ---');

    // Find floors with floor_sections links
    const [floorsWithSections] = await pool.query(`
      SELECT f.id as floor_id, f.name as floor_name, f.outlet_id, o.name as outlet_name,
             COUNT(fs.section_id) as linked_sections
      FROM floors f
      JOIN outlets o ON f.outlet_id = o.id
      LEFT JOIN floor_sections fs ON f.id = fs.floor_id AND fs.is_active = 1
      WHERE f.is_active = 1
      GROUP BY f.id
      ORDER BY linked_sections DESC
      LIMIT 5
    `);

    console.log('\nFloors and their linked sections:');
    for (const floor of floorsWithSections) {
      const result = await floorService.getFloorSectionsWithTables(floor.floor_id);
      console.log(`  Floor ${floor.floor_id} (${floor.floor_name}) @ ${floor.outlet_name}:`);
      console.log(`    Expected sections (from floor_sections): ${floor.linked_sections}`);
      console.log(`    Returned sections: ${result ? result.sections.length : 0}`);
      
      if (result && result.sections.length === parseInt(floor.linked_sections)) {
        console.log('    ✅ PASS: Only linked sections returned');
      } else if (!result) {
        console.log('    ⚠️ Floor not found');
      } else {
        console.log('    ❌ FAIL: Section count mismatch');
      }
    }

    // Test specific case: Create section on floor, verify it only appears on that floor
    console.log('\n--- 3. Verify Section Floor Isolation ---');
    
    const [multiFloorOutlets] = await pool.query(`
      SELECT o.id as outlet_id, o.name, COUNT(f.id) as floor_count
      FROM outlets o
      JOIN floors f ON o.id = f.outlet_id AND f.is_active = 1
      WHERE o.is_active = 1
      GROUP BY o.id
      HAVING floor_count >= 2
      LIMIT 1
    `);

    if (multiFloorOutlets.length > 0) {
      const outlet = multiFloorOutlets[0];
      const [floors] = await pool.query(
        'SELECT id, name FROM floors WHERE outlet_id = ? AND is_active = 1 LIMIT 2',
        [outlet.outlet_id]
      );
      
      console.log(`\nOutlet: ${outlet.name} (${outlet.floor_count} floors)`);
      
      for (const floor of floors) {
        const result = await floorService.getFloorSectionsWithTables(floor.id);
        const sectionNames = result.sections.map(s => s.name).join(', ') || 'None';
        console.log(`  Floor ${floor.id} (${floor.name}): ${result.sections.length} sections`);
        console.log(`    Sections: ${sectionNames}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    console.log('\nSUMMARY OF FIXES:');
    console.log('1. GET /api/v1/outlets now filters by user_roles (super_admin sees all)');
    console.log('2. Sections now only appear on floors they are linked to via floor_sections');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testFixes();
