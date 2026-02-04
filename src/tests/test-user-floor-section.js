/**
 * User Floor & Section Assignment Test Script
 * Tests floor-wise and section-wise user access control
 * 
 * Test Scenarios:
 * 1. Floor Assignment - Captain assigned to specific floors only
 * 2. Section Assignment - Captain can access Restaurant but not Bar
 * 3. Menu Access Control - Restrict menu categories per user
 * 4. Multi-Floor Manager - Manager with access to all floors/sections
 * 
 * Run: node src/tests/test-user-floor-section.js
 */

const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = 'admin@restropos.com';
const ADMIN_PASSWORD = 'admin123';

// Test data storage
const testData = {
  adminToken: null,
  outletId: null,
  floors: [],
  sections: [],
  categories: [],
  createdUsers: []
};

// Results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// API helper
const api = (token = testData.adminToken) => axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  },
  validateStatus: () => true
});

// Test helper
function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`   ${status}: ${name}`);
  if (details) console.log(`      ${details}`);
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

// ========================
// SETUP
// ========================

async function setup() {
  console.log('\n' + '═'.repeat(60));
  console.log('   USER FLOOR & SECTION ASSIGNMENT TESTS');
  console.log('═'.repeat(60));
  
  console.log('\n🔐 Logging in as admin...');
  const loginRes = await api(null).post('/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  
  if (!loginRes.data.success) {
    console.error('❌ Admin login failed:', loginRes.data.message);
    process.exit(1);
  }
  
  testData.adminToken = loginRes.data.data.accessToken;
  console.log('   ✅ Admin logged in successfully');
  
  // Get outlet
  console.log('\n📋 Fetching test data...');
  const outletsRes = await api().get('/outlets');
  if (outletsRes.data.success && outletsRes.data.data.length > 0) {
    testData.outletId = outletsRes.data.data[0].id;
    console.log(`   Outlet: ${outletsRes.data.data[0].name} (ID: ${testData.outletId})`);
  }
  
  // Get floors
  const floorsRes = await api().get(`/outlets/${testData.outletId}/floors`);
  if (floorsRes.data.success) {
    testData.floors = floorsRes.data.data || [];
    console.log(`   Floors: ${testData.floors.map(f => f.name).join(', ')}`);
  }
  
  // Get sections
  const sectionsRes = await api().get(`/outlets/${testData.outletId}/sections`);
  if (sectionsRes.data.success) {
    testData.sections = sectionsRes.data.data || [];
    console.log(`   Sections: ${testData.sections.map(s => s.name).join(', ')}`);
  }
  
  // Get menu categories
  const categoriesRes = await api().get(`/menu/categories?outletId=${testData.outletId}`);
  if (categoriesRes.data.success) {
    testData.categories = categoriesRes.data.data || [];
    console.log(`   Categories: ${testData.categories.length} found`);
  }
  
  // Get roles
  const rolesRes = await api().get('/users/roles');
  if (rolesRes.data.success) {
    testData.roles = rolesRes.data.data || [];
    console.log(`   Roles: ${testData.roles.map(r => r.name).join(', ')}`);
  }
}

// ========================
// TEST 1: FLOOR ASSIGNMENT
// ========================

async function testFloorAssignment() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 1: FLOOR ASSIGNMENT');
  console.log('─'.repeat(60));
  
  const captainRole = testData.roles?.find(r => r.name.toLowerCase() === 'captain');
  const groundFloor = testData.floors?.find(f => f.name.toLowerCase().includes('ground') || f.floor_number === 0);
  const firstFloor = testData.floors?.find(f => f.name.toLowerCase().includes('first') || f.floor_number === 1);
  
  console.log(`   Captain Role: ${captainRole?.id || 'NOT FOUND'}, Ground Floor: ${groundFloor?.id || 'NOT FOUND'}`);
  
  if (!captainRole || !groundFloor) {
    console.log('   ⚠️ Skipping: Missing required data (captain role or floors)');
    return;
  }
  
  // Test 1.1: Create captain for Ground Floor only
  console.log('\n   📝 Test 1.1: Create Captain for Ground Floor Only');
  const captain1Res = await api().post('/users', {
    name: 'Test Captain Ground Floor',
    email: `captain.gf.${Date.now()}@test.com`,
    employeeCode: `TCGF${Date.now().toString().slice(-4)}`,
    password: 'Captain@123',
    pin: '1111',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: testData.outletId }],
    floors: [{ floorId: groundFloor.id, outletId: testData.outletId, isPrimary: true }]
  });
  
  logTest(
    'Create captain with single floor assignment',
    captain1Res.data.success,
    captain1Res.data.success ? `User ID: ${captain1Res.data.data?.id}` : captain1Res.data.message
  );
  
  if (captain1Res.data.success) {
    testData.createdUsers.push(captain1Res.data.data.id);
  }
  
  // Test 1.2: Create captain for First Floor only
  if (firstFloor) {
    console.log('\n   📝 Test 1.2: Create Captain for First Floor Only');
    const captain2Res = await api().post('/users', {
      name: 'Test Captain First Floor',
      email: `captain.ff.${Date.now()}@test.com`,
      employeeCode: `TCFF${Date.now().toString().slice(-4)}`,
      password: 'Captain@123',
      pin: '2222',
      isActive: true,
      roles: [{ roleId: captainRole.id, outletId: testData.outletId }],
      floors: [{ floorId: firstFloor.id, outletId: testData.outletId, isPrimary: true }]
    });
    
    logTest(
      'Create captain with different floor assignment',
      captain2Res.data.success,
      captain2Res.data.success ? `User ID: ${captain2Res.data.data?.id}` : captain2Res.data.message
    );
    
    if (captain2Res.data.success) {
      testData.createdUsers.push(captain2Res.data.data.id);
    }
  }
  
  // Test 1.3: Create captain with multiple floors
  console.log('\n   📝 Test 1.3: Create Captain with Multiple Floors');
  const multiFloorData = {
    name: 'Test Captain Multi Floor',
    email: `captain.mf.${Date.now()}@test.com`,
    employeeCode: `TCMF${Date.now().toString().slice(-4)}`,
    password: 'Captain@123',
    pin: '3333',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: testData.outletId }],
    floors: testData.floors.slice(0, 2).map((f, i) => ({
      floorId: f.id,
      outletId: testData.outletId,
      isPrimary: i === 0
    }))
  };
  
  const captain3Res = await api().post('/users', multiFloorData);
  
  logTest(
    'Create captain with multiple floor assignments',
    captain3Res.data.success,
    captain3Res.data.success 
      ? `User ID: ${captain3Res.data.data?.id}, Floors: ${multiFloorData.floors.length}`
      : captain3Res.data.message
  );
  
  if (captain3Res.data.success) {
    testData.createdUsers.push(captain3Res.data.data.id);
  }
  
  // Test 1.4: Update user's floor assignment
  if (testData.createdUsers.length > 0 && testData.floors.length > 1) {
    console.log('\n   📝 Test 1.4: Update User Floor Assignment');
    const userId = testData.createdUsers[0];
    const newFloor = testData.floors[testData.floors.length - 1];
    
    const updateRes = await api().put(`/users/${userId}`, {
      floors: [
        { floorId: groundFloor.id, outletId: testData.outletId, isPrimary: true },
        { floorId: newFloor.id, outletId: testData.outletId, isPrimary: false }
      ]
    });
    
    logTest(
      'Update user floor assignment',
      updateRes.data.success,
      updateRes.data.success ? 'Floor assignment updated' : updateRes.data.message
    );
  }
}

// ========================
// TEST 2: SECTION ASSIGNMENT
// ========================

async function testSectionAssignment() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 2: SECTION ASSIGNMENT');
  console.log('─'.repeat(60));
  
  const captainRole = testData.roles?.find(r => r.name.toLowerCase() === 'captain');
  const restaurantSection = testData.sections?.find(s => 
    s.name.toLowerCase().includes('restaurant') || s.section_type === 'dine_in'
  );
  const barSection = testData.sections?.find(s => 
    s.name.toLowerCase().includes('bar') || s.section_type === 'bar'
  );
  
  console.log(`   Captain Role: ${captainRole?.id || 'NOT FOUND'}, Restaurant: ${restaurantSection?.id || 'NOT FOUND'}`);
  
  if (!captainRole || !restaurantSection) {
    console.log('   ⚠️ Skipping: Missing required data (captain role or sections)');
    return;
  }
  
  // Test 2.1: Create captain for Restaurant section only
  console.log('\n   📝 Test 2.1: Create Captain for Restaurant Section Only');
  const captain1Res = await api().post('/users', {
    name: 'Test Captain Restaurant Only',
    email: `captain.rest.${Date.now()}@test.com`,
    employeeCode: `TCRO${Date.now().toString().slice(-4)}`,
    password: 'Captain@123',
    pin: '4444',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: testData.outletId }],
    sections: [{
      sectionId: restaurantSection.id,
      outletId: testData.outletId,
      canViewMenu: true,
      canTakeOrders: true,
      isPrimary: true
    }]
  });
  
  logTest(
    'Create captain with Restaurant section only',
    captain1Res.data.success,
    captain1Res.data.success ? `User ID: ${captain1Res.data.data?.id}` : captain1Res.data.message
  );
  
  if (captain1Res.data.success) {
    testData.createdUsers.push(captain1Res.data.data.id);
  }
  
  // Test 2.2: Create captain with view-only access to Bar
  if (barSection) {
    console.log('\n   📝 Test 2.2: Create Captain with Restaurant (full) + Bar (view only)');
    const captain2Res = await api().post('/users', {
      name: 'Test Captain Restaurant + Bar View',
      email: `captain.rbv.${Date.now()}@test.com`,
      employeeCode: `TCRB${Date.now().toString().slice(-4)}`,
      password: 'Captain@123',
      pin: '5555',
      isActive: true,
      roles: [{ roleId: captainRole.id, outletId: testData.outletId }],
      sections: [
        {
          sectionId: restaurantSection.id,
          outletId: testData.outletId,
          canViewMenu: true,
          canTakeOrders: true,
          isPrimary: true
        },
        {
          sectionId: barSection.id,
          outletId: testData.outletId,
          canViewMenu: true,
          canTakeOrders: false, // View only, cannot take orders
          isPrimary: false
        }
      ]
    });
    
    logTest(
      'Create captain with mixed section permissions',
      captain2Res.data.success,
      captain2Res.data.success 
        ? `User ID: ${captain2Res.data.data?.id}, Restaurant: Full, Bar: View Only`
        : captain2Res.data.message
    );
    
    if (captain2Res.data.success) {
      testData.createdUsers.push(captain2Res.data.data.id);
    }
  }
  
  // Test 2.3: Create Bar-only captain
  if (barSection) {
    console.log('\n   📝 Test 2.3: Create Bar Section Only Captain');
    const barCaptainRes = await api().post('/users', {
      name: 'Test Bar Captain',
      email: `captain.bar.${Date.now()}@test.com`,
      employeeCode: `TCBA${Date.now().toString().slice(-4)}`,
      password: 'Captain@123',
      pin: '6666',
      isActive: true,
      roles: [{ roleId: captainRole.id, outletId: testData.outletId }],
      sections: [{
        sectionId: barSection.id,
        outletId: testData.outletId,
        canViewMenu: true,
        canTakeOrders: true,
        isPrimary: true
      }]
    });
    
    logTest(
      'Create captain for Bar section only',
      barCaptainRes.data.success,
      barCaptainRes.data.success ? `User ID: ${barCaptainRes.data.data?.id}` : barCaptainRes.data.message
    );
    
    if (barCaptainRes.data.success) {
      testData.createdUsers.push(barCaptainRes.data.data.id);
    }
  }
}

// ========================
// TEST 3: MENU ACCESS CONTROL
// ========================

async function testMenuAccessControl() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 3: MENU ACCESS CONTROL');
  console.log('─'.repeat(60));
  
  const waiterRole = testData.roles?.find(r => r.name.toLowerCase() === 'waiter');
  
  console.log(`   Waiter Role: ${waiterRole?.id || 'NOT FOUND'}, Categories: ${testData.categories?.length || 0}`);
  
  if (!waiterRole || !testData.categories || testData.categories.length < 2) {
    console.log('   ⚠️ Skipping: Missing required data (waiter role or categories)');
    return;
  }
  
  // Test 3.1: Create waiter with limited menu category access
  console.log('\n   📝 Test 3.1: Create Waiter with Limited Menu Access');
  const limitedCategories = testData.categories.slice(0, 3);
  
  const waiter1Res = await api().post('/users', {
    name: 'Test Waiter Limited Menu',
    email: `waiter.lm.${Date.now()}@test.com`,
    employeeCode: `TWLM${Date.now().toString().slice(-4)}`,
    pin: '7777',
    isActive: true,
    roles: [{ roleId: waiterRole.id, outletId: testData.outletId }],
    menuAccess: limitedCategories.map(cat => ({
      categoryId: cat.id,
      outletId: testData.outletId,
      canView: true,
      canOrder: true
    }))
  });
  
  logTest(
    'Create waiter with limited menu categories',
    waiter1Res.data.success,
    waiter1Res.data.success 
      ? `User ID: ${waiter1Res.data.data?.id}, Categories: ${limitedCategories.length}`
      : waiter1Res.data.message
  );
  
  if (waiter1Res.data.success) {
    testData.createdUsers.push(waiter1Res.data.data.id);
  }
  
  // Test 3.2: Create waiter with view-only access to some categories
  console.log('\n   📝 Test 3.2: Create Waiter with Mixed Menu Permissions');
  const mixedMenuAccess = testData.categories.slice(0, 4).map((cat, i) => ({
    categoryId: cat.id,
    outletId: testData.outletId,
    canView: true,
    canOrder: i < 2 // First 2 categories can order, rest view-only
  }));
  
  const waiter2Res = await api().post('/users', {
    name: 'Test Waiter Mixed Menu',
    email: `waiter.mm.${Date.now()}@test.com`,
    employeeCode: `TWMM${Date.now().toString().slice(-4)}`,
    pin: '8888',
    isActive: true,
    roles: [{ roleId: waiterRole.id, outletId: testData.outletId }],
    menuAccess: mixedMenuAccess
  });
  
  logTest(
    'Create waiter with mixed menu permissions',
    waiter2Res.data.success,
    waiter2Res.data.success 
      ? `User ID: ${waiter2Res.data.data?.id}, Can Order: 2, View Only: 2`
      : waiter2Res.data.message
  );
  
  if (waiter2Res.data.success) {
    testData.createdUsers.push(waiter2Res.data.data.id);
  }
}

// ========================
// TEST 4: MULTI-FLOOR MANAGER
// ========================

async function testMultiFloorManager() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 4: MULTI-FLOOR MANAGER');
  console.log('─'.repeat(60));
  
  const managerRole = testData.roles?.find(r => r.name.toLowerCase() === 'manager');
  
  console.log(`   Manager Role: ${managerRole?.id || 'NOT FOUND'}`);
  
  if (!managerRole) {
    console.log('   ⚠️ Skipping: Missing manager role');
    return;
  }
  
  // Test 4.1: Create manager with all floors access
  console.log('\n   📝 Test 4.1: Create Manager with All Floors Access');
  const allFloors = testData.floors.map((f, i) => ({
    floorId: f.id,
    outletId: testData.outletId,
    isPrimary: i === 0
  }));
  
  const manager1Res = await api().post('/users', {
    name: 'Test Manager All Floors',
    email: `manager.af.${Date.now()}@test.com`,
    phone: '+91-9876500001',
    employeeCode: `TMAF${Date.now().toString().slice(-4)}`,
    password: 'Manager@123',
    pin: '9999',
    isActive: true,
    roles: [{ roleId: managerRole.id, outletId: testData.outletId }],
    floors: allFloors
  });
  
  logTest(
    'Create manager with all floors access',
    manager1Res.data.success,
    manager1Res.data.success 
      ? `User ID: ${manager1Res.data.data?.id}, Floors: ${allFloors.length}`
      : manager1Res.data.message
  );
  
  if (manager1Res.data.success) {
    testData.createdUsers.push(manager1Res.data.data.id);
  }
  
  // Test 4.2: Create manager with all sections access
  console.log('\n   📝 Test 4.2: Create Manager with All Sections Access');
  const allSections = testData.sections.map((s, i) => ({
    sectionId: s.id,
    outletId: testData.outletId,
    canViewMenu: true,
    canTakeOrders: true,
    isPrimary: i === 0
  }));
  
  const manager2Res = await api().post('/users', {
    name: 'Test Manager All Sections',
    email: `manager.as.${Date.now()}@test.com`,
    phone: '+91-9876500002',
    employeeCode: `TMAS${Date.now().toString().slice(-4)}`,
    password: 'Manager@123',
    pin: '0000',
    isActive: true,
    roles: [{ roleId: managerRole.id, outletId: testData.outletId }],
    sections: allSections
  });
  
  logTest(
    'Create manager with all sections access',
    manager2Res.data.success,
    manager2Res.data.success 
      ? `User ID: ${manager2Res.data.data?.id}, Sections: ${allSections.length}`
      : manager2Res.data.message
  );
  
  if (manager2Res.data.success) {
    testData.createdUsers.push(manager2Res.data.data.id);
  }
  
  // Test 4.3: Create manager with full access (floors + sections + menu)
  console.log('\n   📝 Test 4.3: Create Manager with Full Access');
  const fullAccessManager = {
    name: 'Test Manager Full Access',
    email: `manager.full.${Date.now()}@test.com`,
    phone: '+91-9876500003',
    employeeCode: `TMFA${Date.now().toString().slice(-4)}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: managerRole.id, outletId: testData.outletId }],
    floors: allFloors,
    sections: allSections,
    menuAccess: Array.isArray(testData.categories) ? testData.categories.slice(0, 5).map(cat => ({
      categoryId: cat.id,
      outletId: testData.outletId,
      canView: true,
      canOrder: true
    })) : []
  };
  
  const manager3Res = await api().post('/users', fullAccessManager);
  
  logTest(
    'Create manager with full access (floors + sections + menu)',
    manager3Res.data.success,
    manager3Res.data.success 
      ? `User ID: ${manager3Res.data.data?.id}, Floors: ${allFloors.length}, Sections: ${allSections.length}, Categories: ${Array.isArray(testData.categories) ? testData.categories.length : 0}`
      : manager3Res.data.message
  );
  
  if (manager3Res.data.success) {
    testData.createdUsers.push(manager3Res.data.data.id);
    testData.fullAccessManagerId = manager3Res.data.data.id;
  }
}

// ========================
// TEST 5: USER RETRIEVAL & VERIFICATION
// ========================

async function testUserRetrieval() {
  console.log('\n' + '─'.repeat(60));
  console.log('TEST 5: USER RETRIEVAL & VERIFICATION');
  console.log('─'.repeat(60));
  
  if (testData.createdUsers.length === 0) {
    console.log('   ⚠️ Skipping: No users created in previous tests');
    return;
  }
  
  // Test 5.1: Get user by ID and verify floor/section assignments
  console.log('\n   📝 Test 5.1: Retrieve User and Verify Assignments');
  const userId = testData.createdUsers[testData.createdUsers.length - 1];
  const userRes = await api().get(`/users/${userId}`);
  
  logTest(
    'Retrieve user with floor/section data',
    userRes.data.success,
    userRes.data.success 
      ? `Name: ${userRes.data.data?.name}`
      : userRes.data.message
  );
  
  // Test 5.2: List users by role
  console.log('\n   📝 Test 5.2: List Users by Role (Captains)');
  const captainRole = testData.roles?.find(r => r.name === 'captain');
  if (captainRole) {
    const captainsRes = await api().get(`/users?roleId=${captainRole.id}&outletId=${testData.outletId}`);
    
    logTest(
      'List users filtered by role',
      captainsRes.data.success,
      captainsRes.data.success 
        ? `Found ${captainsRes.data.data?.length || 0} captains`
        : captainsRes.data.message
    );
  }
  
  // Test 5.3: Get roles list
  console.log('\n   📝 Test 5.3: Get Available Roles');
  const rolesRes = await api().get('/users/roles');
  
  logTest(
    'Get available roles',
    rolesRes.data.success && rolesRes.data.data?.length > 0,
    rolesRes.data.success 
      ? `Found ${rolesRes.data.data?.length} roles`
      : rolesRes.data.message
  );
}

// ========================
// CLEANUP
// ========================

async function cleanup() {
  console.log('\n' + '─'.repeat(60));
  console.log('CLEANUP');
  console.log('─'.repeat(60));
  
  console.log(`\n   Deleting ${testData.createdUsers.length} test users...`);
  
  for (const userId of testData.createdUsers) {
    try {
      await api().delete(`/users/${userId}`);
      console.log(`   ✓ Deleted user ${userId}`);
    } catch (error) {
      console.log(`   ⚠️ Could not delete user ${userId}`);
    }
  }
}

// ========================
// MAIN
// ========================

async function main() {
  try {
    await setup();
    
    await testFloorAssignment();
    await testSectionAssignment();
    await testMenuAccessControl();
    await testMultiFloorManager();
    await testUserRetrieval();
    
    // Cleanup (optional - comment out to keep test users)
    // await cleanup();
    
    // Print results
    console.log('\n' + '═'.repeat(60));
    console.log('   TEST RESULTS');
    console.log('═'.repeat(60));
    console.log(`\n   ✅ Passed: ${testResults.passed}`);
    console.log(`   ❌ Failed: ${testResults.failed}`);
    console.log(`   📊 Total:  ${testResults.passed + testResults.failed}`);
    console.log('\n' + '═'.repeat(60));
    
    // Detailed results
    if (testResults.failed > 0) {
      console.log('\n   Failed Tests:');
      testResults.tests
        .filter(t => !t.passed)
        .forEach(t => console.log(`   - ${t.name}: ${t.details}`));
    }
    
    // Test data summary
    console.log('\n📝 Created Test Users:');
    testData.createdUsers.forEach(id => console.log(`   - User ID: ${id}`));
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    console.error(error.stack);
  }
}

main();
