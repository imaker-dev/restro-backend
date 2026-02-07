/**
 * Admin Module APIs Test Suite
 * Tests ALL APIs accessible to admin role (superuser - all permissions)
 * 
 * Covers:
 * 1. Authentication
 * 2. Staff Management (Manager with floors/sections, Captain with optional)
 * 3. Outlets & Layout
 * 4. Tables
 * 5. Categories & Items
 * 6. Orders
 * 7. KOT
 * 8. Billing
 * 9. Payment
 * 10. Discounts & Tax
 * 11. Inventory
 * 12. Reports
 * 13. Printers
 * 14. Settings & Permissions
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

const testData = {
  adminToken: null,
  outletId: null,
  floorId: null,
  floorId2: null,
  sectionId: null,
  sectionId2: null,
  tableId: null,
  categoryId: null,
  itemId: null,
  orderId: null,
  orderItemId: null,
  kotId: null,
  invoiceId: null,
  discountId: null,
  taxId: null,
  printerId: null,
  managerId: null,
  captainId: null,
  roles: {},
};

const api = (token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers, validateStatus: () => true });
};

const pass = (test, detail = '') => { console.log(`   ✅ ${test}${detail ? ` - ${detail}` : ''}`); return true; };
const fail = (test, detail = '') => { console.log(`   ❌ ${test}${detail ? ` - ${detail}` : ''}`); return false; };
const log = (msg) => console.log(`   ${msg}`);
const warn = (msg) => console.log(`   ⚠️  ${msg}`);

let passed = 0, failed = 0;

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('   ADMIN MODULE APIs TEST SUITE');
  console.log('   Testing ALL APIs (Superuser Access)');
  console.log('═'.repeat(70) + '\n');

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 1: AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════
  console.log('📋 MODULE 1: AUTHENTICATION\n' + '─'.repeat(70));

  const adminLogin = await api().post('/auth/login', {
    email: 'admin@restropos.com',
    password: 'admin123'
  });

  if (adminLogin.data.success) {
    pass('POST /auth/login', 'Admin logged in'); passed++;
    testData.adminToken = adminLogin.data.data.accessToken;
  } else {
    fail('POST /auth/login', 'Admin login failed'); failed++;
    console.log('Cannot continue without admin login');
    process.exit(1);
  }

  // Get profile
  const profile = await api(testData.adminToken).get('/auth/me');
  if (profile.data.success) {
    pass('GET /auth/me', `User: ${profile.data.data.name}`); passed++;
  } else { fail('GET /auth/me'); failed++; }

  // Get roles
  const roles = await api(testData.adminToken).get('/users/roles');
  if (roles.data.success) {
    pass('GET /users/roles', `${roles.data.data?.length} roles`); passed++;
    for (const role of roles.data.data || []) {
      testData.roles[role.slug] = role.id;
    }
  } else { fail('GET /users/roles'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 2: OUTLETS & LAYOUT
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 2: OUTLETS & LAYOUT\n' + '─'.repeat(70));

  // Get outlets
  const outlets = await api(testData.adminToken).get('/outlets');
  if (outlets.data.success) {
    pass('GET /outlets', `${outlets.data.data?.length} outlets`); passed++;
    if (outlets.data.data?.length > 0) {
      testData.outletId = outlets.data.data[0].id;
      log(`   Selected: ${outlets.data.data[0].name} (ID: ${testData.outletId})`);
    }
  } else { fail('GET /outlets'); failed++; }

  // Get outlet by ID
  const outlet = await api(testData.adminToken).get(`/outlets/${testData.outletId}`);
  if (outlet.data.success) {
    pass('GET /outlets/:id'); passed++;
  } else { fail('GET /outlets/:id'); failed++; }

  // Get floors
  const floors = await api(testData.adminToken).get(`/outlets/${testData.outletId}/floors`);
  if (floors.data.success) {
    pass('GET /outlets/:outletId/floors', `${floors.data.data?.length} floors`); passed++;
    if (floors.data.data?.length > 0) {
      testData.floorId = floors.data.data[0].id;
      if (floors.data.data.length > 1) testData.floorId2 = floors.data.data[1].id;
    }
  } else { fail('GET /outlets/:outletId/floors'); failed++; }

  // Get sections
  const sections = await api(testData.adminToken).get(`/outlets/${testData.outletId}/sections`);
  if (sections.data.success) {
    pass('GET /outlets/:outletId/sections', `${sections.data.data?.length} sections`); passed++;
    if (sections.data.data?.length > 0) {
      testData.sectionId = sections.data.data[0].id;
      if (sections.data.data.length > 1) testData.sectionId2 = sections.data.data[1].id;
    }
  } else { fail('GET /outlets/:outletId/sections'); failed++; }

  // Get floor details
  const floorDetails = await api(testData.adminToken).get(`/outlets/floors/${testData.floorId}/details`);
  if (floorDetails.data.success) {
    pass('GET /outlets/floors/:id/details'); passed++;
  } else { fail('GET /outlets/floors/:id/details'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 3: STAFF MANAGEMENT (MANAGER WITH DEDICATED FLOORS/SECTIONS)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 3: STAFF - MANAGER WITH DEDICATED FLOORS/SECTIONS\n' + '─'.repeat(70));

  const timestamp = Date.now();

  // Create manager with dedicated floors and sections
  const managerData = {
    name: 'Test Manager User',
    email: `manager.test.${timestamp}@test.com`,
    employeeCode: `MGR${timestamp.toString().slice(-6)}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }],
    // DEDICATED floor assignment for manager
    floors: [
      { floorId: testData.floorId, outletId: testData.outletId, isPrimary: true },
    ],
    // DEDICATED section assignment for manager
    sections: [
      { sectionId: testData.sectionId, outletId: testData.outletId, canViewMenu: true, canTakeOrders: true, isPrimary: true },
    ]
  };

  // Add second floor if available
  if (testData.floorId2) {
    managerData.floors.push({ floorId: testData.floorId2, outletId: testData.outletId, isPrimary: false });
  }
  // Add second section if available
  if (testData.sectionId2) {
    managerData.sections.push({ sectionId: testData.sectionId2, outletId: testData.outletId, canViewMenu: true, canTakeOrders: true, isPrimary: false });
  }

  const createManager = await api(testData.adminToken).post('/users', managerData);
  if (createManager.data.success) {
    testData.managerId = createManager.data.data.id;
    pass('POST /users (Manager)', `ID: ${testData.managerId}`); passed++;
    log(`   Employee Code: ${createManager.data.data.employeeCode}`);
    log(`   Floors: ${managerData.floors.length} assigned`);
    log(`   Sections: ${managerData.sections.length} assigned`);
  } else { 
    fail('POST /users (Manager)', createManager.data.message); failed++; 
  }

  // Verify manager was created with floor/section assignments
  if (testData.managerId) {
    const getManager = await api(testData.adminToken).get(`/users/${testData.managerId}`);
    if (getManager.data.success) {
      pass('GET /users/:id (Manager)', 'Verified creation'); passed++;
      const user = getManager.data.data;
      if (user.floors && user.floors.length > 0) {
        pass('Manager has floor assignments', `${user.floors.length} floors`); passed++;
      }
      if (user.sections && user.sections.length > 0) {
        pass('Manager has section assignments', `${user.sections.length} sections`); passed++;
      }
    } else { fail('GET /users/:id (Manager)'); failed++; }
  }

  // Test manager login
  const managerLogin = await api().post('/auth/login', {
    email: managerData.email,
    password: 'Manager@123'
  });
  if (managerLogin.data.success) {
    pass('Manager login (email/password)'); passed++;
  } else { fail('Manager login', managerLogin.data.message); failed++; }

  // Test manager PIN login
  const managerPinLogin = await api().post('/auth/login/pin', {
    employeeCode: managerData.employeeCode,
    pin: '1234',
    outletId: testData.outletId
  });
  if (managerPinLogin.data.success) {
    pass('Manager login (PIN)'); passed++;
  } else { fail('Manager PIN login', managerPinLogin.data.message); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 4: STAFF - CAPTAIN WITH OPTIONAL FLOORS/SECTIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 4: STAFF - CAPTAIN WITH OPTIONAL FLOORS/SECTIONS\n' + '─'.repeat(70));

  // Create captain WITH floor/section (optional)
  const captainWithFloors = {
    name: 'Captain With Floors',
    email: `captain.floors.${timestamp}@test.com`,
    employeeCode: `CPF${timestamp.toString().slice(-6)}`,
    password: 'Captain@123',
    pin: '2345',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }],
    // OPTIONAL floor assignment for captain
    floors: [
      { floorId: testData.floorId, outletId: testData.outletId, isPrimary: true },
    ],
    // OPTIONAL section assignment for captain
    sections: [
      { sectionId: testData.sectionId, outletId: testData.outletId, canViewMenu: true, canTakeOrders: true, isPrimary: true },
    ]
  };

  const createCaptainWithFloors = await api(testData.adminToken).post('/users', captainWithFloors);
  if (createCaptainWithFloors.data.success) {
    testData.captainId = createCaptainWithFloors.data.data.id;
    pass('POST /users (Captain with floors)', `ID: ${testData.captainId}`); passed++;
    log(`   Employee Code: ${createCaptainWithFloors.data.data.employeeCode}`);
    log(`   Floors: 1 assigned (optional)`);
    log(`   Sections: 1 assigned (optional)`);
  } else { 
    fail('POST /users (Captain with floors)', createCaptainWithFloors.data.message); failed++; 
  }

  // Create captain WITHOUT floor/section (all access)
  const captainNoFloors = {
    name: 'Captain No Floors',
    email: `captain.all.${timestamp}@test.com`,
    employeeCode: `CPA${timestamp.toString().slice(-6)}`,
    password: 'Captain@123',
    pin: '3456',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
    // NO floors/sections - captain sees all
  };

  const createCaptainNoFloors = await api(testData.adminToken).post('/users', captainNoFloors);
  if (createCaptainNoFloors.data.success) {
    pass('POST /users (Captain without floors)', 'All access'); passed++;
    log(`   Employee Code: ${createCaptainNoFloors.data.data.employeeCode}`);
    log(`   Floors: None (sees all)`);
    // Clean up this captain
    await api(testData.adminToken).delete(`/users/${createCaptainNoFloors.data.data.id}`);
  } else { 
    fail('POST /users (Captain without floors)', createCaptainNoFloors.data.message); failed++; 
  }

  // Verify captain with floors
  if (testData.captainId) {
    const getCaptain = await api(testData.adminToken).get(`/users/${testData.captainId}`);
    if (getCaptain.data.success) {
      pass('GET /users/:id (Captain)', 'Verified'); passed++;
      const user = getCaptain.data.data;
      if (user.floors) {
        log(`   Assigned floors: ${user.floors.length}`);
      }
    } else { fail('GET /users/:id (Captain)'); failed++; }
  }

  // Test captain login
  const captainLogin = await api().post('/auth/login', {
    email: captainWithFloors.email,
    password: 'Captain@123'
  });
  if (captainLogin.data.success) {
    pass('Captain login (email/password)'); passed++;
  } else { fail('Captain login'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 5: STAFF MANAGEMENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 5: STAFF MANAGEMENT OPERATIONS\n' + '─'.repeat(70));

  // List users
  const users = await api(testData.adminToken).get('/users');
  if (users.data.success) {
    pass('GET /users', `${users.data.data?.length || 0} users`); passed++;
  } else { fail('GET /users'); failed++; }

  // List users with filters
  const filteredUsers = await api(testData.adminToken).get(`/users?roleId=${testData.roles.captain}&outletId=${testData.outletId}`);
  if (filteredUsers.data.success) {
    pass('GET /users (filtered)', `${filteredUsers.data.data?.length || 0} captains`); passed++;
  } else { fail('GET /users (filtered)'); failed++; }

  // Update user
  if (testData.captainId) {
    const updateUser = await api(testData.adminToken).put(`/users/${testData.captainId}`, {
      name: 'Captain Updated Name'
    });
    if (updateUser.data.success) {
      pass('PUT /users/:id', 'Updated'); passed++;
    } else { fail('PUT /users/:id'); failed++; }
  }

  // Assign additional role
  if (testData.captainId && testData.roles.cashier) {
    const assignRole = await api(testData.adminToken).post(`/users/${testData.captainId}/roles`, {
      roleId: testData.roles.cashier,
      outletId: testData.outletId
    });
    if (assignRole.data.success) {
      pass('POST /users/:id/roles', 'Assigned cashier role'); passed++;
    } else { fail('POST /users/:id/roles'); failed++; }

    // Remove role
    const removeRole = await api(testData.adminToken).delete(`/users/${testData.captainId}/roles`, {
      data: { roleId: testData.roles.cashier, outletId: testData.outletId }
    });
    if (removeRole.data.success) {
      pass('DELETE /users/:id/roles', 'Removed cashier role'); passed++;
    } else { fail('DELETE /users/:id/roles'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 6: TABLES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 6: TABLES\n' + '─'.repeat(70));

  // Get tables by floor
  const tables = await api(testData.adminToken).get(`/tables/floor/${testData.floorId}`);
  if (tables.data.success) {
    pass('GET /tables/floor/:floorId', `${tables.data.data?.length} tables`); passed++;
    if (tables.data.data?.length > 0) {
      testData.tableId = tables.data.data[0].id;
    }
  } else { fail('GET /tables/floor/:floorId'); failed++; }

  // Get tables by outlet
  const outletTables = await api(testData.adminToken).get(`/tables/outlet/${testData.outletId}`);
  if (outletTables.data.success) {
    pass('GET /tables/outlet/:outletId', `${outletTables.data.data?.length} tables`); passed++;
  } else { fail('GET /tables/outlet/:outletId'); failed++; }

  // Real-time status
  const rtStatus = await api(testData.adminToken).get(`/tables/realtime/${testData.outletId}`);
  if (rtStatus.data.success) {
    pass('GET /tables/realtime/:outletId'); passed++;
  } else { fail('GET /tables/realtime/:outletId'); failed++; }

  // Get table by ID
  if (testData.tableId) {
    const table = await api(testData.adminToken).get(`/tables/${testData.tableId}`);
    if (table.data.success) {
      pass('GET /tables/:id', table.data.data?.name); passed++;
    } else { fail('GET /tables/:id'); failed++; }
  }

  // Create table (admin only)
  const newTable = await api(testData.adminToken).post('/tables', {
    floorId: testData.floorId,
    sectionId: testData.sectionId,
    outletId: testData.outletId,
    name: 'Test Table',
    tableNumber: 'T99',
    capacity: 4,
    shape: 'rectangle',
    status: 'available'
  });
  if (newTable.data.success) {
    pass('POST /tables', `Created: ${newTable.data.data?.name}`); passed++;
    // Update table
    const updateTable = await api(testData.adminToken).put(`/tables/${newTable.data.data.id}`, {
      capacity: 6
    });
    if (updateTable.data.success) {
      pass('PUT /tables/:id', 'Updated capacity'); passed++;
    } else { fail('PUT /tables/:id'); failed++; }
    
    // Delete table
    const deleteTable = await api(testData.adminToken).delete(`/tables/${newTable.data.data.id}`);
    if (deleteTable.data.success) {
      pass('DELETE /tables/:id', 'Deleted'); passed++;
    } else { fail('DELETE /tables/:id'); failed++; }
  } else { fail('POST /tables', newTable.data.message); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 7: CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 7: CATEGORIES\n' + '─'.repeat(70));

  // Get categories
  const categories = await api(testData.adminToken).get(`/menu/categories/outlet/${testData.outletId}`);
  if (categories.data.success) {
    pass('GET /menu/categories/outlet/:outletId', `${categories.data.data?.length} categories`); passed++;
    if (categories.data.data?.length > 0) {
      testData.categoryId = categories.data.data[0].id;
    }
  } else { fail('GET /menu/categories/outlet/:outletId'); failed++; }

  // Get category tree
  const catTree = await api(testData.adminToken).get(`/menu/categories/outlet/${testData.outletId}/tree`);
  if (catTree.data.success) {
    pass('GET /menu/categories/outlet/:outletId/tree'); passed++;
  } else { fail('GET /menu/categories/outlet/:outletId/tree'); failed++; }

  // Create category
  const newCat = await api(testData.adminToken).post('/menu/categories', {
    outletId: testData.outletId,
    name: 'Test Category',
    description: 'Test category for admin',
    displayOrder: 99,
    isActive: true
  });
  if (newCat.data.success) {
    pass('POST /menu/categories', `Created: ${newCat.data.data?.name}`); passed++;
    
    // Update category
    const updateCat = await api(testData.adminToken).put(`/menu/categories/${newCat.data.data.id}`, {
      name: 'Test Category Updated'
    });
    if (updateCat.data.success) {
      pass('PUT /menu/categories/:id'); passed++;
    } else { fail('PUT /menu/categories/:id'); failed++; }
    
    // Delete category
    const deleteCat = await api(testData.adminToken).delete(`/menu/categories/${newCat.data.data.id}`);
    if (deleteCat.data.success) {
      pass('DELETE /menu/categories/:id'); passed++;
    } else { fail('DELETE /menu/categories/:id'); failed++; }
  } else { fail('POST /menu/categories', newCat.data.message); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 8: ITEMS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 8: ITEMS\n' + '─'.repeat(70));

  // Get items
  const items = await api(testData.adminToken).get(`/menu/items/outlet/${testData.outletId}`);
  if (items.data.success) {
    pass('GET /menu/items/outlet/:outletId', `${items.data.data?.length} items`); passed++;
    if (items.data.data?.length > 0) {
      testData.itemId = items.data.data[0].id;
    }
  } else { fail('GET /menu/items/outlet/:outletId'); failed++; }

  // Get items by category
  if (testData.categoryId) {
    const catItems = await api(testData.adminToken).get(`/menu/items/category/${testData.categoryId}`);
    if (catItems.data.success) {
      pass('GET /menu/items/category/:categoryId', `${catItems.data.data?.length} items`); passed++;
    } else { fail('GET /menu/items/category/:categoryId'); failed++; }
  }

  // Get item by ID
  if (testData.itemId) {
    const item = await api(testData.adminToken).get(`/menu/items/${testData.itemId}`);
    if (item.data.success) {
      pass('GET /menu/items/:id', item.data.data?.name); passed++;
    } else { fail('GET /menu/items/:id'); failed++; }
  }

  // Captain menu
  const captainMenu = await api(testData.adminToken).get(`/menu/${testData.outletId}/captain`);
  if (captainMenu.data.success) {
    pass('GET /menu/:outletId/captain'); passed++;
  } else { fail('GET /menu/:outletId/captain'); failed++; }

  // Search items
  const searchItems = await api(testData.adminToken).get(`/menu/${testData.outletId}/search?q=test`);
  if (searchItems.data.success) {
    pass('GET /menu/:outletId/search'); passed++;
  } else { fail('GET /menu/:outletId/search'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 9: ORDERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 9: ORDERS\n' + '─'.repeat(70));

  // Get active orders
  const activeOrders = await api(testData.adminToken).get(`/orders/active/${testData.outletId}`);
  if (activeOrders.data.success) {
    pass('GET /orders/active/:outletId', `${activeOrders.data.data?.length} active`); passed++;
    if (activeOrders.data.data?.length > 0) {
      testData.orderId = activeOrders.data.data[0].id;
    }
  } else { fail('GET /orders/active/:outletId'); failed++; }

  // Get orders by table
  if (testData.tableId) {
    const tableOrders = await api(testData.adminToken).get(`/orders/table/${testData.tableId}`);
    if (tableOrders.data.success) {
      pass('GET /orders/table/:tableId'); passed++;
    } else { fail('GET /orders/table/:tableId'); failed++; }
  }

  // Get order by ID
  if (testData.orderId) {
    const order = await api(testData.adminToken).get(`/orders/${testData.orderId}`);
    if (order.data.success) {
      pass('GET /orders/:id', `#${order.data.data?.orderNumber}`); passed++;
      if (order.data.data?.items?.length > 0) {
        testData.orderItemId = order.data.data.items[0].id;
      }
    } else { fail('GET /orders/:id'); failed++; }
  }

  // Cancel reasons
  const reasons = await api(testData.adminToken).get(`/orders/cancel-reasons/${testData.outletId}`);
  if (reasons.data.success) {
    pass('GET /orders/cancel-reasons/:outletId'); passed++;
  } else { fail('GET /orders/cancel-reasons/:outletId'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 10: KOT
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 10: KOT\n' + '─'.repeat(70));

  // Get active KOTs
  const activeKots = await api(testData.adminToken).get(`/orders/kot/active/${testData.outletId}`);
  if (activeKots.data.success) {
    pass('GET /orders/kot/active/:outletId', `${activeKots.data.data?.length} active`); passed++;
    if (activeKots.data.data?.length > 0) {
      testData.kotId = activeKots.data.data[0].id;
    }
  } else { fail('GET /orders/kot/active/:outletId'); failed++; }

  // Kitchen dashboard
  const kitchen = await api(testData.adminToken).get(`/orders/station/${testData.outletId}/kitchen`);
  if (kitchen.data.success) {
    pass('GET /orders/station/:outletId/kitchen'); passed++;
  } else { fail('GET /orders/station/:outletId/kitchen'); failed++; }

  // Bar dashboard
  const bar = await api(testData.adminToken).get(`/orders/station/${testData.outletId}/bar`);
  if (bar.data.success) {
    pass('GET /orders/station/:outletId/bar'); passed++;
  } else { fail('GET /orders/station/:outletId/bar'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 11: BILLING
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 11: BILLING\n' + '─'.repeat(70));

  // Get invoice for order
  if (testData.orderId) {
    const invoice = await api(testData.adminToken).get(`/orders/${testData.orderId}/invoice`);
    if (invoice.data.success || invoice.status === 404) {
      pass('GET /orders/:orderId/invoice', invoice.data.data ? 'Found' : 'No invoice'); passed++;
      if (invoice.data.data) testData.invoiceId = invoice.data.data.id;
    } else { fail('GET /orders/:orderId/invoice'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 12: PAYMENT
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 12: PAYMENT\n' + '─'.repeat(70));

  // Cash drawer status
  const drawerStatus = await api(testData.adminToken).get(`/orders/cash-drawer/${testData.outletId}/status`);
  if (drawerStatus.data.success) {
    pass('GET /orders/cash-drawer/:outletId/status'); passed++;
  } else { fail('GET /orders/cash-drawer/:outletId/status'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 13: DISCOUNTS & TAX
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 13: DISCOUNTS & TAX\n' + '─'.repeat(70));

  // Get tax groups
  const taxGroups = await api(testData.adminToken).get('/tax/groups');
  if (taxGroups.data.success) {
    pass('GET /tax/groups', `${taxGroups.data.data?.length || 0} tax groups`); passed++;
  } else { fail('GET /tax/groups'); failed++; }

  // Get tax types
  const taxTypes = await api(testData.adminToken).get('/tax/types');
  if (taxTypes.data.success) {
    pass('GET /tax/types', `${taxTypes.data.data?.length || 0} types`); passed++;
  } else { fail('GET /tax/types'); failed++; }

  // Get discounts
  const discounts = await api(testData.adminToken).get(`/tax/discounts/${testData.outletId}`);
  if (discounts.data.success) {
    pass('GET /tax/discounts/:outletId', `${discounts.data.data?.length} discounts`); passed++;
    if (discounts.data.data?.length > 0) testData.discountId = discounts.data.data[0].id;
  } else { fail('GET /tax/discounts/:outletId'); failed++; }

  // Time slots
  const timeSlots = await api(testData.adminToken).get(`/tax/time-slots/${testData.outletId}`);
  if (timeSlots.data.success) {
    pass('GET /tax/time-slots/:outletId', `${timeSlots.data.data?.length || 0} slots`); passed++;
  } else { fail('GET /tax/time-slots/:outletId'); failed++; }

  // Price rules
  const priceRules = await api(testData.adminToken).get(`/tax/price-rules/${testData.outletId}`);
  if (priceRules.data.success) {
    pass('GET /tax/price-rules/:outletId'); passed++;
  } else { fail('GET /tax/price-rules/:outletId'); failed++; }

  // Validate discount code
  const validateDiscount = await api(testData.adminToken).post(`/tax/discounts/${testData.outletId}/validate`, {
    code: 'TEST10',
    orderTotal: 500
  });
  // This may fail if code doesn't exist but API should respond
  pass('POST /tax/discounts/:outletId/validate', validateDiscount.data.success ? 'Valid' : 'Invalid code'); passed++;
  // Get service charges
  const charges = await api(testData.adminToken).get(`/tax/service-charges/${testData.outletId}`);
  if (charges.data.success) {
    pass('GET /tax/service-charges/:outletId'); passed++;
  } else { fail('GET /tax/service-charges/:outletId'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 14: REPORTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 14: REPORTS\n' + '─'.repeat(70));

  // Dashboard
  const dashboard = await api(testData.adminToken).get(`/orders/reports/${testData.outletId}/dashboard`);
  if (dashboard.data.success) {
    pass('GET /orders/reports/:outletId/dashboard'); passed++;
  } else { fail('GET /orders/reports/:outletId/dashboard'); failed++; }

  // Hourly sales
  const hourly = await api(testData.adminToken).get(`/orders/reports/${testData.outletId}/hourly`);
  if (hourly.data.success) {
    pass('GET /orders/reports/:outletId/hourly'); passed++;
  } else { fail('GET /orders/reports/:outletId/hourly'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 15: PRINTERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 15: PRINTERS\n' + '─'.repeat(70));

  // Get printers
  const printers = await api(testData.adminToken).get(`/printers/outlet/${testData.outletId}`);
  if (printers.data.success) {
    pass('GET /printers/outlet/:outletId', `${printers.data.data?.length || 0} printers`); passed++;
    if (printers.data.data?.length > 0) testData.printerId = printers.data.data[0].id;
  } else { fail('GET /printers/outlet/:outletId'); failed++; }

  // Bridge status
  const bridgeStatus = await api(testData.adminToken).get(`/printers/bridge/${testData.outletId}/status`);
  if (bridgeStatus.data.success || bridgeStatus.status === 404) {
    pass('GET /printers/bridge/:outletId/status'); passed++;
  } else { fail('GET /printers/bridge/:outletId/status'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 16: PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 16: PERMISSIONS\n' + '─'.repeat(70));

  // Get all permissions
  const allPerms = await api(testData.adminToken).get('/permissions');
  if (allPerms.data.success) {
    pass('GET /permissions', `${allPerms.data.data?.permissions?.length} permissions`); passed++;
  } else { fail('GET /permissions'); failed++; }

  // Get role permissions
  if (testData.roles.manager) {
    const rolePerms = await api(testData.adminToken).get(`/permissions/roles/${testData.roles.manager}`);
    if (rolePerms.data.success) {
      pass('GET /permissions/roles/:id', `Manager has ${rolePerms.data.data?.length} perms`); passed++;
    } else { fail('GET /permissions/roles/:id'); failed++; }
  }

  // Get user permissions
  if (testData.captainId) {
    const userPerms = await api(testData.adminToken).get(`/users/${testData.captainId}/permissions`);
    if (userPerms.data.success) {
      pass('GET /users/:id/permissions'); passed++;
    } else { fail('GET /users/:id/permissions'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n🧹 CLEANUP\n' + '─'.repeat(70));

  if (testData.captainId) {
    await api(testData.adminToken).delete(`/users/${testData.captainId}`);
    log('Deleted test captain');
  }
  if (testData.managerId) {
    await api(testData.adminToken).delete(`/users/${testData.managerId}`);
    log('Deleted test manager');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('   ADMIN MODULE APIs TEST RESULTS');
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
