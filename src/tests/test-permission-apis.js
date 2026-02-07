/**
 * Complete Permission API Test Suite
 * Tests all permission endpoints with all 58 manager permissions
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

// All 58 Manager Permissions
const MANAGER_PERMISSIONS = [
  // Tables (6)
  'TABLE_VIEW', 'TABLE_CREATE', 'TABLE_EDIT', 'TABLE_DELETE', 'TABLE_MERGE', 'TABLE_TRANSFER',
  // Orders (6)
  'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY', 'ORDER_CANCEL', 'ORDER_VOID', 'ORDER_REOPEN',
  // KOT (4)
  'KOT_SEND', 'KOT_MODIFY', 'KOT_CANCEL', 'KOT_REPRINT',
  // Billing (4)
  'BILL_VIEW', 'BILL_GENERATE', 'BILL_REPRINT', 'BILL_CANCEL',
  // Payment (3)
  'PAYMENT_COLLECT', 'PAYMENT_REFUND', 'PAYMENT_SPLIT',
  // Discounts & Charges (6)
  'DISCOUNT_APPLY', 'DISCOUNT_REMOVE', 'DISCOUNT_CUSTOM', 'TAX_MODIFY', 'SERVICE_CHARGE_MODIFY', 'TIP_ADD',
  // Items (7)
  'ITEM_VIEW', 'ITEM_CREATE', 'ITEM_EDIT', 'ITEM_DELETE', 'ITEM_CANCEL', 'ITEM_PRICING', 'ITEM_AVAILABILITY',
  // Categories (4)
  'CATEGORY_VIEW', 'CATEGORY_CREATE', 'CATEGORY_EDIT', 'CATEGORY_DELETE',
  // Inventory (4)
  'INVENTORY_VIEW', 'INVENTORY_EDIT', 'INVENTORY_ADJUST', 'INVENTORY_TRANSFER',
  // Staff (5)
  'STAFF_VIEW', 'STAFF_CREATE', 'STAFF_EDIT', 'STAFF_DELETE', 'STAFF_PERMISSIONS',
  // Reports (5)
  'REPORT_VIEW', 'REPORT_SALES', 'REPORT_INVENTORY', 'REPORT_STAFF', 'REPORT_EXPORT',
  // Layout (2)
  'FLOOR_VIEW', 'SECTION_VIEW',
  // Printers (1)
  'PRINTER_VIEW',
  // Settings (1)
  'SETTINGS_VIEW',
];

const CAPTAIN_PERMISSIONS = [
  'TABLE_VIEW', 'TABLE_MERGE', 'TABLE_TRANSFER',
  'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY',
  'KOT_SEND', 'KOT_MODIFY', 'KOT_REPRINT',
  'BILL_VIEW', 'BILL_GENERATE', 'BILL_REPRINT',
  'PAYMENT_COLLECT', 'PAYMENT_SPLIT',
  'DISCOUNT_APPLY', 'TIP_ADD',
  'ITEM_VIEW', 'ITEM_CANCEL',
  'CATEGORY_VIEW',
  'FLOOR_VIEW', 'SECTION_VIEW',
  'PRINTER_VIEW',
];

const testData = {
  adminToken: null,
  managerToken: null,
  captainToken: null,
  outletId: null,
  roles: {},
  testManager: null,
  testCaptain: null,
};

const api = (token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers, validateStatus: () => true });
};

const pass = (test, detail = '') => { console.log(`   ✅ ${test}${detail ? ` - ${detail}` : ''}`); return true; };
const fail = (test, detail = '') => { console.log(`   ❌ ${test}${detail ? ` - ${detail}` : ''}`); return false; };
const log = (msg) => console.log(`   ${msg}`);

let passed = 0, failed = 0;

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('   COMPLETE PERMISSION API TEST SUITE');
  console.log('═'.repeat(70) + '\n');

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('🔧 SETUP\n' + '─'.repeat(70));

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
  log('Admin logged in');

  // Get outlet & roles
  const outlets = await api(testData.adminToken).get('/outlets');
  if (outlets.data.data?.length > 0) {
    testData.outletId = outlets.data.data[0].id;
    log(`Outlet: ${outlets.data.data[0].name} (ID: ${testData.outletId})`);
  }

  const roles = await api(testData.adminToken).get('/users/roles');
  for (const role of roles.data.data || []) {
    testData.roles[role.slug] = role.id;
  }
  log(`Roles: ${Object.keys(testData.roles).join(', ')}`);

  // Create test manager
  const timestamp = Date.now();
  const mgrRes = await api(testData.adminToken).post('/users', {
    name: 'Permission Test Manager',
    email: `perm.mgr.${timestamp}@test.com`,
    employeeCode: `PMG${timestamp.toString().slice(-6)}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }]
  });

  if (mgrRes.data.success) {
    testData.testManager = mgrRes.data.data;
    log(`Created test manager: ${testData.testManager.employeeCode}`);
  }

  // Manager login
  const mgrLogin = await api().post('/auth/login/pin', {
    employeeCode: testData.testManager.employeeCode,
    pin: '1234',
    outletId: testData.outletId
  });
  testData.managerToken = mgrLogin.data.data.accessToken;
  log('Manager logged in');

  // Create test captain
  const capRes = await api(testData.adminToken).post('/users', {
    name: 'Permission Test Captain',
    employeeCode: `PCP${timestamp.toString().slice(-6)}`,
    pin: '5678',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  });

  if (capRes.data.success) {
    testData.testCaptain = capRes.data.data;
    log(`Created test captain: ${testData.testCaptain.employeeCode}`);
  }

  // Captain login
  const capLogin = await api().post('/auth/login/pin', {
    employeeCode: testData.testCaptain.employeeCode,
    pin: '5678',
    outletId: testData.outletId
  });
  testData.captainToken = capLogin.data.data.accessToken;
  log('Captain logged in');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: GET ALL PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 1: GET /permissions - All Available Permissions\n' + '─'.repeat(70));

  const allPerms = await api(testData.adminToken).get('/permissions');
  
  if (allPerms.data.success) {
    pass('GET /permissions successful'); passed++;
    
    const data = allPerms.data.data;
    if (data.permissions && Array.isArray(data.permissions)) {
      pass('Response has "permissions" array', `${data.permissions.length} permissions`); passed++;
    } else { fail('Missing "permissions" array'); failed++; }

    if (data.grouped && typeof data.grouped === 'object') {
      const categories = Object.keys(data.grouped);
      pass('Response has "grouped" object', categories.join(', ')); passed++;
    } else { fail('Missing "grouped"'); failed++; }

    // Verify all 58 manager permissions exist
    const slugs = data.permissions.map(p => p.slug);
    const missing = MANAGER_PERMISSIONS.filter(p => !slugs.includes(p));
    if (missing.length === 0) {
      pass('All 58 manager permissions exist in system'); passed++;
    } else {
      fail('Missing permissions', missing.join(', ')); failed++;
    }
  } else {
    fail('GET /permissions', allPerms.data.message); failed += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: GET MY PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 2: GET /permissions/my - Current User Permissions\n' + '─'.repeat(70));

  // Admin permissions
  log('Testing admin permissions...');
  const adminPerms = await api(testData.adminToken).get('/permissions/my');
  if (adminPerms.data.success) {
    if (adminPerms.data.data.isSuperuser === true) {
      pass('Admin is superuser'); passed++;
    } else { fail('Admin should be superuser'); failed++; }
  } else { fail('Admin GET /permissions/my'); failed++; }

  // Manager permissions
  log('Testing manager permissions...');
  const mgrPerms = await api(testData.managerToken).get('/permissions/my');
  if (mgrPerms.data.success) {
    pass('Manager GET /permissions/my successful'); passed++;
    
    const perms = mgrPerms.data.data.permissions;
    if (perms.length === 58) {
      pass('Manager has exactly 58 permissions'); passed++;
    } else {
      fail('Manager permission count', `Expected 58, got ${perms.length}`); failed++;
    }

    // Verify all manager permissions
    const hasAll = MANAGER_PERMISSIONS.every(p => perms.includes(p));
    if (hasAll) {
      pass('Manager has ALL required permissions'); passed++;
    } else {
      const missing = MANAGER_PERMISSIONS.filter(p => !perms.includes(p));
      fail('Manager missing permissions', missing.slice(0, 5).join(', ')); failed++;
    }
  } else { fail('Manager GET /permissions/my'); failed += 3; }

  // Captain permissions
  log('Testing captain permissions...');
  const capPerms = await api(testData.captainToken).get('/permissions/my');
  if (capPerms.data.success) {
    pass('Captain GET /permissions/my successful'); passed++;
    
    const perms = capPerms.data.data.permissions;
    if (perms.length === 22) {
      pass('Captain has exactly 22 permissions'); passed++;
    } else {
      fail('Captain permission count', `Expected 22, got ${perms.length}`); failed++;
    }
  } else { fail('Captain GET /permissions/my'); failed += 2; }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: GET GRANTABLE PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 3: GET /permissions/grantable\n' + '─'.repeat(70));

  const mgrGrantable = await api(testData.managerToken).get('/permissions/grantable');
  if (mgrGrantable.data.success) {
    pass('GET /permissions/grantable successful'); passed++;
    
    const grantable = mgrGrantable.data.data.permissions;
    if (grantable.length === 58) {
      pass('Manager can grant 58 permissions'); passed++;
    } else {
      fail('Grantable count', `Expected 58, got ${grantable.length}`); failed++;
    }
  } else { fail('GET /permissions/grantable'); failed += 2; }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: CHECK PERMISSION
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 4: POST /permissions/check\n' + '─'.repeat(70));

  // Single permission check
  log('Testing single permission check...');
  const singleCheck = await api(testData.managerToken).post('/permissions/check', {
    permission: 'ORDER_CREATE'
  });
  if (singleCheck.data.success && singleCheck.data.data.granted === true) {
    pass('Single permission check: ORDER_CREATE = true'); passed++;
  } else { fail('Single permission check'); failed++; }

  // Multiple permission check
  log('Testing multiple permission check...');
  const multiCheck = await api(testData.managerToken).post('/permissions/check', {
    permissions: ['ORDER_CREATE', 'BILL_GENERATE', 'OUTLET_SETTINGS']
  });
  if (multiCheck.data.success) {
    const results = multiCheck.data.data.permissions;
    if (results.ORDER_CREATE === true && results.BILL_GENERATE === true && results.OUTLET_SETTINGS === false) {
      pass('Multiple permission check correct'); passed++;
    } else {
      fail('Multiple permission check values incorrect'); failed++;
    }
  } else { fail('Multiple permission check'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: GET ROLE PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 5: GET /permissions/roles/:id\n' + '─'.repeat(70));

  const rolePerms = await api(testData.adminToken).get(`/permissions/roles/${testData.roles.manager}`);
  if (rolePerms.data.success) {
    pass('GET role permissions successful'); passed++;
    
    const perms = rolePerms.data.data.permissions || rolePerms.data.data;
    if (Array.isArray(perms) && perms.length === 58) {
      pass('Manager role has 58 permissions'); passed++;
    } else {
      fail('Role permission count', `Expected 58`); failed++;
    }
  } else { fail('GET /permissions/roles/:id'); failed += 2; }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: GET USER PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 6: GET /users/:id/permissions\n' + '─'.repeat(70));

  const userPerms = await api(testData.adminToken).get(`/users/${testData.testCaptain.id}/permissions`);
  if (userPerms.data.success) {
    pass('GET user permissions successful'); passed++;
    
    if (userPerms.data.data.permissions.length === 22) {
      pass('Captain user has 22 permissions'); passed++;
    } else {
      fail('User permission count'); failed++;
    }
  } else { fail('GET /users/:id/permissions'); failed += 2; }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 7: GRANT PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 7: POST /users/:id/permissions/grant\n' + '─'.repeat(70));

  // Manager grants permission they have
  log('Manager grants ORDER_CANCEL to captain...');
  const grant1 = await api(testData.managerToken).post(
    `/users/${testData.testCaptain.id}/permissions/grant`,
    { permissions: ['ORDER_CANCEL'], reason: 'Testing grant API' }
  );
  if (grant1.data.success) {
    pass('Manager granted ORDER_CANCEL to captain'); passed++;
  } else if (grant1.data.message?.includes('already')) {
    pass('Captain already has permission (or from role)'); passed++;
  } else {
    fail('Grant permission', grant1.data.message); failed++;
  }

  // Manager tries to grant permission they DON'T have
  log('Manager tries to grant OUTLET_SETTINGS (should fail)...');
  const grant2 = await api(testData.managerToken).post(
    `/users/${testData.testCaptain.id}/permissions/grant`,
    { permissions: ['OUTLET_SETTINGS'], reason: 'This should fail' }
  );
  if (!grant2.data.success && grant2.data.message?.includes('OUTLET_SETTINGS')) {
    pass('Manager blocked from granting OUTLET_SETTINGS'); passed++;
  } else {
    fail('Should block granting OUTLET_SETTINGS'); failed++;
  }

  // Admin can grant any permission
  log('Admin grants OUTLET_SETTINGS to captain...');
  const grant3 = await api(testData.adminToken).post(
    `/users/${testData.testCaptain.id}/permissions/grant`,
    { permissions: ['OUTLET_SETTINGS'], reason: 'Admin grant test' }
  );
  if (grant3.data.success) {
    pass('Admin granted OUTLET_SETTINGS to captain'); passed++;
  } else {
    fail('Admin grant', grant3.data.message); failed++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 8: REVOKE PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 8: POST /users/:id/permissions/revoke\n' + '─'.repeat(70));

  // Admin revokes permission
  log('Admin revokes OUTLET_SETTINGS from captain...');
  const revoke1 = await api(testData.adminToken).post(
    `/users/${testData.testCaptain.id}/permissions/revoke`,
    { permissions: ['OUTLET_SETTINGS'], reason: 'Revoking test permission' }
  );
  if (revoke1.data.success) {
    pass('Admin revoked OUTLET_SETTINGS'); passed++;
  } else {
    fail('Admin revoke', revoke1.data.message); failed++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 9: SET USER PERMISSIONS (REPLACE ALL)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 9: PUT /users/:id/permissions\n' + '─'.repeat(70));

  // Admin sets specific permissions
  log('Admin sets custom permissions for captain...');
  const setPerms = await api(testData.adminToken).put(
    `/users/${testData.testCaptain.id}/permissions`,
    { 
      permissions: ['TABLE_VIEW', 'ORDER_VIEW', 'BILL_VIEW'],
      reason: 'Setting minimal permissions for test'
    }
  );
  if (setPerms.data.success) {
    pass('Admin set custom permissions'); passed++;
  } else {
    fail('Set permissions', setPerms.data.message); failed++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 10: GET PERMISSION HISTORY
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 10: GET /users/:id/permissions/history\n' + '─'.repeat(70));

  const history = await api(testData.adminToken).get(`/users/${testData.testCaptain.id}/permissions/history`);
  if (history.data.success) {
    pass('GET permission history successful'); passed++;
    
    if (Array.isArray(history.data.data) && history.data.data.length > 0) {
      pass('History has records', `${history.data.data.length} entries`); passed++;
      
      const entry = history.data.data[0];
      if (entry.action && entry.changed_by && entry.created_at) {
        pass('History entry has required fields'); passed++;
      } else {
        fail('History entry missing fields', JSON.stringify(Object.keys(entry))); failed++;
      }
    } else {
      fail('No history records found'); failed += 2;
    }
  } else { fail('GET /users/:id/permissions/history'); failed += 3; }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 11: PERMISSION CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 TEST 11: Permission Categories Verification\n' + '─'.repeat(70));

  const categories = {
    'Tables': ['TABLE_VIEW', 'TABLE_CREATE', 'TABLE_EDIT', 'TABLE_DELETE', 'TABLE_MERGE', 'TABLE_TRANSFER'],
    'Orders': ['ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY', 'ORDER_CANCEL', 'ORDER_VOID', 'ORDER_REOPEN'],
    'KOT': ['KOT_SEND', 'KOT_MODIFY', 'KOT_CANCEL', 'KOT_REPRINT'],
    'Billing': ['BILL_VIEW', 'BILL_GENERATE', 'BILL_REPRINT', 'BILL_CANCEL'],
    'Payment': ['PAYMENT_COLLECT', 'PAYMENT_REFUND', 'PAYMENT_SPLIT'],
    'Staff': ['STAFF_VIEW', 'STAFF_CREATE', 'STAFF_EDIT', 'STAFF_DELETE', 'STAFF_PERMISSIONS'],
  };

  for (const [cat, perms] of Object.entries(categories)) {
    const mgrHasAll = perms.every(p => mgrPerms.data.data.permissions.includes(p));
    if (mgrHasAll) {
      pass(`Manager has all ${cat} permissions (${perms.length})`); passed++;
    } else {
      fail(`Manager missing ${cat} permissions`); failed++;
    }
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
  console.log('   PERMISSION API TEST RESULTS');
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
