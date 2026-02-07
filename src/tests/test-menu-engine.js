/**
 * Menu Engine Complete Test Suite
 * Tests all menu-related APIs with real-world scenarios
 * 
 * Covers:
 * - Tax Setup (Types, Components, Groups - GST + VAT)
 * - Time Slots (Breakfast, Lunch, Dinner, Happy Hour)
 * - Categories with Visibility Rules
 * - Items with Variants, Addons, Tax Assignment
 * - Addon Groups and Addons
 * - Price Rules (floor-based, time-based, happy hour)
 * - Captain Menu Preview
 * - Menu Calculation with Tax
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

const testData = {
  adminToken: null,
  outletId: null,
  floorId: null,        // Restaurant Floor
  barFloorId: null,     // Bar Floor
  sectionId: null,      // Restaurant Section
  barSectionId: null,   // Bar Section
  
  // Tax
  gstTypeId: null,
  vatTypeId: null,
  cgstComponentId: null,
  sgstComponentId: null,
  vatComponentId: null,
  gst5GroupId: null,
  gst18GroupId: null,
  vatGroupId: null,
  
  // Time Slots
  breakfastSlotId: null,
  lunchSlotId: null,
  dinnerSlotId: null,
  happyHourSlotId: null,
  
  // Categories
  foodCategoryId: null,
  drinksCategoryId: null,
  dessertCategoryId: null,
  liquorCategoryId: null,
  
  // Items
  pizzaItemId: null,
  burgerItemId: null,
  beerItemId: null,
  whiskyItemId: null,
  
  // Variants
  pizzaSmallVariantId: null,
  pizzaMediumVariantId: null,
  pizzaLargeVariantId: null,
  whisky30mlVariantId: null,
  whisky60mlVariantId: null,
  
  // Addon Groups
  toppingsGroupId: null,
  extrasGroupId: null,
  
  // Addons
  cheeseAddonId: null,
  jalapenoAddonId: null,
  
  // Price Rules
  happyHourRuleId: null,
  barPremiumRuleId: null,
  
  // Kitchen Stations
  kitchenStationId: null,
  barStationId: null,
};

let passed = 0;
let failed = 0;

const pass = (name, detail = '') => {
  console.log(`   ✅ ${name}${detail ? ' - ' + detail : ''}`);
};

const fail = (name, error = '') => {
  console.log(`   ❌ ${name}${error ? ' - ' + error : ''}`);
};

const warn = (msg) => {
  console.log(`   ⚠️  ${msg}`);
};

const api = (token) => ({
  get: async (url) => {
    try {
      const res = await axios.get(`${BASE_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { data: res.data, status: res.status };
    } catch (err) {
      return { data: err.response?.data || { success: false }, status: err.response?.status || 500 };
    }
  },
  post: async (url, data) => {
    try {
      const res = await axios.post(`${BASE_URL}${url}`, data, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      return { data: res.data, status: res.status };
    } catch (err) {
      return { data: err.response?.data || { success: false }, status: err.response?.status || 500 };
    }
  },
  put: async (url, data) => {
    try {
      const res = await axios.put(`${BASE_URL}${url}`, data, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      return { data: res.data, status: res.status };
    } catch (err) {
      return { data: err.response?.data || { success: false }, status: err.response?.status || 500 };
    }
  },
  delete: async (url) => {
    try {
      const res = await axios.delete(`${BASE_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { data: res.data, status: res.status };
    } catch (err) {
      return { data: err.response?.data || { success: false }, status: err.response?.status || 500 };
    }
  }
});

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('   MENU ENGINE COMPLETE TEST SUITE');
  console.log('   Testing Dynamic Menu with GST/VAT, Variants, Addons, Price Rules');
  console.log('═'.repeat(70));

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP - Admin Login & Get Outlet/Floor/Section Info
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n🔧 SETUP\n' + '─'.repeat(70));

  try {
    const login = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@restropos.com',
      password: 'admin123'
    });
    testData.adminToken = login.data.data.accessToken;
    console.log('   Admin logged in');
  } catch (err) {
    console.log('   ❌ Admin login failed:', err.message);
    return;
  }

  // Get outlet
  const outlets = await api(testData.adminToken).get('/outlets');
  if (outlets.data.data?.length > 0) {
    testData.outletId = outlets.data.data[0].id;
    console.log(`   Outlet: ${outlets.data.data[0].name} (ID: ${testData.outletId})`);
  }

  // Get floors
  const floors = await api(testData.adminToken).get(`/outlets/${testData.outletId}/floors`);
  if (floors.data.data?.length > 0) {
    testData.floorId = floors.data.data[0].id;
    if (floors.data.data.length > 1) testData.barFloorId = floors.data.data[1].id;
    console.log(`   Floors: ${floors.data.data.map(f => f.name).join(', ')}`);
  }

  // Get sections
  const sections = await api(testData.adminToken).get(`/outlets/${testData.outletId}/sections`);
  if (sections.data.data?.length > 0) {
    testData.sectionId = sections.data.data[0].id;
    const barSection = sections.data.data.find(s => s.name.toLowerCase().includes('bar'));
    if (barSection) testData.barSectionId = barSection.id;
    console.log(`   Sections: ${sections.data.data.map(s => s.name).join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: TAX SETUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 1: TAX SETUP (GST + VAT)\n' + '─'.repeat(70));

  // 1A. Get existing tax types
  const existingTypes = await api(testData.adminToken).get('/tax/types');
  if (existingTypes.data.success) {
    pass('GET /tax/types', `${existingTypes.data.data?.length || 0} existing types`); passed++;
    
    // Find or create GST type
    const gstType = existingTypes.data.data?.find(t => t.code === 'GST' || t.name.includes('GST'));
    const vatType = existingTypes.data.data?.find(t => t.code === 'VAT' || t.name.includes('VAT'));
    
    if (gstType) testData.gstTypeId = gstType.id;
    if (vatType) testData.vatTypeId = vatType.id;
  } else { fail('GET /tax/types'); failed++; }

  // 1B. Create GST Type if not exists
  if (!testData.gstTypeId) {
    const gstType = await api(testData.adminToken).post('/tax/types', {
      name: 'GST',
      code: 'GST',
      description: 'Goods and Services Tax'
    });
    if (gstType.data.success) {
      testData.gstTypeId = gstType.data.data.id;
      pass('POST /tax/types (GST)', `ID: ${testData.gstTypeId}`); passed++;
    } else { fail('POST /tax/types (GST)', gstType.data.message); failed++; }
  } else {
    pass('GST Type exists', `ID: ${testData.gstTypeId}`); passed++;
  }

  // 1C. Create VAT Type if not exists
  if (!testData.vatTypeId) {
    const vatType = await api(testData.adminToken).post('/tax/types', {
      name: 'VAT',
      code: 'VAT',
      description: 'Value Added Tax for Liquor'
    });
    if (vatType.data.success) {
      testData.vatTypeId = vatType.data.data.id;
      pass('POST /tax/types (VAT)', `ID: ${testData.vatTypeId}`); passed++;
    } else { fail('POST /tax/types (VAT)', vatType.data.message); failed++; }
  } else {
    pass('VAT Type exists', `ID: ${testData.vatTypeId}`); passed++;
  }

  // 1D. Get/Create Tax Components
  const existingComponents = await api(testData.adminToken).get('/tax/components');
  if (existingComponents.data.success) {
    pass('GET /tax/components', `${existingComponents.data.data?.length || 0} components`); passed++;
    
    const cgst = existingComponents.data.data?.find(c => c.code === 'CGST');
    const sgst = existingComponents.data.data?.find(c => c.code === 'SGST');
    const vat = existingComponents.data.data?.find(c => c.code === 'VAT18');
    
    if (cgst) testData.cgstComponentId = cgst.id;
    if (sgst) testData.sgstComponentId = sgst.id;
    if (vat) testData.vatComponentId = vat.id;
  } else { fail('GET /tax/components'); failed++; }

  // Create CGST if not exists
  if (!testData.cgstComponentId && testData.gstTypeId) {
    const cgst = await api(testData.adminToken).post('/tax/components', {
      taxTypeId: testData.gstTypeId,
      name: 'CGST',
      code: 'CGST',
      rate: 2.5,
      description: 'Central GST 2.5%'
    });
    if (cgst.data.success) {
      testData.cgstComponentId = cgst.data.data.id;
      pass('POST /tax/components (CGST 2.5%)', `ID: ${testData.cgstComponentId}`); passed++;
    } else { fail('POST /tax/components (CGST)', cgst.data.message); failed++; }
  }

  // Create SGST if not exists
  if (!testData.sgstComponentId && testData.gstTypeId) {
    const sgst = await api(testData.adminToken).post('/tax/components', {
      taxTypeId: testData.gstTypeId,
      name: 'SGST',
      code: 'SGST',
      rate: 2.5,
      description: 'State GST 2.5%'
    });
    if (sgst.data.success) {
      testData.sgstComponentId = sgst.data.data.id;
      pass('POST /tax/components (SGST 2.5%)', `ID: ${testData.sgstComponentId}`); passed++;
    } else { fail('POST /tax/components (SGST)', sgst.data.message); failed++; }
  }

  // Create VAT component if not exists
  if (!testData.vatComponentId && testData.vatTypeId) {
    const vat = await api(testData.adminToken).post('/tax/components', {
      taxTypeId: testData.vatTypeId,
      name: 'VAT 18%',
      code: 'VAT18',
      rate: 18,
      description: 'Value Added Tax 18% for Liquor'
    });
    if (vat.data.success) {
      testData.vatComponentId = vat.data.data.id;
      pass('POST /tax/components (VAT 18%)', `ID: ${testData.vatComponentId}`); passed++;
    } else { fail('POST /tax/components (VAT)', vat.data.message); failed++; }
  }

  // 1E. Get/Create Tax Groups
  const existingGroups = await api(testData.adminToken).get('/tax/groups');
  if (existingGroups.data.success) {
    pass('GET /tax/groups', `${existingGroups.data.data?.length || 0} groups`); passed++;
    
    const gst5 = existingGroups.data.data?.find(g => g.name.includes('5%') || g.code === 'GST5');
    const gst18 = existingGroups.data.data?.find(g => g.name.includes('18%') && g.name.includes('GST'));
    const vatGroup = existingGroups.data.data?.find(g => g.name.includes('VAT') || g.name.includes('Liquor'));
    
    if (gst5) testData.gst5GroupId = gst5.id;
    if (gst18) testData.gst18GroupId = gst18.id;
    if (vatGroup) testData.vatGroupId = vatGroup.id;
  } else { fail('GET /tax/groups'); failed++; }

  // Create GST 5% Group (Restaurant Food)
  if (!testData.gst5GroupId && testData.cgstComponentId && testData.sgstComponentId) {
    const gst5 = await api(testData.adminToken).post('/tax/groups', {
      outletId: testData.outletId,
      name: 'Restaurant GST 5%',
      code: 'GST5',
      description: 'GST for restaurant food (CGST 2.5% + SGST 2.5%)',
      isInclusive: false,
      componentIds: [testData.cgstComponentId, testData.sgstComponentId]
    });
    if (gst5.data.success) {
      testData.gst5GroupId = gst5.data.data.id;
      pass('POST /tax/groups (GST 5%)', `ID: ${testData.gst5GroupId}`); passed++;
    } else { fail('POST /tax/groups (GST 5%)', gst5.data.message); failed++; }
  }

  // Create VAT Group (Liquor)
  if (!testData.vatGroupId && testData.vatComponentId) {
    const vatGrp = await api(testData.adminToken).post('/tax/groups', {
      outletId: testData.outletId,
      name: 'Liquor VAT 18%',
      code: 'VAT18',
      description: 'VAT for liquor items',
      isInclusive: false,
      componentIds: [testData.vatComponentId]
    });
    if (vatGrp.data.success) {
      testData.vatGroupId = vatGrp.data.data.id;
      pass('POST /tax/groups (Liquor VAT)', `ID: ${testData.vatGroupId}`); passed++;
    } else { fail('POST /tax/groups (Liquor VAT)', vatGrp.data.message); failed++; }
  }

  // Verify tax group details
  if (testData.gst5GroupId) {
    const groupDetails = await api(testData.adminToken).get(`/tax/groups/${testData.gst5GroupId}`);
    if (groupDetails.data.success) {
      pass('GET /tax/groups/:id', `Components: ${groupDetails.data.data?.components?.length || 0}`); passed++;
    } else { fail('GET /tax/groups/:id'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: TIME SLOTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 2: TIME SLOTS\n' + '─'.repeat(70));

  // Get existing time slots
  const existingSlots = await api(testData.adminToken).get(`/tax/time-slots/${testData.outletId}`);
  if (existingSlots.data.success) {
    pass('GET /tax/time-slots/:outletId', `${existingSlots.data.data?.length || 0} slots`); passed++;
    
    // Map existing slots
    const breakfast = existingSlots.data.data?.find(s => s.name.toLowerCase().includes('breakfast'));
    const lunch = existingSlots.data.data?.find(s => s.name.toLowerCase().includes('lunch'));
    const dinner = existingSlots.data.data?.find(s => s.name.toLowerCase().includes('dinner'));
    const happy = existingSlots.data.data?.find(s => s.name.toLowerCase().includes('happy'));
    
    if (breakfast) testData.breakfastSlotId = breakfast.id;
    if (lunch) testData.lunchSlotId = lunch.id;
    if (dinner) testData.dinnerSlotId = dinner.id;
    if (happy) testData.happyHourSlotId = happy.id;
  } else { fail('GET /tax/time-slots/:outletId'); failed++; }

  // Create time slots if not exist
  const slotsToCreate = [
    { name: 'Breakfast', startTime: '07:00:00', endTime: '11:00:00', idKey: 'breakfastSlotId' },
    { name: 'Lunch', startTime: '11:00:00', endTime: '16:00:00', idKey: 'lunchSlotId' },
    { name: 'Dinner', startTime: '18:00:00', endTime: '23:00:00', idKey: 'dinnerSlotId' },
    { name: 'Happy Hour', startTime: '16:00:00', endTime: '19:00:00', idKey: 'happyHourSlotId' }
  ];

  for (const slot of slotsToCreate) {
    if (!testData[slot.idKey]) {
      const newSlot = await api(testData.adminToken).post('/tax/time-slots', {
        outletId: testData.outletId,
        name: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        activeDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      });
      if (newSlot.data.success) {
        testData[slot.idKey] = newSlot.data.data.id;
        pass(`POST /tax/time-slots (${slot.name})`, `ID: ${testData[slot.idKey]}`); passed++;
      } else {
        warn(`${slot.name} slot may already exist`);
      }
    }
  }

  // Get current time slot
  const currentSlot = await api(testData.adminToken).get(`/tax/time-slots/${testData.outletId}/current`);
  if (currentSlot.data.success) {
    pass('GET /tax/time-slots/:outletId/current', currentSlot.data.data?.name || 'No active slot'); passed++;
  } else { fail('GET /tax/time-slots/:outletId/current'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: KITCHEN STATIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 3: KITCHEN STATIONS\n' + '─'.repeat(70));

  const existingStations = await api(testData.adminToken).get(`/tax/kitchen-stations/${testData.outletId}`);
  if (existingStations.data.success) {
    pass('GET /tax/kitchen-stations/:outletId', `${existingStations.data.data?.length || 0} stations`); passed++;
    
    const kitchen = existingStations.data.data?.find(s => s.name.toLowerCase().includes('kitchen'));
    const bar = existingStations.data.data?.find(s => s.name.toLowerCase().includes('bar'));
    
    if (kitchen) testData.kitchenStationId = kitchen.id;
    if (bar) testData.barStationId = bar.id;
  } else { fail('GET /tax/kitchen-stations/:outletId'); failed++; }

  // Create kitchen station if not exists
  if (!testData.kitchenStationId) {
    const kitchen = await api(testData.adminToken).post('/tax/kitchen-stations', {
      outletId: testData.outletId,
      name: 'Main Kitchen',
      code: 'KITCHEN',
      description: 'Main kitchen for food preparation'
    });
    if (kitchen.data.success) {
      testData.kitchenStationId = kitchen.data.data.id;
      pass('POST /tax/kitchen-stations (Kitchen)', `ID: ${testData.kitchenStationId}`); passed++;
    }
  }

  // Create bar station if not exists
  if (!testData.barStationId) {
    const bar = await api(testData.adminToken).post('/tax/kitchen-stations', {
      outletId: testData.outletId,
      name: 'Bar Station',
      code: 'BAR',
      description: 'Bar for drinks and cocktails'
    });
    if (bar.data.success) {
      testData.barStationId = bar.data.data.id;
      pass('POST /tax/kitchen-stations (Bar)', `ID: ${testData.barStationId}`); passed++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: CATEGORIES WITH VISIBILITY RULES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 4: CATEGORIES WITH VISIBILITY RULES\n' + '─'.repeat(70));

  // Get existing categories
  const existingCats = await api(testData.adminToken).get(`/menu/categories/outlet/${testData.outletId}`);
  if (existingCats.data.success) {
    pass('GET /menu/categories/outlet/:outletId', `${existingCats.data.data?.length || 0} categories`); passed++;
  } else { fail('GET /menu/categories/outlet/:outletId'); failed++; }

  // Create Food Category (Restaurant, Lunch + Dinner)
  const foodCat = await api(testData.adminToken).post('/menu/categories', {
    outletId: testData.outletId,
    name: 'Test Main Course',
    description: 'Main course food items',
    displayOrder: 1,
    floorIds: testData.floorId ? [testData.floorId] : [],
    sectionIds: testData.sectionId ? [testData.sectionId] : [],
    timeSlotIds: [testData.lunchSlotId, testData.dinnerSlotId].filter(Boolean)
  });
  if (foodCat.data.success) {
    testData.foodCategoryId = foodCat.data.data.id;
    pass('POST /menu/categories (Food)', `ID: ${testData.foodCategoryId}`); passed++;
    console.log('      Visibility: Restaurant Floor, Lunch + Dinner');
  } else { fail('POST /menu/categories (Food)', foodCat.data.message); failed++; }

  // Create Drinks Category (All areas)
  const drinksCat = await api(testData.adminToken).post('/menu/categories', {
    outletId: testData.outletId,
    name: 'Test Beverages',
    description: 'Non-alcoholic beverages',
    displayOrder: 2
  });
  if (drinksCat.data.success) {
    testData.drinksCategoryId = drinksCat.data.data.id;
    pass('POST /menu/categories (Drinks)', `ID: ${testData.drinksCategoryId}`); passed++;
    console.log('      Visibility: All floors, All times');
  } else { fail('POST /menu/categories (Drinks)', drinksCat.data.message); failed++; }

  // Create Desserts Category (Lunch + Dinner only)
  const dessertCat = await api(testData.adminToken).post('/menu/categories', {
    outletId: testData.outletId,
    name: 'Test Desserts',
    description: 'Sweet treats',
    displayOrder: 3,
    timeSlotIds: [testData.lunchSlotId, testData.dinnerSlotId].filter(Boolean)
  });
  if (dessertCat.data.success) {
    testData.dessertCategoryId = dessertCat.data.data.id;
    pass('POST /menu/categories (Desserts)', `ID: ${testData.dessertCategoryId}`); passed++;
    console.log('      Visibility: Lunch + Dinner only');
  } else { fail('POST /menu/categories (Desserts)', dessertCat.data.message); failed++; }

  // Create Liquor Category (Bar only)
  const liquorCat = await api(testData.adminToken).post('/menu/categories', {
    outletId: testData.outletId,
    name: 'Test Liquor',
    description: 'Alcoholic beverages - Bar only',
    displayOrder: 4,
    floorIds: testData.barFloorId ? [testData.barFloorId] : [],
    sectionIds: testData.barSectionId ? [testData.barSectionId] : []
  });
  if (liquorCat.data.success) {
    testData.liquorCategoryId = liquorCat.data.data.id;
    pass('POST /menu/categories (Liquor)', `ID: ${testData.liquorCategoryId}`); passed++;
    console.log('      Visibility: Bar floor/section only');
  } else { fail('POST /menu/categories (Liquor)', liquorCat.data.message); failed++; }

  // Get category tree
  const catTree = await api(testData.adminToken).get(`/menu/categories/outlet/${testData.outletId}/tree`);
  if (catTree.data.success) {
    pass('GET /menu/categories/outlet/:outletId/tree'); passed++;
  } else { fail('GET /menu/categories/outlet/:outletId/tree'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: ADDON GROUPS AND ADDONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 5: ADDON GROUPS AND ADDONS\n' + '─'.repeat(70));

  // Create Toppings Addon Group (Required, multiple selection)
  const toppingsGroup = await api(testData.adminToken).post('/menu/addon-groups', {
    outletId: testData.outletId,
    name: 'Pizza Toppings',
    description: 'Extra toppings for pizza',
    selectionType: 'multiple',
    minSelection: 0,
    maxSelection: 5,
    isRequired: false
  });
  if (toppingsGroup.data.success) {
    testData.toppingsGroupId = toppingsGroup.data.data.id;
    pass('POST /menu/addon-groups (Toppings)', `ID: ${testData.toppingsGroupId}`); passed++;
  } else { fail('POST /menu/addon-groups (Toppings)', toppingsGroup.data.message); failed++; }

  // Create Extras Addon Group (Single selection)
  const extrasGroup = await api(testData.adminToken).post('/menu/addon-groups', {
    outletId: testData.outletId,
    name: 'Meal Extras',
    description: 'Extra sides with meal',
    selectionType: 'single',
    minSelection: 0,
    maxSelection: 1,
    isRequired: false
  });
  if (extrasGroup.data.success) {
    testData.extrasGroupId = extrasGroup.data.data.id;
    pass('POST /menu/addon-groups (Extras)', `ID: ${testData.extrasGroupId}`); passed++;
  } else { fail('POST /menu/addon-groups (Extras)', extrasGroup.data.message); failed++; }

  // Get addon groups
  const addonGroups = await api(testData.adminToken).get(`/menu/addon-groups/outlet/${testData.outletId}`);
  if (addonGroups.data.success) {
    pass('GET /menu/addon-groups/outlet/:outletId', `${addonGroups.data.data?.length || 0} groups`); passed++;
  } else { fail('GET /menu/addon-groups/outlet/:outletId'); failed++; }

  // Create addons for toppings group
  if (testData.toppingsGroupId) {
    const cheese = await api(testData.adminToken).post('/menu/addons', {
      addonGroupId: testData.toppingsGroupId,
      name: 'Extra Cheese',
      price: 50,
      itemType: 'veg'
    });
    if (cheese.data.success) {
      testData.cheeseAddonId = cheese.data.data.id;
      pass('POST /menu/addons (Cheese)', `₹50`); passed++;
    } else { fail('POST /menu/addons (Cheese)', cheese.data.message); failed++; }

    const jalapeno = await api(testData.adminToken).post('/menu/addons', {
      addonGroupId: testData.toppingsGroupId,
      name: 'Jalapenos',
      price: 30,
      itemType: 'veg'
    });
    if (jalapeno.data.success) {
      testData.jalapenoAddonId = jalapeno.data.data.id;
      pass('POST /menu/addons (Jalapeno)', `₹30`); passed++;
    } else { fail('POST /menu/addons (Jalapeno)', jalapeno.data.message); failed++; }

    // Get addons by group
    const addons = await api(testData.adminToken).get(`/menu/addons/group/${testData.toppingsGroupId}`);
    if (addons.data.success) {
      pass('GET /menu/addons/group/:groupId', `${addons.data.data?.length || 0} addons`); passed++;
    } else { fail('GET /menu/addons/group/:groupId'); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: ITEMS WITH VARIANTS, ADDONS, TAX
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 6: ITEMS WITH VARIANTS, ADDONS, TAX\n' + '─'.repeat(70));

  // Create Pizza Item with Variants
  if (testData.foodCategoryId) {
    const pizza = await api(testData.adminToken).post('/menu/items', {
      outletId: testData.outletId,
      categoryId: testData.foodCategoryId,
      name: 'Test Margherita Pizza',
      description: 'Classic pizza with tomato sauce and mozzarella',
      itemType: 'veg',
      basePrice: 299,
      taxGroupId: testData.gst5GroupId,
      hasVariants: true,
      hasAddons: true,
      allowSpecialNotes: true,
      minQuantity: 1,
      maxQuantity: 10,
      kitchenStationId: testData.kitchenStationId,
      floorIds: testData.floorId ? [testData.floorId] : [],
      sectionIds: testData.sectionId ? [testData.sectionId] : [],
      addonGroupIds: testData.toppingsGroupId ? [testData.toppingsGroupId] : [],
      variants: [
        { name: 'Small (8")', price: 299, isDefault: true },
        { name: 'Medium (10")', price: 399 },
        { name: 'Large (12")', price: 499 }
      ]
    });
    if (pizza.data.success) {
      testData.pizzaItemId = pizza.data.data.id;
      pass('POST /menu/items (Pizza with Variants)', `ID: ${testData.pizzaItemId}`); passed++;
      console.log('      Variants: Small ₹299, Medium ₹399, Large ₹499');
      console.log('      Tax: GST 5%');
      console.log('      Addons: Pizza Toppings');
      
      // Get variants
      const variants = await api(testData.adminToken).get(`/menu/items/${testData.pizzaItemId}/variants`);
      if (variants.data.success && variants.data.data?.length > 0) {
        testData.pizzaSmallVariantId = variants.data.data.find(v => v.name.includes('Small'))?.id;
        testData.pizzaMediumVariantId = variants.data.data.find(v => v.name.includes('Medium'))?.id;
        testData.pizzaLargeVariantId = variants.data.data.find(v => v.name.includes('Large'))?.id;
        pass('GET /menu/items/:itemId/variants', `${variants.data.data.length} variants`); passed++;
      }
    } else { fail('POST /menu/items (Pizza)', pizza.data.message); failed++; }
  }

  // Create Burger Item (Simple, no variants)
  if (testData.foodCategoryId) {
    const burger = await api(testData.adminToken).post('/menu/items', {
      outletId: testData.outletId,
      categoryId: testData.foodCategoryId,
      name: 'Test Veg Burger',
      description: 'Classic vegetable burger',
      itemType: 'veg',
      basePrice: 199,
      taxGroupId: testData.gst5GroupId,
      hasVariants: false,
      hasAddons: false,
      kitchenStationId: testData.kitchenStationId
    });
    if (burger.data.success) {
      testData.burgerItemId = burger.data.data.id;
      pass('POST /menu/items (Burger, no variants)', `ID: ${testData.burgerItemId}`); passed++;
      console.log('      Price: ₹199, Tax: GST 5%');
    } else { fail('POST /menu/items (Burger)', burger.data.message); failed++; }
  }

  // Create Beer Item (Bar only)
  if (testData.drinksCategoryId) {
    const beer = await api(testData.adminToken).post('/menu/items', {
      outletId: testData.outletId,
      categoryId: testData.drinksCategoryId,
      name: 'Test Craft Beer',
      description: 'Premium craft beer',
      itemType: 'veg',
      basePrice: 350,
      taxGroupId: testData.vatGroupId,
      hasVariants: false,
      kitchenStationId: testData.barStationId,
      floorIds: testData.barFloorId ? [testData.barFloorId] : [],
      sectionIds: testData.barSectionId ? [testData.barSectionId] : []
    });
    if (beer.data.success) {
      testData.beerItemId = beer.data.data.id;
      pass('POST /menu/items (Beer, Bar only)', `ID: ${testData.beerItemId}`); passed++;
      console.log('      Price: ₹350, Tax: VAT 18%');
      console.log('      Visibility: Bar only');
    } else { fail('POST /menu/items (Beer)', beer.data.message); failed++; }
  }

  // Create Whisky Item with ML Variants (Bar only)
  if (testData.liquorCategoryId) {
    const whisky = await api(testData.adminToken).post('/menu/items', {
      outletId: testData.outletId,
      categoryId: testData.liquorCategoryId,
      name: 'Test Premium Whisky',
      description: 'Single malt whisky',
      itemType: 'veg',
      basePrice: 300,
      taxGroupId: testData.vatGroupId,
      hasVariants: true,
      kitchenStationId: testData.barStationId,
      floorIds: testData.barFloorId ? [testData.barFloorId] : [],
      sectionIds: testData.barSectionId ? [testData.barSectionId] : [],
      variants: [
        { name: '30ml', price: 300, isDefault: true },
        { name: '60ml', price: 550 },
        { name: '90ml', price: 750 }
      ]
    });
    if (whisky.data.success) {
      testData.whiskyItemId = whisky.data.data.id;
      pass('POST /menu/items (Whisky with ML Variants)', `ID: ${testData.whiskyItemId}`); passed++;
      console.log('      Variants: 30ml ₹300, 60ml ₹550, 90ml ₹750');
      console.log('      Tax: VAT 18%');
      
      // Get variants
      const variants = await api(testData.adminToken).get(`/menu/items/${testData.whiskyItemId}/variants`);
      if (variants.data.success && variants.data.data?.length > 0) {
        testData.whisky30mlVariantId = variants.data.data.find(v => v.name.includes('30'))?.id;
        testData.whisky60mlVariantId = variants.data.data.find(v => v.name.includes('60'))?.id;
        pass('Whisky variants loaded', `${variants.data.data.length} variants`); passed++;
      }
    } else { fail('POST /menu/items (Whisky)', whisky.data.message); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 7: ADD VARIANT TO EXISTING ITEM
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 7: ADD VARIANT TO EXISTING ITEM\n' + '─'.repeat(70));

  if (testData.pizzaItemId) {
    const xlVariant = await api(testData.adminToken).post(`/menu/items/${testData.pizzaItemId}/variants`, {
      name: 'Extra Large (14")',
      price: 599,
      isDefault: false
    });
    if (xlVariant.data.success) {
      pass('POST /menu/items/:itemId/variants (XL)', `₹599`); passed++;
    } else { fail('POST /menu/items/:itemId/variants', xlVariant.data.message); failed++; }

    // Update variant
    if (testData.pizzaMediumVariantId) {
      const updateVariant = await api(testData.adminToken).put(`/menu/variants/${testData.pizzaMediumVariantId}`, {
        price: 419
      });
      if (updateVariant.data.success) {
        pass('PUT /menu/variants/:variantId', 'Medium price updated to ₹419'); passed++;
      } else { fail('PUT /menu/variants/:variantId', updateVariant.data.message); failed++; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 8: MAP ADDON GROUPS TO ITEMS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 8: MAP ADDON GROUPS TO ITEMS\n' + '─'.repeat(70));

  if (testData.burgerItemId && testData.extrasGroupId) {
    const mapAddon = await api(testData.adminToken).post(`/menu/items/${testData.burgerItemId}/addon-groups/${testData.extrasGroupId}`);
    if (mapAddon.data.success) {
      pass('POST /menu/items/:itemId/addon-groups/:groupId', 'Extras mapped to Burger'); passed++;
    } else { fail('POST /menu/items/:itemId/addon-groups/:groupId', mapAddon.data.message); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 9: PRICE RULES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 9: PRICE RULES (Happy Hour, Bar Premium)\n' + '─'.repeat(70));

  // Get existing price rules
  const existingRules = await api(testData.adminToken).get(`/tax/price-rules/${testData.outletId}`);
  if (existingRules.data.success) {
    pass('GET /tax/price-rules/:outletId', `${existingRules.data.data?.length || 0} rules`); passed++;
  } else { fail('GET /tax/price-rules/:outletId'); failed++; }

  // Create Happy Hour Price Rule (10% discount on drinks 4-7pm)
  if (testData.beerItemId) {
    const happyRule = await api(testData.adminToken).post('/tax/price-rules', {
      outletId: testData.outletId,
      name: 'Happy Hour Beer Discount',
      description: '10% off on beer during happy hour',
      ruleType: 'happy_hour',
      itemId: testData.beerItemId,
      timeStart: '16:00:00',
      timeEnd: '19:00:00',
      adjustmentType: 'percentage',
      adjustmentValue: -10,
      priority: 10
    });
    if (happyRule.data.success) {
      testData.happyHourRuleId = happyRule.data.data.id;
      pass('POST /tax/price-rules (Happy Hour)', `10% off Beer`); passed++;
    } else { fail('POST /tax/price-rules (Happy Hour)', happyRule.data.message); failed++; }
  }

  // Create Bar Premium Rule (Bar floor has 5% markup)
  if (testData.whiskyItemId && testData.barFloorId) {
    const barPremium = await api(testData.adminToken).post('/tax/price-rules', {
      outletId: testData.outletId,
      name: 'Bar Floor Premium',
      description: '5% premium for bar floor service',
      ruleType: 'floor',
      itemId: testData.whiskyItemId,
      floorId: testData.barFloorId,
      adjustmentType: 'percentage',
      adjustmentValue: 5,
      priority: 5
    });
    if (barPremium.data.success) {
      testData.barPremiumRuleId = barPremium.data.data.id;
      pass('POST /tax/price-rules (Bar Premium)', `5% markup on Whisky`); passed++;
    } else { fail('POST /tax/price-rules (Bar Premium)', barPremium.data.message); failed++; }
  }

  // Update price rule
  if (testData.happyHourRuleId) {
    const updateRule = await api(testData.adminToken).put(`/tax/price-rules/${testData.happyHourRuleId}`, {
      adjustmentValue: -15
    });
    if (updateRule.data.success) {
      pass('PUT /tax/price-rules/:id', 'Happy Hour increased to 15%'); passed++;
    } else { fail('PUT /tax/price-rules/:id', updateRule.data.message); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 10: HAPPY HOUR SETUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 10: HAPPY HOUR SETUP\n' + '─'.repeat(70));

  const happyHour = await api(testData.adminToken).post(`/tax/happy-hour/${testData.outletId}`, {
    name: 'Evening Happy Hour',
    description: '20% off on all drinks',
    timeStart: '17:00:00',
    timeEnd: '20:00:00',
    daysOfWeek: 'monday,tuesday,wednesday,thursday,friday',
    discountPercent: 20,
    categoryIds: testData.drinksCategoryId ? [testData.drinksCategoryId] : []
  });
  if (happyHour.data.success) {
    pass('POST /tax/happy-hour/:outletId', '20% off drinks 5-8pm'); passed++;
  } else { fail('POST /tax/happy-hour/:outletId', happyHour.data.message); failed++; }

  // Get active happy hours
  const activeHappy = await api(testData.adminToken).get(`/tax/happy-hour/${testData.outletId}/active`);
  if (activeHappy.data.success) {
    pass('GET /tax/happy-hour/:outletId/active', `${activeHappy.data.data?.length || 0} active`); passed++;
  } else { fail('GET /tax/happy-hour/:outletId/active'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 11: MENU ENGINE - GET MENU WITH CONTEXT
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 11: MENU ENGINE - CAPTAIN VIEW\n' + '─'.repeat(70));

  // Get full menu
  const fullMenu = await api(testData.adminToken).get(`/menu/${testData.outletId}`);
  if (fullMenu.data.success) {
    const catCount = fullMenu.data.data?.categories?.length || 0;
    const itemCount = fullMenu.data.data?.categories?.reduce((acc, c) => acc + (c.items?.length || 0), 0) || 0;
    pass('GET /menu/:outletId (Full Menu)', `${catCount} categories, ${itemCount} items`); passed++;
  } else { fail('GET /menu/:outletId'); failed++; }

  // Get captain menu
  const captainMenu = await api(testData.adminToken).get(`/menu/${testData.outletId}/captain`);
  if (captainMenu.data.success) {
    pass('GET /menu/:outletId/captain', 'Captain simplified view'); passed++;
  } else { fail('GET /menu/:outletId/captain'); failed++; }

  // Preview menu (Admin feature)
  const previewParams = [];
  if (testData.floorId) previewParams.push(`floorId=${testData.floorId}`);
  if (testData.lunchSlotId) previewParams.push(`timeSlotId=${testData.lunchSlotId}`);
  
  const preview = await api(testData.adminToken).get(`/menu/${testData.outletId}/preview?${previewParams.join('&')}`);
  if (preview.data.success) {
    pass('GET /menu/:outletId/preview', 'Admin preview with filters'); passed++;
    console.log('      Previewing: Restaurant Floor + Lunch Time');
  } else { fail('GET /menu/:outletId/preview'); failed++; }

  // Get menu rules summary
  const rules = await api(testData.adminToken).get(`/menu/${testData.outletId}/rules`);
  if (rules.data.success) {
    pass('GET /menu/:outletId/rules', 'Visibility rules summary'); passed++;
  } else { fail('GET /menu/:outletId/rules'); failed++; }

  // Search items
  const search = await api(testData.adminToken).get(`/menu/${testData.outletId}/search?q=pizza`);
  if (search.data.success) {
    pass('GET /menu/:outletId/search', `Found ${search.data.data?.length || 0} items`); passed++;
  } else { fail('GET /menu/:outletId/search'); failed++; }

  // Get featured items
  const featured = await api(testData.adminToken).get(`/menu/${testData.outletId}/featured`);
  if (featured.data.success) {
    pass('GET /menu/:outletId/featured'); passed++;
  } else { fail('GET /menu/:outletId/featured'); failed++; }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 12: ITEM DETAILS AND CALCULATION
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 12: ITEM DETAILS AND TAX CALCULATION\n' + '─'.repeat(70));

  // Get item for order
  if (testData.pizzaItemId) {
    const orderItem = await api(testData.adminToken).get(`/menu/item/${testData.pizzaItemId}/order`);
    if (orderItem.data.success) {
      pass('GET /menu/item/:itemId/order', 'Order-ready item data'); passed++;
    } else { fail('GET /menu/item/:itemId/order'); failed++; }

    // Get full item details
    const itemDetails = await api(testData.adminToken).get(`/menu/items/${testData.pizzaItemId}/details`);
    if (itemDetails.data.success) {
      pass('GET /menu/items/:id/details', 'Full details with variants/addons'); passed++;
    } else { fail('GET /menu/items/:id/details'); failed++; }
  }

  // Calculate item total with tax
  if (testData.pizzaItemId && testData.pizzaLargeVariantId) {
    const calculate = await api(testData.adminToken).post('/menu/calculate', {
      itemId: testData.pizzaItemId,
      variantId: testData.pizzaLargeVariantId,
      quantity: 2,
      addons: [testData.cheeseAddonId, testData.jalapenoAddonId].filter(Boolean)
    });
    if (calculate.data.success) {
      const calc = calculate.data.data;
      pass('POST /menu/calculate', 'Price calculated with tax'); passed++;
      console.log(`      Item: Large Pizza × 2`);
      console.log(`      Base: ₹${calc.baseTotal || calc.subtotal}`);
      console.log(`      Addons: ₹${calc.addonsTotal || 0}`);
      console.log(`      Tax: ₹${calc.taxAmount || 0}`);
      console.log(`      Total: ₹${calc.grandTotal || calc.total}`);
    } else { fail('POST /menu/calculate', calculate.data.message); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 13: UPDATE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n📋 STEP 13: UPDATE OPERATIONS\n' + '─'.repeat(70));

  // Update category visibility
  if (testData.dessertCategoryId) {
    const updateCat = await api(testData.adminToken).put(`/menu/categories/${testData.dessertCategoryId}`, {
      timeSlotIds: [testData.dinnerSlotId].filter(Boolean)
    });
    if (updateCat.data.success) {
      pass('PUT /menu/categories/:id', 'Desserts now Dinner only'); passed++;
    } else { fail('PUT /menu/categories/:id', updateCat.data.message); failed++; }
  }

  // Update item
  if (testData.burgerItemId) {
    const updateItem = await api(testData.adminToken).put(`/menu/items/${testData.burgerItemId}`, {
      basePrice: 219,
      isRecommended: true,
      isBestseller: true
    });
    if (updateItem.data.success) {
      pass('PUT /menu/items/:id', 'Burger price ₹219, marked bestseller'); passed++;
    } else { fail('PUT /menu/items/:id', updateItem.data.message); failed++; }
  }

  // Update addon
  if (testData.cheeseAddonId) {
    const updateAddon = await api(testData.adminToken).put(`/menu/addons/${testData.cheeseAddonId}`, {
      price: 60
    });
    if (updateAddon.data.success) {
      pass('PUT /menu/addons/:id', 'Extra Cheese now ₹60'); passed++;
    } else { fail('PUT /menu/addons/:id', updateAddon.data.message); failed++; }
  }

  // Update addon group
  if (testData.toppingsGroupId) {
    const updateGroup = await api(testData.adminToken).put(`/menu/addon-groups/${testData.toppingsGroupId}`, {
      maxSelection: 3
    });
    if (updateGroup.data.success) {
      pass('PUT /menu/addon-groups/:id', 'Max 3 toppings'); passed++;
    } else { fail('PUT /menu/addon-groups/:id', updateGroup.data.message); failed++; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n🧹 CLEANUP\n' + '─'.repeat(70));

  // Delete price rules
  if (testData.happyHourRuleId) {
    await api(testData.adminToken).delete(`/tax/price-rules/${testData.happyHourRuleId}`);
    console.log('   Deleted happy hour rule');
  }
  if (testData.barPremiumRuleId) {
    await api(testData.adminToken).delete(`/tax/price-rules/${testData.barPremiumRuleId}`);
    console.log('   Deleted bar premium rule');
  }

  // Delete items (this should cascade delete variants)
  if (testData.pizzaItemId) {
    await api(testData.adminToken).delete(`/menu/items/${testData.pizzaItemId}`);
    console.log('   Deleted pizza item');
  }
  if (testData.burgerItemId) {
    await api(testData.adminToken).delete(`/menu/items/${testData.burgerItemId}`);
    console.log('   Deleted burger item');
  }
  if (testData.beerItemId) {
    await api(testData.adminToken).delete(`/menu/items/${testData.beerItemId}`);
    console.log('   Deleted beer item');
  }
  if (testData.whiskyItemId) {
    await api(testData.adminToken).delete(`/menu/items/${testData.whiskyItemId}`);
    console.log('   Deleted whisky item');
  }

  // Delete addons
  if (testData.cheeseAddonId) {
    await api(testData.adminToken).delete(`/menu/addons/${testData.cheeseAddonId}`);
  }
  if (testData.jalapenoAddonId) {
    await api(testData.adminToken).delete(`/menu/addons/${testData.jalapenoAddonId}`);
  }
  console.log('   Deleted addons');

  // Delete addon groups
  if (testData.toppingsGroupId) {
    await api(testData.adminToken).delete(`/menu/addon-groups/${testData.toppingsGroupId}`);
  }
  if (testData.extrasGroupId) {
    await api(testData.adminToken).delete(`/menu/addon-groups/${testData.extrasGroupId}`);
  }
  console.log('   Deleted addon groups');

  // Delete categories
  if (testData.foodCategoryId) {
    await api(testData.adminToken).delete(`/menu/categories/${testData.foodCategoryId}`);
  }
  if (testData.drinksCategoryId) {
    await api(testData.adminToken).delete(`/menu/categories/${testData.drinksCategoryId}`);
  }
  if (testData.dessertCategoryId) {
    await api(testData.adminToken).delete(`/menu/categories/${testData.dessertCategoryId}`);
  }
  if (testData.liquorCategoryId) {
    await api(testData.adminToken).delete(`/menu/categories/${testData.liquorCategoryId}`);
  }
  console.log('   Deleted test categories');

  // ═══════════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('   MENU ENGINE TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   📊 Total:   ${passed + failed}`);
  console.log(`   📈 Rate:    ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('═'.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite failed:', err.message);
  process.exit(1);
});
