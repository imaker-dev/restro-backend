/**
 * Test Script: Auth & Permission System
 * Tests PIN login for all roles and auto-granted permissions
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

// Test data
const testData = {
  adminToken: null,
  managerToken: null,
  captainToken: null,
  outletId: null,
  testManager: null,
  testCaptain: null,
  roles: {},
};

// Helper function
const api = (token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers, validateStatus: () => true });
};

const log = (msg, data = null) => {
  console.log(`   ${msg}`);
  if (data) console.log(`      ${typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : data}`);
};

const pass = (test, detail = '') => console.log(`   ✅ PASS: ${test}${detail ? `\n      ${detail}` : ''}`);
const fail = (test, detail = '') => console.log(`   ❌ FAIL: ${test}${detail ? `\n      ${detail}` : ''}`);

let passed = 0, failed = 0;

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('       AUTH & PERMISSION SYSTEM TESTS');
  console.log('══════════════════════════════════════════════════════════\n');

  // ==================== SETUP ====================
  console.log('🔐 Setup...');
  
  // Admin login
  const adminLogin = await api().post('/auth/login', {
    email: 'admin@restropos.com',
    password: 'admin123'
  });
  
  if (!adminLogin.data.success) {
    console.log('❌ Admin login failed. Is server running?');
    process.exit(1);
  }
  
  testData.adminToken = adminLogin.data.data.accessToken;
  pass('Admin logged in');

  // Get outlet
  const outlets = await api(testData.adminToken).get('/outlets');
  if (outlets.data.data?.length > 0) {
    testData.outletId = outlets.data.data[0].id;
    log(`Outlet: ${outlets.data.data[0].name} (ID: ${testData.outletId})`);
  }

  // Get roles
  const roles = await api(testData.adminToken).get('/users/roles');
  if (roles.data.success) {
    for (const role of roles.data.data) {
      testData.roles[role.slug] = role.id;
    }
    log(`Roles: ${Object.keys(testData.roles).join(', ')}`);
  }

  // ==================== TEST 1: CREATE MANAGER WITH PIN ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('TEST 1: ADMIN CREATES MANAGER WITH PIN');
  console.log('──────────────────────────────────────────────────────────\n');

  const timestamp = Date.now();
  const managerData = {
    name: 'Test Manager PIN',
    email: `mgr.pin.${timestamp}@test.com`,
    employeeCode: `MGR${timestamp.toString().slice(-6)}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }]
  };

  log('📝 Test 1.1: Create Manager with PIN');
  const createMgr = await api(testData.adminToken).post('/users', managerData);
  
  if (createMgr.data.success) {
    testData.testManager = createMgr.data.data;
    pass('Manager created', `ID: ${testData.testManager.id}`);
    passed++;
  } else {
    fail('Manager creation', createMgr.data.message);
    failed++;
  }

  log('📝 Test 1.2: Manager has default permissions (58)');
  if (testData.testManager?.permissionCount >= 50) {
    pass('Manager has permissions', `Count: ${testData.testManager.permissionCount}`);
    passed++;
  } else {
    fail('Manager permissions', `Expected ~58, got ${testData.testManager?.permissionCount || 0}`);
    failed++;
  }

  log('📝 Test 1.3: Manager can login with PIN');
  const mgrPinLogin = await api().post('/auth/login/pin', {
    employeeCode: managerData.employeeCode,
    pin: '1234',
    outletId: testData.outletId
  });

  if (mgrPinLogin.data.success) {
    testData.managerToken = mgrPinLogin.data.data.accessToken;
    pass('Manager PIN login', `Token received`);
    passed++;
  } else {
    fail('Manager PIN login', mgrPinLogin.data.message);
    failed++;
  }

  log('📝 Test 1.4: Manager can also login with email/password');
  const mgrEmailLogin = await api().post('/auth/login', {
    email: managerData.email,
    password: 'Manager@123'
  });

  if (mgrEmailLogin.data.success) {
    pass('Manager email login', 'Both methods work');
    passed++;
  } else {
    fail('Manager email login', mgrEmailLogin.data.message);
    failed++;
  }

  // ==================== TEST 2: CREATE CAPTAIN WITH PIN ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('TEST 2: ADMIN CREATES CAPTAIN WITH PIN');
  console.log('──────────────────────────────────────────────────────────\n');

  const captainData = {
    name: 'Test Captain PIN',
    employeeCode: `CAP${timestamp.toString().slice(-6)}`,
    pin: '5678',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  };

  log('📝 Test 2.1: Create Captain with PIN (no email/password)');
  const createCap = await api(testData.adminToken).post('/users', captainData);
  
  if (createCap.data.success) {
    testData.testCaptain = createCap.data.data;
    pass('Captain created', `ID: ${testData.testCaptain.id}`);
    passed++;
  } else {
    fail('Captain creation', createCap.data.message);
    failed++;
  }

  log('📝 Test 2.2: Captain has default permissions (22)');
  if (testData.testCaptain?.permissionCount >= 20) {
    pass('Captain has permissions', `Count: ${testData.testCaptain.permissionCount}`);
    passed++;
  } else {
    fail('Captain permissions', `Expected ~22, got ${testData.testCaptain?.permissionCount || 0}`);
    failed++;
  }

  log('📝 Test 2.3: Captain can login with PIN');
  const capPinLogin = await api().post('/auth/login/pin', {
    employeeCode: captainData.employeeCode,
    pin: '5678',
    outletId: testData.outletId
  });

  if (capPinLogin.data.success) {
    testData.captainToken = capPinLogin.data.data.accessToken;
    pass('Captain PIN login', 'Token received');
    passed++;
  } else {
    fail('Captain PIN login', capPinLogin.data.message);
    failed++;
  }

  // ==================== TEST 3: MANAGER CREATES CAPTAIN ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('TEST 3: MANAGER CREATES CAPTAIN WITH PIN');
  console.log('──────────────────────────────────────────────────────────\n');

  const captainByMgr = {
    name: 'Captain By Manager',
    employeeCode: `CBM${timestamp.toString().slice(-6)}`,
    pin: '9999',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  };

  log('📝 Test 3.1: Manager creates Captain');
  const mgrCreateCap = await api(testData.managerToken).post('/users', captainByMgr);
  
  if (mgrCreateCap.data.success) {
    pass('Manager created captain', `ID: ${mgrCreateCap.data.data.id}`);
    passed++;
    
    // Captain gets all default permissions
    log('📝 Test 3.2: Captain created by manager has permissions');
    if (mgrCreateCap.data.data.permissionCount >= 20) {
      pass('Captain has default permissions', `Count: ${mgrCreateCap.data.data.permissionCount}`);
      passed++;
    } else {
      fail('Captain permissions', `Expected ~22, got ${mgrCreateCap.data.data.permissionCount}`);
      failed++;
    }

    // Test PIN login for this captain
    log('📝 Test 3.3: Captain created by manager can login with PIN');
    const cbmLogin = await api().post('/auth/login/pin', {
      employeeCode: captainByMgr.employeeCode,
      pin: '9999',
      outletId: testData.outletId
    });

    if (cbmLogin.data.success) {
      pass('Captain PIN login works');
      passed++;
    } else {
      fail('Captain PIN login', cbmLogin.data.message);
      failed++;
    }

    // Cleanup
    await api(testData.adminToken).delete(`/users/${mgrCreateCap.data.data.id}`);
  } else {
    fail('Manager create captain', mgrCreateCap.data.message);
    failed++;
  }

  // ==================== TEST 4: GET /auth/me RETURNS PERMISSIONS ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('TEST 4: GET /auth/me RETURNS PERMISSIONS');
  console.log('──────────────────────────────────────────────────────────\n');

  log('📝 Test 4.1: Admin /auth/me');
  const adminMe = await api(testData.adminToken).get('/auth/me');
  if (adminMe.data.success && adminMe.data.data.permissions) {
    pass('Admin /auth/me has permissions', `Count: ${adminMe.data.data.permissions.length}`);
    passed++;
  } else {
    fail('Admin /auth/me', 'No permissions in response');
    failed++;
  }

  log('📝 Test 4.2: Manager /auth/me');
  const mgrMe = await api(testData.managerToken).get('/auth/me');
  if (mgrMe.data.success && mgrMe.data.data.permissions) {
    pass('Manager /auth/me has permissions', `Count: ${mgrMe.data.data.permissions.length}`);
    passed++;
  } else {
    fail('Manager /auth/me', 'No permissions in response');
    failed++;
  }

  log('📝 Test 4.3: Captain /auth/me');
  const capMe = await api(testData.captainToken).get('/auth/me');
  if (capMe.data.success && capMe.data.data.permissions) {
    pass('Captain /auth/me has permissions', `Count: ${capMe.data.data.permissions.length}`);
    passed++;
  } else {
    fail('Captain /auth/me', 'No permissions in response');
    failed++;
  }

  // ==================== TEST 5: PIN REQUIRED VALIDATION ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('TEST 5: PIN IS REQUIRED FOR USER CREATION');
  console.log('──────────────────────────────────────────────────────────\n');

  log('📝 Test 5.1: Create user without PIN fails');
  const noPinUser = await api(testData.adminToken).post('/users', {
    name: 'No PIN User',
    employeeCode: `NPU${timestamp.toString().slice(-6)}`,
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  });

  if (!noPinUser.data.success && noPinUser.data.message?.includes('PIN')) {
    pass('PIN required validation works', noPinUser.data.message);
    passed++;
  } else if (!noPinUser.data.success) {
    pass('User creation blocked', noPinUser.data.message);
    passed++;
  } else {
    fail('PIN validation', 'User created without PIN');
    failed++;
    // Cleanup if accidentally created
    if (noPinUser.data.data?.id) {
      await api(testData.adminToken).delete(`/users/${noPinUser.data.data.id}`);
    }
  }

  // ==================== TEST 6: PERMISSION INHERITANCE ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('TEST 6: MANAGER PERMISSION INHERITANCE');
  console.log('──────────────────────────────────────────────────────────\n');

  log('📝 Test 6.1: Manager can only grant permissions they have');
  const mgrPerms = await api(testData.managerToken).get('/permissions/my');
  if (mgrPerms.data.success) {
    const hasStaffPerms = mgrPerms.data.data.permissions.includes('STAFF_PERMISSIONS');
    const hasOrderCreate = mgrPerms.data.data.permissions.includes('ORDER_CREATE');
    
    if (hasStaffPerms && hasOrderCreate) {
      pass('Manager has STAFF_PERMISSIONS & ORDER_CREATE');
      passed++;
    } else {
      fail('Manager missing key permissions');
      failed++;
    }
  }

  log('📝 Test 6.2: Manager cannot grant OUTLET_SETTINGS');
  const grantBlock = await api(testData.managerToken).post(
    `/users/${testData.testCaptain.id}/permissions/grant`,
    { permissions: ['OUTLET_SETTINGS'] }
  );

  if (!grantBlock.data.success) {
    pass('Manager blocked from granting OUTLET_SETTINGS', grantBlock.data.message);
    passed++;
  } else {
    fail('Manager should not grant OUTLET_SETTINGS');
    failed++;
  }

  // ==================== CLEANUP ====================
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('CLEANUP');
  console.log('──────────────────────────────────────────────────────────\n');

  if (testData.testCaptain?.id) {
    await api(testData.adminToken).delete(`/users/${testData.testCaptain.id}`);
    log('Deleted test captain');
  }
  if (testData.testManager?.id) {
    await api(testData.adminToken).delete(`/users/${testData.testManager.id}`);
    log('Deleted test manager');
  }

  // ==================== RESULTS ====================
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TEST RESULTS');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   📊 Total:   ${passed + failed}`);
  console.log('══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
