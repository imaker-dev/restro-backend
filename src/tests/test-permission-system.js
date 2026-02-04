/**
 * Permission System Test Script
 * Tests all permission scenarios as per specification
 * 
 * Scenarios:
 * 1. Admin has ALL permissions (superuser)
 * 2. Admin creates Manager with permissions
 * 3. Admin creates Captain with permissions
 * 4. Manager creates Captain (only with Manager's permissions)
 * 5. Manager cannot grant permissions they don't have
 * 6. Permission updates apply immediately
 * 7. Audit logging
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

const testData = {
  adminToken: null,
  managerToken: null,
  captainToken: null,
  outletId: null,
  roles: {},
  permissions: [],
  createdUsers: [],
  testManager: null,
  testCaptain: null,
  managerCaptain: null
};

const results = { passed: 0, failed: 0, skipped: 0 };

const api = (token = testData.adminToken) => axios.create({
  baseURL: BASE_URL,
  headers: { 
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  },
  validateStatus: () => true
});

function logTest(name, passed, details = '') {
  if (passed) {
    results.passed++;
    console.log(`   ✅ PASS: ${name}`);
  } else {
    results.failed++;
    console.log(`   ❌ FAIL: ${name}`);
  }
  if (details) console.log(`      ${details}`);
}

const ts = () => Date.now().toString().slice(-6);

// ========================
// SETUP
// ========================

async function setup() {
  console.log('\n' + '═'.repeat(60));
  console.log('PERMISSION SYSTEM TESTS');
  console.log('═'.repeat(60));
  
  // Login as admin
  console.log('\n🔐 Setup...');
  const loginRes = await api(null).post('/auth/login', {
    email: 'admin@restropos.com',
    password: 'admin123'
  });
  
  if (!loginRes.data.success) {
    console.log('❌ Admin login failed:', loginRes.data.message);
    process.exit(1);
  }
  
  testData.adminToken = loginRes.data.data.accessToken;
  console.log('   ✅ Admin logged in');
  
  // Get outlet
  const outletsRes = await api().get('/outlets');
  if (outletsRes.data.success && outletsRes.data.data?.length > 0) {
    testData.outletId = outletsRes.data.data[0].id;
    console.log(`   Outlet: ${outletsRes.data.data[0].name} (ID: ${testData.outletId})`);
  }
  
  // Get roles
  const rolesRes = await api().get('/users/roles');
  if (rolesRes.data.success) {
    rolesRes.data.data.forEach(role => {
      testData.roles[role.name.toLowerCase()] = role.id;
    });
    console.log(`   Roles: ${Object.keys(testData.roles).join(', ')}`);
  }
  
  // Get all permissions
  const permsRes = await api().get('/permissions');
  if (permsRes.data.success) {
    testData.permissions = permsRes.data.data.permissions;
    console.log(`   Permissions: ${testData.permissions.length} available`);
  }
}

// ========================
// TEST 1: ADMIN HAS ALL PERMISSIONS
// ========================

async function testAdminSuperuser() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 1: ADMIN HAS ALL PERMISSIONS (SUPERUSER)');
  console.log('─'.repeat(60));
  
  // 1.1 Get admin's permissions
  console.log('\n   📝 Test 1.1: Admin Permission Check');
  const permsRes = await api().get('/permissions/my');
  logTest('Admin is superuser', permsRes.data.success && permsRes.data.data.isSuperuser,
    permsRes.data.success ? `Superuser: ${permsRes.data.data.isSuperuser}` : permsRes.data.message);
  
  // 1.2 Admin has all permissions
  console.log('\n   📝 Test 1.2: Admin Has All Permissions');
  const checkRes = await api().post('/permissions/check', {
    permissions: ['STAFF_PERMISSIONS', 'BILL_GENERATE', 'ORDER_CANCEL', 'INVENTORY_EDIT']
  });
  const allGranted = checkRes.data.success && 
    Object.values(checkRes.data.data.permissions).every(v => v === true);
  logTest('Admin has all checked permissions', allGranted,
    checkRes.data.success ? `All granted: ${allGranted}` : checkRes.data.message);
  
  // 1.3 Get grantable permissions (admin can grant all)
  console.log('\n   📝 Test 1.3: Admin Can Grant All Permissions');
  const grantableRes = await api().get('/permissions/grantable');
  logTest('Admin can grant all', grantableRes.data.success,
    grantableRes.data.success ? `Grantable: ${grantableRes.data.data.permissions.length}` : grantableRes.data.message);
}

// ========================
// TEST 2: ADMIN CREATES MANAGER WITH PERMISSIONS
// ========================

async function testAdminCreatesManager() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 2: ADMIN CREATES MANAGER WITH PERMISSIONS');
  console.log('─'.repeat(60));
  
  const managerRoleId = testData.roles.manager;
  if (!managerRoleId) {
    console.log('   ⚠️ Skipping: Manager role not found');
    results.skipped++;
    return;
  }
  
  // 2.1 Create manager
  console.log('\n   📝 Test 2.1: Create Manager');
  const managerData = {
    name: `Perm Test Manager ${ts()}`,
    email: `perm.mgr.${ts()}@test.com`,
    employeeCode: `PMGR${ts()}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: managerRoleId, outletId: testData.outletId }]
  };
  
  const createRes = await api().post('/users', managerData);
  logTest('Create manager', createRes.data.success,
    createRes.data.success ? `ID: ${createRes.data.data.id}` : createRes.data.message);
  
  if (createRes.data.success) {
    testData.testManager = createRes.data.data;
    testData.createdUsers.push(createRes.data.data.id);
  } else {
    return;
  }
  
  // 2.2 Get manager's default permissions (from role)
  console.log('\n   📝 Test 2.2: Get Manager Default Permissions');
  const permsRes = await api().get(`/users/${testData.testManager.id}/permissions`);
  logTest('Get manager permissions', permsRes.data.success,
    permsRes.data.success ? `Permissions: ${permsRes.data.data.permissions.length}` : permsRes.data.message);
  
  // 2.3 Admin grants additional permissions to manager
  console.log('\n   📝 Test 2.3: Admin Grants Additional Permission');
  const grantRes = await api().post(`/users/${testData.testManager.id}/permissions/grant`, {
    permissions: ['OUTLET_CREATE', 'OUTLET_DELETE'],
    outletId: testData.outletId,
    reason: 'Test grant'
  });
  logTest('Grant additional permissions', grantRes.data.success,
    grantRes.data.success ? 'Granted OUTLET_CREATE, OUTLET_DELETE' : grantRes.data.message);
  
  // 2.4 Verify permissions updated
  console.log('\n   📝 Test 2.4: Verify Permissions Updated');
  const verifyRes = await api().get(`/users/${testData.testManager.id}/permissions`);
  const hasOutletCreate = verifyRes.data.success && 
    verifyRes.data.data.permissions.includes('OUTLET_CREATE');
  logTest('Manager now has OUTLET_CREATE', hasOutletCreate,
    hasOutletCreate ? 'Permission granted' : 'Permission not found');
  
  // 2.5 Login as manager to verify
  console.log('\n   📝 Test 2.5: Manager Login');
  const loginRes = await api(null).post('/auth/login', {
    email: managerData.email,
    password: 'Manager@123'
  });
  
  if (loginRes.data.success) {
    testData.managerToken = loginRes.data.data.accessToken;
    logTest('Manager login', true, 'Manager logged in');
  } else {
    logTest('Manager login', false, loginRes.data.message);
    return;
  }
  
  // 2.6 Manager checks own permissions
  console.log('\n   📝 Test 2.6: Manager Checks Own Permissions');
  const myPermsRes = await api(testData.managerToken).get('/permissions/my');
  const managerHasStaffPerms = myPermsRes.data.success && 
    myPermsRes.data.data.permissions.includes('STAFF_PERMISSIONS');
  logTest('Manager has STAFF_PERMISSIONS', managerHasStaffPerms,
    myPermsRes.data.success ? `Total: ${myPermsRes.data.data.permissions.length}` : myPermsRes.data.message);
}

// ========================
// TEST 3: ADMIN CREATES CAPTAIN WITH PERMISSIONS
// ========================

async function testAdminCreatesCaptain() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 3: ADMIN CREATES CAPTAIN WITH PERMISSIONS');
  console.log('─'.repeat(60));
  
  const captainRoleId = testData.roles.captain;
  if (!captainRoleId) {
    console.log('   ⚠️ Skipping: Captain role not found');
    results.skipped++;
    return;
  }
  
  // 3.1 Create captain
  console.log('\n   📝 Test 3.1: Create Captain');
  const captainData = {
    name: `Perm Test Captain ${ts()}`,
    employeeCode: `PCAP${ts()}`,
    pin: '5678',
    isActive: true,
    roles: [{ roleId: captainRoleId, outletId: testData.outletId }]
  };
  
  const createRes = await api().post('/users', captainData);
  logTest('Create captain', createRes.data.success,
    createRes.data.success ? `ID: ${createRes.data.data.id}` : createRes.data.message);
  
  if (createRes.data.success) {
    testData.testCaptain = createRes.data.data;
    testData.createdUsers.push(createRes.data.data.id);
  } else {
    return;
  }
  
  // 3.2 Get captain's default permissions
  console.log('\n   📝 Test 3.2: Get Captain Default Permissions');
  const permsRes = await api().get(`/users/${testData.testCaptain.id}/permissions`);
  logTest('Get captain permissions', permsRes.data.success,
    permsRes.data.success ? `Permissions: ${permsRes.data.data.permissions.length}` : permsRes.data.message);
  
  // 3.3 Admin grants discount permission to captain
  console.log('\n   📝 Test 3.3: Admin Grants DISCOUNT_CUSTOM to Captain');
  const grantRes = await api().post(`/users/${testData.testCaptain.id}/permissions/grant`, {
    permissions: ['DISCOUNT_CUSTOM'],
    reason: 'Test grant custom discount'
  });
  logTest('Grant DISCOUNT_CUSTOM', grantRes.data.success,
    grantRes.data.success ? 'Granted' : grantRes.data.message);
  
  // 3.4 Admin revokes a permission
  console.log('\n   📝 Test 3.4: Admin Revokes KOT_MODIFY from Captain');
  const revokeRes = await api().post(`/users/${testData.testCaptain.id}/permissions/revoke`, {
    permissions: ['KOT_MODIFY'],
    reason: 'Test revoke'
  });
  logTest('Revoke KOT_MODIFY', revokeRes.data.success,
    revokeRes.data.success ? 'Revoked' : revokeRes.data.message);
  
  // 3.5 Verify revocation
  console.log('\n   📝 Test 3.5: Verify Revocation Applied');
  const verifyRes = await api().get(`/users/${testData.testCaptain.id}/permissions`);
  const noKotModify = verifyRes.data.success && 
    !verifyRes.data.data.permissions.includes('KOT_MODIFY');
  logTest('Captain no longer has KOT_MODIFY', noKotModify,
    noKotModify ? 'Permission revoked' : 'Permission still exists');
}

// ========================
// TEST 4: MANAGER CREATES CAPTAIN WITH PERMISSIONS
// ========================

async function testManagerCreatesCaptain() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 4: MANAGER CREATES CAPTAIN (INHERITANCE RULES)');
  console.log('─'.repeat(60));
  
  if (!testData.managerToken) {
    console.log('   ⚠️ Skipping: No manager token');
    results.skipped++;
    return;
  }
  
  const captainRoleId = testData.roles.captain;
  
  // 4.1 Manager creates captain
  console.log('\n   📝 Test 4.1: Manager Creates Captain');
  const captainData = {
    name: `Manager Captain ${ts()}`,
    employeeCode: `MCAP${ts()}`,
    pin: '9876',
    isActive: true,
    roles: [{ roleId: captainRoleId, outletId: testData.outletId }]
  };
  
  const createRes = await api(testData.managerToken).post('/users', captainData);
  logTest('Manager creates captain', createRes.data.success,
    createRes.data.success ? `ID: ${createRes.data.data.id}` : createRes.data.message);
  
  if (createRes.data.success) {
    testData.managerCaptain = createRes.data.data;
    testData.createdUsers.push(createRes.data.data.id);
  } else {
    return;
  }
  
  // 4.2 Manager grants permissions they have
  console.log('\n   📝 Test 4.2: Manager Grants Permissions (Valid)');
  const grantRes = await api(testData.managerToken).post(`/users/${testData.managerCaptain.id}/permissions/grant`, {
    permissions: ['ORDER_CANCEL', 'BILL_CANCEL'],
    reason: 'Manager granting valid permissions'
  });
  logTest('Manager grants ORDER_CANCEL, BILL_CANCEL', grantRes.data.success,
    grantRes.data.success ? 'Granted' : grantRes.data.message);
  
  // 4.3 Get manager's grantable permissions
  console.log('\n   📝 Test 4.3: Get Manager Grantable Permissions');
  const grantableRes = await api(testData.managerToken).get('/permissions/grantable');
  logTest('Get grantable permissions', grantableRes.data.success,
    grantableRes.data.success ? `Grantable: ${grantableRes.data.data.permissions.length}` : grantableRes.data.message);
}

// ========================
// TEST 5: MANAGER CANNOT GRANT UNAUTHORIZED PERMISSIONS
// ========================

async function testManagerCannotGrantUnauthorized() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 5: MANAGER CANNOT GRANT UNAUTHORIZED PERMISSIONS');
  console.log('─'.repeat(60));
  
  if (!testData.managerToken || !testData.managerCaptain) {
    console.log('   ⚠️ Skipping: Prerequisites not met');
    results.skipped++;
    return;
  }
  
  // 5.1 Manager tries to grant OUTLET_SETTINGS (admin only)
  console.log('\n   📝 Test 5.1: Manager Tries to Grant OUTLET_SETTINGS');
  const grantRes = await api(testData.managerToken).post(`/users/${testData.managerCaptain.id}/permissions/grant`, {
    permissions: ['OUTLET_SETTINGS'],
    reason: 'Should fail'
  });
  logTest('Manager blocked from granting OUTLET_SETTINGS', !grantRes.data.success,
    grantRes.data.success ? 'ERROR: Should have been blocked!' : `Blocked: ${grantRes.data.message}`);
  
  // 5.2 Manager tries to grant SETTINGS_EDIT
  console.log('\n   📝 Test 5.2: Manager Tries to Grant SETTINGS_EDIT');
  const grant2Res = await api(testData.managerToken).post(`/users/${testData.managerCaptain.id}/permissions/grant`, {
    permissions: ['SETTINGS_EDIT']
  });
  logTest('Manager blocked from granting SETTINGS_EDIT', !grant2Res.data.success,
    grant2Res.data.success ? 'ERROR: Should have been blocked!' : `Blocked: ${grant2Res.data.message}`);
  
  // 5.3 Manager cannot modify another manager
  if (testData.testManager) {
    console.log('\n   📝 Test 5.3: Manager Cannot Modify Another Manager');
    const modifyRes = await api(testData.managerToken).post(`/users/${testData.testManager.id}/permissions/grant`, {
      permissions: ['ORDER_CREATE']
    });
    logTest('Manager blocked from modifying manager', !modifyRes.data.success,
      modifyRes.data.success ? 'ERROR: Should have been blocked!' : `Blocked: ${modifyRes.data.message}`);
  }
}

// ========================
// TEST 6: PERMISSION AUDIT LOGGING
// ========================

async function testAuditLogging() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 6: PERMISSION AUDIT LOGGING');
  console.log('─'.repeat(60));
  
  if (!testData.testCaptain) {
    console.log('   ⚠️ Skipping: No test captain');
    results.skipped++;
    return;
  }
  
  // 6.1 Get permission history
  console.log('\n   📝 Test 6.1: Get Permission Change History');
  const historyRes = await api().get(`/users/${testData.testCaptain.id}/permissions/history`);
  logTest('Get permission history', historyRes.data.success,
    historyRes.data.success ? `Entries: ${historyRes.data.data.length}` : historyRes.data.message);
  
  // 6.2 Verify audit entries exist
  if (historyRes.data.success && historyRes.data.data.length > 0) {
    const lastEntry = historyRes.data.data[0];
    console.log('\n   📝 Test 6.2: Verify Audit Entry Structure');
    const hasRequiredFields = lastEntry.changed_by && lastEntry.action && lastEntry.created_at;
    logTest('Audit entry has required fields', hasRequiredFields,
      `Action: ${lastEntry.action}, Changed by: ${lastEntry.changed_by}`);
  }
}

// ========================
// TEST 7: SET ALL PERMISSIONS AT ONCE
// ========================

async function testSetAllPermissions() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 7: SET ALL PERMISSIONS AT ONCE');
  console.log('─'.repeat(60));
  
  if (!testData.testCaptain) {
    console.log('   ⚠️ Skipping: No test captain');
    results.skipped++;
    return;
  }
  
  // 7.1 Admin sets complete permission list
  console.log('\n   📝 Test 7.1: Admin Sets Complete Permission List');
  const newPerms = ['ORDER_VIEW', 'ORDER_CREATE', 'BILL_VIEW', 'BILL_GENERATE', 'TABLE_VIEW'];
  
  const setRes = await api().put(`/users/${testData.testCaptain.id}/permissions`, {
    permissions: newPerms,
    reason: 'Testing bulk set'
  });
  logTest('Set permissions', setRes.data.success,
    setRes.data.success ? `Set ${newPerms.length} permissions` : setRes.data.message);
  
  // 7.2 Verify exact permissions
  console.log('\n   📝 Test 7.2: Verify Exact Permissions');
  const verifyRes = await api().get(`/users/${testData.testCaptain.id}/permissions`);
  const exactMatch = verifyRes.data.success && 
    verifyRes.data.data.permissions.length === newPerms.length &&
    newPerms.every(p => verifyRes.data.data.permissions.includes(p));
  logTest('Exact permissions match', exactMatch,
    verifyRes.data.success ? `Has ${verifyRes.data.data.permissions.length} permissions` : verifyRes.data.message);
}

// ========================
// CLEANUP
// ========================

async function cleanup() {
  console.log('\n' + '─'.repeat(60));
  console.log('CLEANUP');
  console.log('─'.repeat(60));
  
  console.log(`\n   Cleaning up ${testData.createdUsers.length} test users...`);
  
  for (const userId of testData.createdUsers) {
    try {
      await api().delete(`/users/${userId}`);
      console.log(`   ✓ Deleted user ID: ${userId}`);
    } catch (err) {
      console.log(`   ✗ Failed to delete user ID: ${userId}`);
    }
  }
}

// ========================
// MAIN
// ========================

async function main() {
  try {
    await setup();
    
    await testAdminSuperuser();
    await testAdminCreatesManager();
    await testAdminCreatesCaptain();
    await testManagerCreatesCaptain();
    await testManagerCannotGrantUnauthorized();
    await testAuditLogging();
    await testSetAllPermissions();
    
    // Cleanup (optional - comment out to keep test users)
    // await cleanup();
    
  } catch (error) {
    console.log('\n❌ Test execution failed:', error.message);
    console.log(error.stack);
  }
  
  // Print results
  console.log('\n' + '═'.repeat(60));
  console.log('TEST RESULTS');
  console.log('═'.repeat(60));
  console.log(`\n   ✅ Passed:  ${results.passed}`);
  console.log(`   ❌ Failed:  ${results.failed}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   📊 Total:   ${results.passed + results.failed}`);
  console.log('\n' + '═'.repeat(60));
  
  if (results.failed > 0) {
    process.exit(1);
  }
}

main();
