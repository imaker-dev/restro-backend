/**
 * Manager Module APIs Test Suite
 * Tests all APIs accessible to manager for each module
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

const testData = {
  adminToken: null,
  managerToken: null,
  outletId: null,
  floorId: null,
  sectionId: null,
  tableId: null,
  categoryId: null,
  itemId: null,
  orderId: null,
  kotId: null,
  invoiceId: null,
  testCaptainId: null,
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

let passed = 0, failed = 0;

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('   MANAGER MODULE APIs TEST SUITE');
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

  // Get outlet
  const outlets = await api(testData.adminToken).get('/outlets');
  if (outlets.data.data?.length > 0) {
    testData.outletId = outlets.data.data[0].id;
    log(`Outlet: ${outlets.data.data[0].name} (ID: ${testData.outletId})`);
  }

  // Get roles
  const roles = await api(testData.adminToken).get('/users/roles');
  for (const role of roles.data.data || []) {
    testData.roles[role.slug] = role.id;
  }

  // Create test manager and login
  const timestamp = Date.now();
  const mgrRes = await api(testData.adminToken).post('/users', {
    name: 'Module Test Manager',
    email: `module.mgr.${timestamp}@test.com`,
    employeeCode: `MMG${timestamp.toString().slice(-6)}`,
    password: 'Manager@123',
    pin: '1234',
    isActive: true,
    roles: [{ roleId: testData.roles.manager, outletId: testData.outletId }]
  });
  
  const mgrLogin = await api().post('/auth/login/pin', {
    employeeCode: mgrRes.data.data.employeeCode,
    pin: '1234',
    outletId: testData.outletId
  });
  testData.managerToken = mgrLogin.data.data.accessToken;
  testData.managerId = mgrRes.data.data.id;
  log(`Manager logged in: ${mgrRes.data.data.employeeCode}`);

  // Get existing floor/section
  const floors = await api(testData.managerToken).get(`/outlets/${testData.outletId}/floors`);
  if (floors.data.data?.length > 0) {
    testData.floorId = floors.data.data[0].id;
    log(`Floor: ${floors.data.data[0].name} (ID: ${testData.floorId})`);
  }

  const sections = await api(testData.managerToken).get(`/outlets/${testData.outletId}/sections`);
  if (sections.data.data?.length > 0) {
    testData.sectionId = sections.data.data[0].id;
    log(`Section: ${sections.data.data[0].name} (ID: ${testData.sectionId})`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 1: TABLES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 1: TABLES\n' + '─'.repeat(70));

  // Get tables by outlet
  const tables = await api(testData.managerToken).get(`/tables/outlet/${testData.outletId}`);
  if (tables.data.success) {
    pass('GET /tables/outlet/:outletId', `${tables.data.data?.length || 0} tables`); passed++;
    if (tables.data.data?.length > 0) {
      testData.tableId = tables.data.data[0].id;
    }
  } else { fail('GET /tables/outlet/:outletId'); failed++; }

  // Get tables by floor
  if (testData.floorId) {
    const floorTables = await api(testData.managerToken).get(`/tables/floor/${testData.floorId}`);
    if (floorTables.data.success) {
      pass('GET /tables/floor/:floorId'); passed++;
    } else { fail('GET /tables/floor/:floorId'); failed++; }
  }

  // Get real-time status
  const rtStatus = await api(testData.managerToken).get(`/tables/realtime/${testData.outletId}`);
  if (rtStatus.data.success) {
    pass('GET /tables/realtime/:outletId', 'Real-time status'); passed++;
  } else { fail('GET /tables/realtime/:outletId'); failed++; }

  // Get single table
  if (testData.tableId) {
    const table = await api(testData.managerToken).get(`/tables/${testData.tableId}`);
    if (table.data.success) {
      pass('GET /tables/:id', table.data.data?.name); passed++;
    } else { fail('GET /tables/:id'); failed++; }

    // Get table history
    const history = await api(testData.managerToken).get(`/tables/${testData.tableId}/history`);
    if (history.data.success) {
      pass('GET /tables/:id/history'); passed++;
    } else { fail('GET /tables/:id/history'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 2: CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 2: CATEGORIES\n' + '─'.repeat(70));

  // Get categories
  const categories = await api(testData.managerToken).get(`/menu/categories/outlet/${testData.outletId}`);
  if (categories.data.success) {
    pass('GET /menu/categories/outlet/:outletId', `${categories.data.data?.length || 0} categories`); passed++;
    if (categories.data.data?.length > 0) {
      testData.categoryId = categories.data.data[0].id;
    }
  } else { fail('GET /menu/categories/outlet/:outletId'); failed++; }

  // Get category tree
  const catTree = await api(testData.managerToken).get(`/menu/categories/outlet/${testData.outletId}/tree`);
  if (catTree.data.success) {
    pass('GET /menu/categories/outlet/:outletId/tree'); passed++;
  } else { fail('GET /menu/categories/outlet/:outletId/tree'); failed++; }

  // Get single category
  if (testData.categoryId) {
    const cat = await api(testData.managerToken).get(`/menu/categories/${testData.categoryId}`);
    if (cat.data.success) {
      pass('GET /menu/categories/:id', cat.data.data?.name); passed++;
    } else { fail('GET /menu/categories/:id'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 3: ITEMS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 3: ITEMS\n' + '─'.repeat(70));

  // Get items
  const items = await api(testData.managerToken).get(`/menu/items/outlet/${testData.outletId}`);
  if (items.data.success) {
    pass('GET /menu/items/outlet/:outletId', `${items.data.data?.length || 0} items`); passed++;
    if (items.data.data?.length > 0) {
      testData.itemId = items.data.data[0].id;
    }
  } else { fail('GET /menu/items/outlet/:outletId'); failed++; }

  // Get items by category
  if (testData.categoryId) {
    const catItems = await api(testData.managerToken).get(`/menu/items/category/${testData.categoryId}`);
    if (catItems.data.success) {
      pass('GET /menu/items/category/:categoryId'); passed++;
    } else { fail('GET /menu/items/category/:categoryId'); failed++; }
  }

  // Get single item
  if (testData.itemId) {
    const item = await api(testData.managerToken).get(`/menu/items/${testData.itemId}`);
    if (item.data.success) {
      pass('GET /menu/items/:id', item.data.data?.name); passed++;
    } else { fail('GET /menu/items/:id'); failed++; }

    // Get item details
    const itemDetails = await api(testData.managerToken).get(`/menu/items/${testData.itemId}/details`);
    if (itemDetails.data.success) {
      pass('GET /menu/items/:id/details'); passed++;
    } else { fail('GET /menu/items/:id/details'); failed++; }
  }

  // Get menu
  const menu = await api(testData.managerToken).get(`/menu/${testData.outletId}`);
  if (menu.data.success) {
    pass('GET /menu/:outletId', 'Full menu'); passed++;
  } else { fail('GET /menu/:outletId'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 4: ORDERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 4: ORDERS\n' + '─'.repeat(70));

  // Get active orders
  const activeOrders = await api(testData.managerToken).get(`/orders/active/${testData.outletId}`);
  if (activeOrders.data.success) {
    pass('GET /orders/active/:outletId', `${activeOrders.data.data?.length || 0} active`); passed++;
    if (activeOrders.data.data?.length > 0) {
      testData.orderId = activeOrders.data.data[0].id;
    }
  } else { fail('GET /orders/active/:outletId'); failed++; }

  // Get orders by table
  if (testData.tableId) {
    const tableOrders = await api(testData.managerToken).get(`/orders/table/${testData.tableId}`);
    if (tableOrders.data.success) {
      pass('GET /orders/table/:tableId'); passed++;
    } else { fail('GET /orders/table/:tableId'); failed++; }
  }

  // Get cancel reasons
  const reasons = await api(testData.managerToken).get(`/orders/cancel-reasons/${testData.outletId}`);
  if (reasons.data.success) {
    pass('GET /orders/cancel-reasons/:outletId'); passed++;
  } else { fail('GET /orders/cancel-reasons/:outletId'); failed++; }

  // Get single order
  if (testData.orderId) {
    const order = await api(testData.managerToken).get(`/orders/${testData.orderId}`);
    if (order.data.success) {
      pass('GET /orders/:id', `Order #${order.data.data?.orderNumber}`); passed++;
    } else { fail('GET /orders/:id'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 5: KOT
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 5: KOT\n' + '─'.repeat(70));

  // Get active KOTs
  const activeKots = await api(testData.managerToken).get(`/orders/kot/active/${testData.outletId}`);
  if (activeKots.data.success) {
    pass('GET /orders/kot/active/:outletId', `${activeKots.data.data?.length || 0} active`); passed++;
    if (activeKots.data.data?.length > 0) {
      testData.kotId = activeKots.data.data[0].id;
    }
  } else { fail('GET /orders/kot/active/:outletId'); failed++; }

  // Get station dashboard
  const kitchen = await api(testData.managerToken).get(`/orders/station/${testData.outletId}/kitchen`);
  if (kitchen.data.success) {
    pass('GET /orders/station/:outletId/kitchen'); passed++;
  } else { fail('GET /orders/station/:outletId/kitchen'); failed++; }

  const bar = await api(testData.managerToken).get(`/orders/station/${testData.outletId}/bar`);
  if (bar.data.success) {
    pass('GET /orders/station/:outletId/bar'); passed++;
  } else { fail('GET /orders/station/:outletId/bar'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 6: BILLING
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 6: BILLING\n' + '─'.repeat(70));

  // Get invoice if order exists
  if (testData.orderId) {
    const invoice = await api(testData.managerToken).get(`/orders/${testData.orderId}/invoice`);
    if (invoice.data.success || invoice.status === 404) {
      pass('GET /orders/:orderId/invoice', invoice.data.data ? 'Found' : 'No invoice yet'); passed++;
      if (invoice.data.data) {
        testData.invoiceId = invoice.data.data.id;
      }
    } else { fail('GET /orders/:orderId/invoice'); failed++; }

    // Get payments
    const payments = await api(testData.managerToken).get(`/orders/${testData.orderId}/payments`);
    if (payments.data.success) {
      pass('GET /orders/:orderId/payments'); passed++;
    } else { fail('GET /orders/:orderId/payments'); failed++; }
  } else {
    log('Skipping billing tests - no active order');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 7: PAYMENT & CASH DRAWER
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 7: PAYMENT & CASH DRAWER\n' + '─'.repeat(70));

  // Get cash drawer status
  const drawerStatus = await api(testData.managerToken).get(`/orders/cash-drawer/${testData.outletId}/status`);
  if (drawerStatus.data.success) {
    pass('GET /orders/cash-drawer/:outletId/status', drawerStatus.data.data?.isOpen ? 'Open' : 'Closed'); passed++;
  } else { fail('GET /orders/cash-drawer/:outletId/status'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 8: DISCOUNTS & TAX
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 8: DISCOUNTS & TAX\n' + '─'.repeat(70));

  // Get discounts
  const discounts = await api(testData.managerToken).get(`/tax/discounts/${testData.outletId}`);
  if (discounts.data.success) {
    pass('GET /tax/discounts/:outletId', `${discounts.data.data?.length || 0} discounts`); passed++;
  } else { fail('GET /tax/discounts/:outletId'); failed++; }

  // Get service charges
  const svcCharges = await api(testData.managerToken).get(`/tax/service-charges/${testData.outletId}`);
  if (svcCharges.data.success) {
    pass('GET /tax/service-charges/:outletId'); passed++;
  } else { fail('GET /tax/service-charges/:outletId'); failed++; }

  // Get tax types
  const taxTypes = await api(testData.managerToken).get('/tax/types');
  if (taxTypes.data.success) {
    pass('GET /tax/types', `${taxTypes.data.data?.length || 0} types`); passed++;
  } else { fail('GET /tax/types'); failed++; }

  // Get tax groups
  const taxGroups = await api(testData.managerToken).get('/tax/groups');
  if (taxGroups.data.success) {
    pass('GET /tax/groups', `${taxGroups.data.data?.length || 0} groups`); passed++;
  } else { fail('GET /tax/groups'); failed++; }

  // Get time slots
  const timeSlots = await api(testData.managerToken).get(`/tax/time-slots/${testData.outletId}`);
  if (timeSlots.data.success) {
    pass('GET /tax/time-slots/:outletId'); passed++;
  } else { fail('GET /tax/time-slots/:outletId'); failed++; }

  // Get price rules
  const priceRules = await api(testData.managerToken).get(`/tax/price-rules/${testData.outletId}`);
  if (priceRules.data.success) {
    pass('GET /tax/price-rules/:outletId'); passed++;
  } else { fail('GET /tax/price-rules/:outletId'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 9: STAFF
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 9: STAFF\n' + '─'.repeat(70));

  // Get users
  const users = await api(testData.managerToken).get('/users');
  if (users.data.success) {
    pass('GET /users', `${users.data.data?.length || 0} staff`); passed++;
  } else { fail('GET /users'); failed++; }

  // Get roles
  const rolesRes = await api(testData.managerToken).get('/users/roles');
  if (rolesRes.data.success) {
    pass('GET /users/roles', `${rolesRes.data.data?.length || 0} roles`); passed++;
  } else { fail('GET /users/roles'); failed++; }

  // Create captain (manager can create captains)
  const capRes = await api(testData.managerToken).post('/users', {
    name: 'Test Captain Staff',
    employeeCode: `TCS${timestamp.toString().slice(-6)}`,
    pin: '5678',
    isActive: true,
    roles: [{ roleId: testData.roles.captain, outletId: testData.outletId }]
  });
  if (capRes.data.success) {
    testData.testCaptainId = capRes.data.data.id;
    pass('POST /users (create captain)', capRes.data.data.employeeCode); passed++;
  } else { fail('POST /users (create captain)', capRes.data.message); failed++; }

  // Get user by ID
  if (testData.testCaptainId) {
    const user = await api(testData.managerToken).get(`/users/${testData.testCaptainId}`);
    if (user.data.success) {
      pass('GET /users/:id'); passed++;
    } else { fail('GET /users/:id'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 10: REPORTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 10: REPORTS\n' + '─'.repeat(70));

  // Dashboard
  const dashboard = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/dashboard`);
  if (dashboard.data.success) {
    pass('GET /orders/reports/:outletId/dashboard'); passed++;
  } else { fail('GET /orders/reports/:outletId/dashboard'); failed++; }

  // Daily sales
  const dailySales = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/daily-sales`);
  if (dailySales.data.success) {
    pass('GET /orders/reports/:outletId/daily-sales'); passed++;
  } else { fail('GET /orders/reports/:outletId/daily-sales'); failed++; }

  // Item sales
  const itemSales = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/item-sales`);
  if (itemSales.data.success) {
    pass('GET /orders/reports/:outletId/item-sales'); passed++;
  } else { fail('GET /orders/reports/:outletId/item-sales'); failed++; }

  // Staff report
  const staffReport = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/staff`);
  if (staffReport.data.success) {
    pass('GET /orders/reports/:outletId/staff'); passed++;
  } else { fail('GET /orders/reports/:outletId/staff'); failed++; }

  // Category sales
  const catSales = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/category-sales`);
  if (catSales.data.success) {
    pass('GET /orders/reports/:outletId/category-sales'); passed++;
  } else { fail('GET /orders/reports/:outletId/category-sales'); failed++; }

  // Payment modes
  const payModes = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/payment-modes`);
  if (payModes.data.success) {
    pass('GET /orders/reports/:outletId/payment-modes'); passed++;
  } else { fail('GET /orders/reports/:outletId/payment-modes'); failed++; }

  // Tax report
  const taxReport = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/tax`);
  if (taxReport.data.success) {
    pass('GET /orders/reports/:outletId/tax'); passed++;
  } else { fail('GET /orders/reports/:outletId/tax'); failed++; }

  // Hourly sales
  const hourly = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/hourly`);
  if (hourly.data.success) {
    pass('GET /orders/reports/:outletId/hourly'); passed++;
  } else { fail('GET /orders/reports/:outletId/hourly'); failed++; }

  // Floor section report
  const floorSection = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/floor-section`);
  if (floorSection.data.success) {
    pass('GET /orders/reports/:outletId/floor-section'); passed++;
  } else { fail('GET /orders/reports/:outletId/floor-section'); failed++; }

  // Cancellation report
  const cancels = await api(testData.managerToken).get(`/orders/reports/${testData.outletId}/cancellations`);
  if (cancels.data.success) {
    pass('GET /orders/reports/:outletId/cancellations'); passed++;
  } else { fail('GET /orders/reports/:outletId/cancellations'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 11: LAYOUT (FLOORS & SECTIONS)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 11: LAYOUT\n' + '─'.repeat(70));

  // Get floors
  const floorsRes = await api(testData.managerToken).get(`/outlets/${testData.outletId}/floors`);
  if (floorsRes.data.success) {
    pass('GET /outlets/:outletId/floors', `${floorsRes.data.data?.length || 0} floors`); passed++;
  } else { fail('GET /outlets/:outletId/floors'); failed++; }

  // Get floor details
  if (testData.floorId) {
    const floorDetails = await api(testData.managerToken).get(`/outlets/floors/${testData.floorId}/details`);
    if (floorDetails.data.success) {
      pass('GET /outlets/floors/:id/details'); passed++;
    } else { fail('GET /outlets/floors/:id/details'); failed++; }
  }

  // Get sections
  const sectionsRes = await api(testData.managerToken).get(`/outlets/${testData.outletId}/sections`);
  if (sectionsRes.data.success) {
    pass('GET /outlets/:outletId/sections', `${sectionsRes.data.data?.length || 0} sections`); passed++;
  } else { fail('GET /outlets/:outletId/sections'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 12: PRINTERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 12: PRINTERS\n' + '─'.repeat(70));

  // Get printers
  const printers = await api(testData.managerToken).get(`/printers/outlet/${testData.outletId}`);
  if (printers.data.success) {
    pass('GET /printers/outlet/:outletId', `${printers.data.data?.length || 0} printers`); passed++;
  } else { fail('GET /printers/outlet/:outletId'); failed++; }

  // Get printer stats
  const printerStats = await api(testData.managerToken).get(`/printers/stats/${testData.outletId}`);
  if (printerStats.data.success) {
    pass('GET /printers/stats/:outletId'); passed++;
  } else { fail('GET /printers/stats/:outletId'); failed++; }

  // Get bridges
  const bridges = await api(testData.managerToken).get(`/printers/bridges/${testData.outletId}`);
  if (bridges.data.success) {
    pass('GET /printers/bridges/:outletId'); passed++;
  } else { fail('GET /printers/bridges/:outletId'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 13: SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 MODULE 13: SETTINGS\n' + '─'.repeat(70));

  // Get outlet
  const outlet = await api(testData.managerToken).get(`/outlets/${testData.outletId}`);
  if (outlet.data.success) {
    pass('GET /outlets/:id', outlet.data.data?.name); passed++;
  } else { fail('GET /outlets/:id'); failed++; }

  // Get outlet details
  const outletDetails = await api(testData.managerToken).get(`/outlets/${testData.outletId}/details`);
  if (outletDetails.data.success) {
    pass('GET /outlets/:id/details'); passed++;
  } else { fail('GET /outlets/:id/details'); failed++; }

  // Get kitchen stations
  const stations = await api(testData.managerToken).get(`/tax/kitchen-stations/${testData.outletId}`);
  if (stations.data.success) {
    pass('GET /tax/kitchen-stations/:outletId', `${stations.data.data?.length || 0} stations`); passed++;
  } else { fail('GET /tax/kitchen-stations/:outletId'); failed++; }

  // Get counters
  const counters = await api(testData.managerToken).get(`/tax/counters/${testData.outletId}`);
  if (counters.data.success) {
    pass('GET /tax/counters/:outletId', `${counters.data.data?.length || 0} counters`); passed++;
  } else { fail('GET /tax/counters/:outletId'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n🧹 CLEANUP\n' + '─'.repeat(70));

  if (testData.testCaptainId) {
    await api(testData.adminToken).delete(`/users/${testData.testCaptainId}`);
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
  console.log('   MANAGER MODULE APIs TEST RESULTS');
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
