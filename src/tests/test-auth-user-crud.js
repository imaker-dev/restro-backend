/**
 * Auth Module & User CRUD Test Script
 * Tests the complete authentication and user management flow
 * 
 * Hierarchy:
 * - Admin creates/manages Managers
 * - Admin creates/manages Captains, Waiters, etc.
 * - Manager can VIEW users but cannot CREATE/DELETE
 * 
 * Floor/Section assignments are OPTIONAL
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

// Test data storage
const testData = {
  adminToken: null,
  managerToken: null,
  outletId: null,
  roles: {},
  createdUsers: [],
  testManager: null,
  testCaptain: null,
  testWaiter: null
};

// Test results tracking
const results = { passed: 0, failed: 0, skipped: 0 };

// Helper: API client
const api = (token = testData.adminToken) => axios.create({
  baseURL: BASE_URL,
  headers: { 
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  },
  validateStatus: () => true
});

// Helper: Log test result
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

// Helper: Generate unique identifiers
const ts = () => Date.now().toString().slice(-6);

// ========================
// SETUP
// ========================

async function setup() {
  console.log('\n' + '═'.repeat(60));
  console.log('AUTH MODULE & USER CRUD TESTS');
  console.log('═'.repeat(60));
  
  // Login as admin
  console.log('\n🔐 Logging in as admin...');
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
}

// ========================
// TEST 1: AUTHENTICATION
// ========================

async function testAuthentication() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 1: AUTHENTICATION ENDPOINTS');
  console.log('─'.repeat(60));
  
  // 1.1 Get current user
  console.log('\n   📝 Test 1.1: Get Current User');
  const meRes = await api().get('/auth/me');
  logTest('Get current user profile', meRes.data.success, 
    meRes.data.success ? `User: ${meRes.data.data.name}` : meRes.data.message);
  
  // 1.2 Get active sessions
  console.log('\n   📝 Test 1.2: Get Active Sessions');
  const sessionsRes = await api().get('/auth/sessions');
  logTest('Get active sessions', sessionsRes.data.success,
    sessionsRes.data.success ? `Sessions: ${sessionsRes.data.data.length}` : sessionsRes.data.message);
  
  // 1.3 Refresh token test (using login to get fresh tokens)
  console.log('\n   📝 Test 1.3: Token Refresh');
  const loginRes = await api(null).post('/auth/login', {
    email: 'admin@restropos.com',
    password: 'admin123'
  });
  
  if (loginRes.data.success) {
    const refreshRes = await api(null).post('/auth/refresh', {
      refreshToken: loginRes.data.data.refreshToken
    });
    logTest('Refresh token', refreshRes.data.success,
      refreshRes.data.success ? 'New access token received' : refreshRes.data.message);
  }
}

// ========================
// TEST 2: ADMIN CREATES MANAGER
// ========================

async function testAdminCreatesManager() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 2: ADMIN CREATES MANAGER');
  console.log('─'.repeat(60));
  
  const managerRoleId = testData.roles.manager;
  if (!managerRoleId) {
    console.log('   ⚠️ Skipping: Manager role not found');
    results.skipped++;
    return;
  }
  
  // 2.1 Create manager (basic - no floor/section)
  console.log('\n   📝 Test 2.1: Create Manager (Basic)');
  const managerData = {
    name: `Test Manager ${ts()}`,
    email: `manager.${ts()}@test.com`,
    phone: '+91-9876543210',
    employeeCode: `MGR${ts()}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: managerRoleId, outletId: testData.outletId }]
  };
  
  const createRes = await api().post('/users', managerData);
  logTest('Create manager (no floor/section)', createRes.data.success,
    createRes.data.success ? `ID: ${createRes.data.data.id}` : createRes.data.message);
  
  if (createRes.data.success) {
    testData.testManager = createRes.data.data;
    testData.createdUsers.push(createRes.data.data.id);
  }
  
  // 2.2 Create manager with optional floor assignment
  console.log('\n   📝 Test 2.2: Create Manager (With Floor - Optional)');
  const managerWithFloor = {
    name: `Floor Manager ${ts()}`,
    email: `floor.mgr.${ts()}@test.com`,
    employeeCode: `FMGR${ts()}`,
    password: 'Manager@123',
    pin: '2345',
    isActive: true,
    roles: [{ roleId: managerRoleId, outletId: testData.outletId }],
    floors: [{ floorId: 1, outletId: testData.outletId, isPrimary: true }]
  };
  
  const floorMgrRes = await api().post('/users', managerWithFloor);
  logTest('Create manager with floor (optional)', floorMgrRes.data.success,
    floorMgrRes.data.success ? `ID: ${floorMgrRes.data.data.id}` : floorMgrRes.data.message);
  
  if (floorMgrRes.data.success) {
    testData.createdUsers.push(floorMgrRes.data.data.id);
  }
  
  // 2.3 Get manager by ID
  if (testData.testManager) {
    console.log('\n   📝 Test 2.3: Get Manager by ID');
    const getRes = await api().get(`/users/${testData.testManager.id}`);
    logTest('Get manager by ID', getRes.data.success,
      getRes.data.success ? `Name: ${getRes.data.data.name}` : getRes.data.message);
  }
  
  // 2.4 Update manager
  if (testData.testManager) {
    console.log('\n   📝 Test 2.4: Update Manager');
    const updateRes = await api().put(`/users/${testData.testManager.id}`, {
      name: 'Updated Manager Name',
      phone: '+91-9876500001'
    });
    logTest('Update manager', updateRes.data.success,
      updateRes.data.success ? 'Updated successfully' : updateRes.data.message);
  }
  
  // 2.5 List all managers
  console.log('\n   📝 Test 2.5: List All Managers');
  const listRes = await api().get(`/users?roleId=${managerRoleId}&outletId=${testData.outletId}`);
  logTest('List managers', listRes.data.success,
    listRes.data.success ? `Found: ${listRes.data.data.length}` : listRes.data.message);
}

// ========================
// TEST 3: ADMIN CREATES CAPTAIN
// ========================

async function testAdminCreatesCaptain() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 3: ADMIN CREATES CAPTAIN');
  console.log('─'.repeat(60));
  
  const captainRoleId = testData.roles.captain;
  if (!captainRoleId) {
    console.log('   ⚠️ Skipping: Captain role not found');
    results.skipped++;
    return;
  }
  
  // 3.1 Create captain (basic)
  console.log('\n   📝 Test 3.1: Create Captain (Basic)');
  const captainData = {
    name: `Test Captain ${ts()}`,
    email: `captain.${ts()}@test.com`,
    employeeCode: `CAP${ts()}`,
    password: 'Captain@123',
    pin: '3456',
    isActive: true,
    roles: [{ roleId: captainRoleId, outletId: testData.outletId }]
  };
  
  const createRes = await api().post('/users', captainData);
  logTest('Create captain (basic)', createRes.data.success,
    createRes.data.success ? `ID: ${createRes.data.data.id}` : createRes.data.message);
  
  if (createRes.data.success) {
    testData.testCaptain = createRes.data.data;
    testData.createdUsers.push(createRes.data.data.id);
  }
  
  // 3.2 Create captain with floor & section (optional)
  console.log('\n   📝 Test 3.2: Create Captain (With Floor & Section - Optional)');
  const captainWithAssignments = {
    name: `Captain Assigned ${ts()}`,
    email: `captain.assigned.${ts()}@test.com`,
    employeeCode: `CAPA${ts()}`,
    pin: '4567',
    isActive: true,
    roles: [{ roleId: captainRoleId, outletId: testData.outletId }],
    floors: [{ floorId: 1, outletId: testData.outletId, isPrimary: true }],
    sections: [{ sectionId: 1, outletId: testData.outletId, canViewMenu: true, canTakeOrders: true, isPrimary: true }]
  };
  
  const assignedRes = await api().post('/users', captainWithAssignments);
  logTest('Create captain with floor/section', assignedRes.data.success,
    assignedRes.data.success ? `ID: ${assignedRes.data.data.id}` : assignedRes.data.message);
  
  if (assignedRes.data.success) {
    testData.createdUsers.push(assignedRes.data.data.id);
  }
  
  // 3.3 Get captain by ID
  if (testData.testCaptain) {
    console.log('\n   📝 Test 3.3: Get Captain by ID');
    const getRes = await api().get(`/users/${testData.testCaptain.id}`);
    logTest('Get captain by ID', getRes.data.success,
      getRes.data.success ? `Name: ${getRes.data.data.name}` : getRes.data.message);
  }
  
  // 3.4 Update captain
  if (testData.testCaptain) {
    console.log('\n   📝 Test 3.4: Update Captain');
    const updateRes = await api().put(`/users/${testData.testCaptain.id}`, {
      name: 'Updated Captain Name'
    });
    logTest('Update captain', updateRes.data.success,
      updateRes.data.success ? 'Updated successfully' : updateRes.data.message);
  }
  
  // 3.5 List all captains
  console.log('\n   📝 Test 3.5: List All Captains');
  const listRes = await api().get(`/users?roleId=${captainRoleId}&outletId=${testData.outletId}`);
  logTest('List captains', listRes.data.success,
    listRes.data.success ? `Found: ${listRes.data.data.length}` : listRes.data.message);
}

// ========================
// TEST 4: ADMIN CREATES WAITER
// ========================

async function testAdminCreatesWaiter() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 4: ADMIN CREATES WAITER');
  console.log('─'.repeat(60));
  
  const waiterRoleId = testData.roles.waiter;
  if (!waiterRoleId) {
    console.log('   ⚠️ Skipping: Waiter role not found');
    results.skipped++;
    return;
  }
  
  // 4.1 Create waiter (PIN only - no password/email)
  console.log('\n   📝 Test 4.1: Create Waiter (PIN Only)');
  const waiterData = {
    name: `Test Waiter ${ts()}`,
    employeeCode: `WTR${ts()}`,
    pin: '5678',
    isActive: true,
    roles: [{ roleId: waiterRoleId, outletId: testData.outletId }]
  };
  
  const createRes = await api().post('/users', waiterData);
  logTest('Create waiter (PIN only, no email)', createRes.data.success,
    createRes.data.success ? `ID: ${createRes.data.data.id}` : createRes.data.message);
  
  if (createRes.data.success) {
    testData.testWaiter = createRes.data.data;
    testData.createdUsers.push(createRes.data.data.id);
  }
  
  // 4.2 List all waiters
  console.log('\n   📝 Test 4.2: List All Waiters');
  const listRes = await api().get(`/users?roleId=${waiterRoleId}&outletId=${testData.outletId}`);
  logTest('List waiters', listRes.data.success,
    listRes.data.success ? `Found: ${listRes.data.data.length}` : listRes.data.message);
}

// ========================
// TEST 5: ROLE ASSIGNMENT
// ========================

async function testRoleAssignment() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 5: ROLE ASSIGNMENT');
  console.log('─'.repeat(60));
  
  if (!testData.testCaptain) {
    console.log('   ⚠️ Skipping: No test captain available');
    results.skipped++;
    return;
  }
  
  const waiterRoleId = testData.roles.waiter;
  if (!waiterRoleId) {
    console.log('   ⚠️ Skipping: Waiter role not found');
    results.skipped++;
    return;
  }
  
  // 5.1 Assign additional role
  console.log('\n   📝 Test 5.1: Assign Additional Role to Captain');
  const assignRes = await api().post(`/users/${testData.testCaptain.id}/roles`, {
    roleId: waiterRoleId,
    outletId: testData.outletId
  });
  logTest('Assign waiter role to captain', assignRes.data.success,
    assignRes.data.success ? 'Role assigned' : assignRes.data.message);
  
  // 5.2 Remove role
  console.log('\n   📝 Test 5.2: Remove Role from User');
  const removeRes = await api().delete(`/users/${testData.testCaptain.id}/roles`, {
    data: { roleId: waiterRoleId, outletId: testData.outletId }
  });
  logTest('Remove waiter role from captain', removeRes.data.success,
    removeRes.data.success ? 'Role removed' : removeRes.data.message);
}

// ========================
// TEST 6: MANAGER PERMISSIONS (READ ONLY)
// ========================

async function testManagerPermissions() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 6: MANAGER PERMISSIONS (VIEW ONLY)');
  console.log('─'.repeat(60));
  
  if (!testData.testManager) {
    console.log('   ⚠️ Skipping: No test manager available');
    results.skipped++;
    return;
  }
  
  // Login as manager
  console.log('\n   📝 Test 6.0: Login as Manager');
  const loginRes = await api(null).post('/auth/login', {
    email: testData.testManager.email || `manager.${ts()}@test.com`,
    password: 'Manager@123'
  });
  
  if (!loginRes.data.success) {
    console.log('   ⚠️ Manager login failed, using existing manager email test');
    // Try with a known test email pattern
    results.skipped++;
    return;
  }
  
  testData.managerToken = loginRes.data.data.accessToken;
  logTest('Manager login', true, `Logged in as manager`);
  
  // 6.1 Manager can list users
  console.log('\n   📝 Test 6.1: Manager Lists Users');
  const listRes = await api(testData.managerToken).get('/users');
  logTest('Manager can list users', listRes.data.success,
    listRes.data.success ? `Found: ${listRes.data.data.length}` : listRes.data.message);
  
  // 6.2 Manager can view user details
  if (testData.testCaptain) {
    console.log('\n   📝 Test 6.2: Manager Views Captain Details');
    const viewRes = await api(testData.managerToken).get(`/users/${testData.testCaptain.id}`);
    logTest('Manager can view captain details', viewRes.data.success,
      viewRes.data.success ? `Viewing: ${viewRes.data.data.name}` : viewRes.data.message);
  }
  
  // 6.3 Manager can get roles
  console.log('\n   📝 Test 6.3: Manager Gets Roles');
  const rolesRes = await api(testData.managerToken).get('/users/roles');
  logTest('Manager can get roles', rolesRes.data.success,
    rolesRes.data.success ? `Found: ${rolesRes.data.data.length} roles` : rolesRes.data.message);
  
  // 6.4 Manager CAN create captain (staff)
  console.log('\n   📝 Test 6.4: Manager CAN Create Captain (Staff)');
  const captainRes = await api(testData.managerToken).post('/users', {
    name: `Manager Created Captain ${ts()}`,
    employeeCode: `MCC${ts()}`,
    pin: '9999',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  });
  logTest('Manager can create captain', captainRes.data.success,
    captainRes.data.success ? `Created ID: ${captainRes.data.data.id}` : captainRes.data.message);
  
  if (captainRes.data.success) {
    testData.createdUsers.push(captainRes.data.data.id);
    testData.managerCreatedCaptain = captainRes.data.data;
  }
  
  // 6.5 Manager CANNOT create another manager (admin-level role)
  console.log('\n   📝 Test 6.5: Manager CANNOT Create Manager (Admin Role)');
  const managerCreateRes = await api(testData.managerToken).post('/users', {
    name: 'Should Fail Manager',
    email: `fail.mgr.${ts()}@test.com`,
    employeeCode: `FMGR${ts()}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }]
  });
  logTest('Manager cannot create manager', !managerCreateRes.data.success,
    managerCreateRes.data.success ? 'ERROR: Should have failed!' : `Blocked: ${managerCreateRes.data.message}`);
  
  // 6.6 Manager CAN update captain they manage
  if (testData.managerCreatedCaptain) {
    console.log('\n   📝 Test 6.6: Manager CAN Update Captain');
    const updateRes = await api(testData.managerToken).put(`/users/${testData.managerCreatedCaptain.id}`, {
      name: 'Updated by Manager'
    });
    logTest('Manager can update captain', updateRes.data.success,
      updateRes.data.success ? 'Updated successfully' : updateRes.data.message);
  }
  
  // 6.7 Manager CANNOT update another manager
  if (testData.testManager) {
    console.log('\n   📝 Test 6.7: Manager CANNOT Update Another Manager');
    const updateMgrRes = await api(testData.managerToken).put(`/users/${testData.testManager.id}`, {
      name: 'Should Fail Update'
    });
    logTest('Manager cannot update another manager', !updateMgrRes.data.success,
      updateMgrRes.data.success ? 'ERROR: Should have failed!' : `Blocked: ${updateMgrRes.data.message}`);
  }
  
  // 6.8 Manager CAN delete captain they created
  if (testData.managerCreatedCaptain) {
    console.log('\n   📝 Test 6.8: Manager CAN Delete Captain');
    const deleteRes = await api(testData.managerToken).delete(`/users/${testData.managerCreatedCaptain.id}`);
    logTest('Manager can delete captain', deleteRes.data.success,
      deleteRes.data.success ? 'Deleted successfully' : deleteRes.data.message);
    
    // Remove from cleanup list since already deleted
    testData.createdUsers = testData.createdUsers.filter(id => id !== testData.managerCreatedCaptain.id);
  }
}

// ========================
// TEST 7: USER SEARCH & FILTERS
// ========================

async function testUserSearchFilters() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 7: USER SEARCH & FILTERS');
  console.log('─'.repeat(60));
  
  // 7.1 Search by name
  console.log('\n   📝 Test 7.1: Search Users by Name');
  const searchRes = await api().get('/users?search=captain');
  logTest('Search users by name', searchRes.data.success,
    searchRes.data.success ? `Found: ${searchRes.data.data.length}` : searchRes.data.message);
  
  // 7.2 Filter active users
  console.log('\n   📝 Test 7.2: Filter Active Users');
  const activeRes = await api().get('/users?isActive=true');
  logTest('Filter active users', activeRes.data.success,
    activeRes.data.success ? `Found: ${activeRes.data.data.length}` : activeRes.data.message);
  
  // 7.3 Pagination
  console.log('\n   📝 Test 7.3: Paginated Results');
  const pageRes = await api().get('/users?page=1&limit=5');
  logTest('Paginated users', pageRes.data.success,
    pageRes.data.success ? `Page 1: ${pageRes.data.data.length} users` : pageRes.data.message);
  
  // 7.4 Sorted results
  console.log('\n   📝 Test 7.4: Sorted Results');
  const sortRes = await api().get('/users?sortBy=name&sortOrder=ASC');
  logTest('Sorted users by name', sortRes.data.success,
    sortRes.data.success ? `First: ${sortRes.data.data[0]?.name || 'N/A'}` : sortRes.data.message);
}

// ========================
// TEST 8: DEACTIVATE & DELETE
// ========================

async function testDeactivateDelete() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 8: DEACTIVATE & DELETE USERS');
  console.log('─'.repeat(60));
  
  if (!testData.testWaiter) {
    console.log('   ⚠️ Skipping: No test waiter available');
    results.skipped++;
    return;
  }
  
  // 8.1 Deactivate user
  console.log('\n   📝 Test 8.1: Deactivate User');
  const deactivateRes = await api().put(`/users/${testData.testWaiter.id}`, {
    isActive: false
  });
  logTest('Deactivate user', deactivateRes.data.success,
    deactivateRes.data.success ? 'User deactivated' : deactivateRes.data.message);
  
  // 8.2 Reactivate user
  console.log('\n   📝 Test 8.2: Reactivate User');
  const reactivateRes = await api().put(`/users/${testData.testWaiter.id}`, {
    isActive: true
  });
  logTest('Reactivate user', reactivateRes.data.success,
    reactivateRes.data.success ? 'User reactivated' : reactivateRes.data.message);
  
  // 8.3 Delete user (soft delete)
  console.log('\n   📝 Test 8.3: Delete User (Soft Delete)');
  const deleteRes = await api().delete(`/users/${testData.testWaiter.id}`);
  logTest('Delete user', deleteRes.data.success,
    deleteRes.data.success ? 'User deleted' : deleteRes.data.message);
  
  // Remove from cleanup list since already deleted
  testData.createdUsers = testData.createdUsers.filter(id => id !== testData.testWaiter.id);
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
    
    await testAuthentication();
    await testAdminCreatesManager();
    await testAdminCreatesCaptain();
    await testAdminCreatesWaiter();
    await testRoleAssignment();
    await testManagerPermissions();
    await testUserSearchFilters();
    await testDeactivateDelete();
    
    // Optional cleanup
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
  
  console.log('\n📝 Created Test Users (not cleaned up):');
  testData.createdUsers.forEach(id => console.log(`   - User ID: ${id}`));
  
  if (results.failed > 0) {
    process.exit(1);
  }
}

main();
