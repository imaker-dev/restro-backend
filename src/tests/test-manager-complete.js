/**
 * Complete Manager Management Test Suite
 * Tests all login methods and CRUD operations for managers
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

const testData = {
  adminToken: null,
  outletId: null,
  roles: {},
  testManager: null,
  testCaptain: null,
  managerToken: null,
  captainToken: null,
};

const api = (token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers, validateStatus: () => true });
};

const log = (msg) => console.log(`   ${msg}`);
const pass = (test, detail = '') => { console.log(`   ✅ ${test}${detail ? ` - ${detail}` : ''}`); return true; };
const fail = (test, detail = '') => { console.log(`   ❌ ${test}${detail ? ` - ${detail}` : ''}`); return false; };

let passed = 0, failed = 0;

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('   COMPLETE MANAGER MANAGEMENT TEST SUITE');
  console.log('═'.repeat(70) + '\n');

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('🔧 SETUP\n' + '─'.repeat(70));

  const adminLogin = await api().post('/auth/login', {
    email: 'admin@restropos.com',
    password: 'admin123'
  });

  if (!adminLogin.data.success) {
    console.log('❌ Admin login failed. Is server running?');
    process.exit(1);
  }

  testData.adminToken = adminLogin.data.data.accessToken;
  log('Admin logged in');

  // Get outlet
  const outlets = await api(testData.adminToken).get('/outlets');
  if (outlets.data.data?.length > 0) {
    testData.outletId = outlets.data.data[0].id;
    log(`Using outlet: ${outlets.data.data[0].name} (ID: ${testData.outletId})`);
  }

  // Get roles
  const roles = await api(testData.adminToken).get('/users/roles');
  for (const role of roles.data.data || []) {
    testData.roles[role.slug] = role.id;
  }
  log(`Roles loaded: ${Object.keys(testData.roles).join(', ')}`);

  const timestamp = Date.now();

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: ADMIN CREATES MANAGER
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 1: ADMIN CREATES MANAGER\n' + '─'.repeat(70));

  const managerData = {
    name: 'Test Manager Complete',
    email: `mgr.complete.${timestamp}@test.com`,
    employeeCode: `TMC${timestamp.toString().slice(-6)}`,
    password: 'Manager@123',
    pin: '1234',
    phone: '+91-9876543210',
    isActive: true,
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }]
  };

  log('Creating manager with email, password, and PIN...');
  const createMgr = await api(testData.adminToken).post('/users', managerData);

  if (createMgr.data.success) {
    testData.testManager = createMgr.data.data;
    pass('Manager created', `ID: ${testData.testManager.id}, Employee: ${testData.testManager.employeeCode}`);
    passed++;

    // Verify response structure
    const mgr = createMgr.data.data;
    if (mgr.id && mgr.name && mgr.employeeCode && mgr.roles && mgr.permissions && mgr.permissionCount) {
      pass('Response has all required fields');
      passed++;
    } else {
      fail('Response missing fields');
      failed++;
    }

    if (mgr.permissionCount === 58) {
      pass('Manager has 58 default permissions');
      passed++;
    } else {
      fail('Permission count mismatch', `Expected 58, got ${mgr.permissionCount}`);
      failed++;
    }
  } else {
    fail('Manager creation', createMgr.data.message);
    failed += 3;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: MANAGER LOGIN WITH EMAIL/PASSWORD
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 2: MANAGER LOGIN WITH EMAIL/PASSWORD\n' + '─'.repeat(70));

  log('Manager logging in with email and password...');
  const mgrEmailLogin = await api().post('/auth/login', {
    email: managerData.email,
    password: 'Manager@123'
  });

  if (mgrEmailLogin.data.success) {
    testData.managerToken = mgrEmailLogin.data.data.accessToken;
    pass('Manager email/password login successful');
    passed++;

    // Verify response structure
    const res = mgrEmailLogin.data.data;
    if (res.accessToken && res.refreshToken && res.user) {
      pass('Login response has tokens and user');
      passed++;
    } else {
      fail('Login response missing fields');
      failed++;
    }

    if (res.user.roles && res.user.roles.length > 0) {
      pass('User has roles in response', res.user.roles.join(', '));
      passed++;
    } else {
      fail('User missing roles');
      failed++;
    }
  } else {
    fail('Manager email login', mgrEmailLogin.data.message);
    failed += 3;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: MANAGER LOGIN WITH PIN
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 3: MANAGER LOGIN WITH PIN\n' + '─'.repeat(70));

  log('Manager logging in with employee code and PIN...');
  const mgrPinLogin = await api().post('/auth/login/pin', {
    employeeCode: managerData.employeeCode,
    pin: '1234',
    outletId: testData.outletId
  });

  if (mgrPinLogin.data.success) {
    pass('Manager PIN login successful');
    passed++;

    const res = mgrPinLogin.data.data;
    if (res.accessToken && res.user) {
      pass('PIN login has token and user');
      passed++;
    } else {
      fail('PIN login response missing fields');
      failed++;
    }
  } else {
    fail('Manager PIN login', mgrPinLogin.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: MANAGER GET PROFILE (/auth/me)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 4: MANAGER GET PROFILE\n' + '─'.repeat(70));

  log('Getting manager profile...');
  const mgrProfile = await api(testData.managerToken).get('/auth/me');

  if (mgrProfile.data.success) {
    pass('Manager profile retrieved');
    passed++;

    const profile = mgrProfile.data.data;
    console.log(`   📄 Profile: ${profile.name} (${profile.employeeCode})`);
    console.log(`   📄 Roles: ${profile.roles?.join(', ') || 'none'}`);
    console.log(`   📄 Permissions: ${profile.permissions?.length || 0}`);

    if (profile.permissions && profile.permissions.length >= 50) {
      pass('Profile has permissions', `${profile.permissions.length} permissions`);
      passed++;
    } else {
      fail('Profile missing permissions');
      failed++;
    }
  } else {
    fail('Get profile', mgrProfile.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: ADMIN CREATES CAPTAIN
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 5: ADMIN CREATES CAPTAIN\n' + '─'.repeat(70));

  const captainData = {
    name: 'Test Captain Complete',
    email: `cap.complete.${timestamp}@test.com`,
    employeeCode: `TCC${timestamp.toString().slice(-6)}`,
    password: 'Captain@123',
    pin: '5678',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  };

  log('Creating captain with email, password, and PIN...');
  const createCap = await api(testData.adminToken).post('/users', captainData);

  if (createCap.data.success) {
    testData.testCaptain = createCap.data.data;
    pass('Captain created', `ID: ${testData.testCaptain.id}`);
    passed++;

    if (createCap.data.data.permissionCount === 22) {
      pass('Captain has 22 default permissions');
      passed++;
    } else {
      fail('Captain permission count', `Expected 22, got ${createCap.data.data.permissionCount}`);
      failed++;
    }
  } else {
    fail('Captain creation', createCap.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: CAPTAIN LOGIN WITH EMAIL/PASSWORD
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 6: CAPTAIN LOGIN WITH EMAIL/PASSWORD\n' + '─'.repeat(70));

  log('Captain logging in with email and password...');
  const capEmailLogin = await api().post('/auth/login', {
    email: captainData.email,
    password: 'Captain@123'
  });

  if (capEmailLogin.data.success) {
    testData.captainToken = capEmailLogin.data.data.accessToken;
    pass('Captain email/password login successful');
    passed++;
  } else {
    fail('Captain email login', capEmailLogin.data.message);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 7: CAPTAIN LOGIN WITH PIN
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 7: CAPTAIN LOGIN WITH PIN\n' + '─'.repeat(70));

  log('Captain logging in with employee code and PIN...');
  const capPinLogin = await api().post('/auth/login/pin', {
    employeeCode: captainData.employeeCode,
    pin: '5678',
    outletId: testData.outletId
  });

  if (capPinLogin.data.success) {
    pass('Captain PIN login successful');
    passed++;
  } else {
    fail('Captain PIN login', capPinLogin.data.message);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 8: MANAGER CREATES CAPTAIN
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 8: MANAGER CREATES CAPTAIN\n' + '─'.repeat(70));

  const captainByMgr = {
    name: 'Captain By Manager',
    employeeCode: `CBM${timestamp.toString().slice(-6)}`,
    pin: '9999',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  };

  log('Manager creating captain...');
  const mgrCreateCap = await api(testData.managerToken).post('/users', captainByMgr);

  if (mgrCreateCap.data.success) {
    pass('Manager created captain', `ID: ${mgrCreateCap.data.data.id}`);
    passed++;

    // Verify captain can login with PIN
    const cbmLogin = await api().post('/auth/login/pin', {
      employeeCode: captainByMgr.employeeCode,
      pin: '9999',
      outletId: testData.outletId
    });

    if (cbmLogin.data.success) {
      pass('Captain created by manager can login with PIN');
      passed++;
    } else {
      fail('Captain login', cbmLogin.data.message);
      failed++;
    }

    // Cleanup this captain
    await api(testData.adminToken).delete(`/users/${mgrCreateCap.data.data.id}`);
    log('Cleaned up captain created by manager');
  } else {
    fail('Manager create captain', mgrCreateCap.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 9: MANAGER CANNOT CREATE MANAGER
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 9: MANAGER CANNOT CREATE MANAGER\n' + '─'.repeat(70));

  log('Manager trying to create another manager (should fail)...');
  const mgrCreateMgr = await api(testData.managerToken).post('/users', {
    name: 'Illegal Manager',
    email: `illegal.mgr.${timestamp}@test.com`,
    employeeCode: `ILM${timestamp.toString().slice(-6)}`,
    pin: '1111',
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }]
  });

  if (!mgrCreateMgr.data.success) {
    pass('Manager blocked from creating manager', mgrCreateMgr.data.message);
    passed++;
  } else {
    fail('Manager should not create manager');
    failed++;
    // Cleanup if created
    if (mgrCreateMgr.data.data?.id) {
      await api(testData.adminToken).delete(`/users/${mgrCreateMgr.data.data.id}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 10: UPDATE MANAGER
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 10: UPDATE MANAGER\n' + '─'.repeat(70));

  log('Admin updating manager...');
  const updateMgr = await api(testData.adminToken).put(`/users/${testData.testManager.id}`, {
    name: 'Updated Manager Name',
    phone: '+91-1234567890'
  });

  if (updateMgr.data.success) {
    pass('Manager updated');
    passed++;

    if (updateMgr.data.data.name === 'Updated Manager Name') {
      pass('Name updated correctly');
      passed++;
    } else {
      fail('Name not updated');
      failed++;
    }
  } else {
    fail('Manager update', updateMgr.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 11: LIST MANAGERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 11: LIST MANAGERS\n' + '─'.repeat(70));

  log('Listing users with manager role...');
  const listMgrs = await api(testData.adminToken).get(`/users?roleId=${testData.roles.manager}`);

  if (listMgrs.data.success) {
    pass('List managers successful', `Found ${listMgrs.data.data.length} managers`);
    passed++;

    // Check pagination info
    if (listMgrs.data.pagination) {
      pass('Response has pagination info');
      passed++;
    } else {
      fail('Missing pagination');
      failed++;
    }
  } else {
    fail('List managers', listMgrs.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 12: GET MANAGER DETAILS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 12: GET MANAGER DETAILS\n' + '─'.repeat(70));

  log('Getting manager details...');
  const getMgr = await api(testData.adminToken).get(`/users/${testData.testManager.id}`);

  if (getMgr.data.success) {
    pass('Get manager details');
    passed++;

    const mgr = getMgr.data.data;
    console.log(`   📄 ID: ${mgr.id}`);
    console.log(`   📄 Name: ${mgr.name}`);
    console.log(`   📄 Employee Code: ${mgr.employeeCode}`);
    console.log(`   📄 Roles: ${mgr.roles?.map(r => r.slug).join(', ')}`);
    console.log(`   📄 Permissions: ${mgr.permissionCount}`);

    if (mgr.permissions && mgr.permissionCount) {
      pass('Details include permissions');
      passed++;
    } else {
      fail('Details missing permissions');
      failed++;
    }
  } else {
    fail('Get manager details', getMgr.data.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 13: MANAGER PERMISSION INHERITANCE
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 13: MANAGER PERMISSION INHERITANCE\n' + '─'.repeat(70));

  log('Manager trying to grant permission they have...');
  const grantOwn = await api(testData.managerToken).post(
    `/users/${testData.testCaptain.id}/permissions/grant`,
    { permissions: ['ORDER_CREATE'], reason: 'Test grant' }
  );

  if (grantOwn.data.success || grantOwn.data.message?.includes('already')) {
    pass('Manager can grant permissions they have');
    passed++;
  } else {
    fail('Manager grant own permission', grantOwn.data.message);
    failed++;
  }

  log('Manager trying to grant permission they do NOT have...');
  const grantOther = await api(testData.managerToken).post(
    `/users/${testData.testCaptain.id}/permissions/grant`,
    { permissions: ['OUTLET_SETTINGS'], reason: 'Test grant' }
  );

  if (!grantOther.data.success) {
    pass('Manager blocked from granting OUTLET_SETTINGS', grantOther.data.message);
    passed++;
  } else {
    fail('Manager should not grant OUTLET_SETTINGS');
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n🧹 CLEANUP\n' + '─'.repeat(70));

  if (testData.testCaptain?.id) {
    await api(testData.adminToken).delete(`/users/${testData.testCaptain.id}`);
    log('Deleted test captain');
  }

  if (testData.testManager?.id) {
    await api(testData.adminToken).delete(`/users/${testData.testManager.id}`);
    log('Deleted test manager');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('   TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   📊 Total:   ${passed + failed}`);
  console.log(`   📈 Rate:    ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('═'.repeat(70) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
