/**
 * Fix kitchen user outlet assignment
 * Ensures kitchen@restropos.com is assigned to outlet 4
 */
require('dotenv').config();
const { initializeDatabase, getPool } = require('./index');

async function fixKitchenOutlet() {
  console.log('Fixing kitchen user outlet assignment...\n');
  
  await initializeDatabase();
  const pool = getPool();
  
  // Get kitchen user
  const [users] = await pool.query(
    "SELECT id, email FROM users WHERE email = 'kitchen@restropos.com'"
  );
  
  if (users.length === 0) {
    console.log('Kitchen user not found!');
    process.exit(1);
  }
  
  const kitchenUserId = users[0].id;
  console.log(`Kitchen user ID: ${kitchenUserId}`);
  
  // Check current outlet assignment
  const [roles] = await pool.query(
    'SELECT ur.id, ur.outlet_id, r.name as role_name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = ? AND ur.is_active = 1',
    [kitchenUserId]
  );
  
  console.log('Current roles:');
  roles.forEach(r => console.log(`  - ${r.role_name}: outlet_id = ${r.outlet_id}`));
  
  // Update all roles to outlet 4
  const [result] = await pool.query(
    'UPDATE user_roles SET outlet_id = 4 WHERE user_id = ?',
    [kitchenUserId]
  );
  
  console.log(`\nUpdated ${result.affectedRows} role(s) to outlet_id = 4`);
  
  // Verify
  const [updated] = await pool.query(
    'SELECT ur.id, ur.outlet_id, r.name as role_name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = ? AND ur.is_active = 1',
    [kitchenUserId]
  );
  
  console.log('\nUpdated roles:');
  updated.forEach(r => console.log(`  - ${r.role_name}: outlet_id = ${r.outlet_id}`));
  
  console.log('\n✅ Kitchen user outlet fixed!');
  process.exit(0);
}

fixKitchenOutlet().catch(e => {
  console.error(e);
  process.exit(1);
});
