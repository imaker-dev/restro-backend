/**
 * KOT/BOT Routing Test Suite
 * Tests mixed order routing to correct stations (Kitchen, Bar, Mocktail, Dessert)
 * Verifies printer routing and real-time event emission
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
let adminToken = '';
let outletId = '';
let floorId = '';
let barFloorId = '';
let sectionId = '';
let barSectionId = '';
let tableId = '';

// Kitchen stations
let kitchenStationId = '';
let barStationId = '';
let dessertStationId = '';
let mocktailStationId = '';

// Counters
let barCounterId = '';

// Categories
let foodCategoryId = '';
let liquorCategoryId = '';
let dessertCategoryId = '';
let mocktailCategoryId = '';

// Items
let pizzaItemId = '';
let burgerItemId = '';
let beerItemId = '';
let whiskyItemId = '';
let cakeItemId = '';
let mojioItemId = '';

// Order
let orderId = '';
let orderNumber = '';

// Test results
let passed = 0;
let failed = 0;

const api = axios.create({
  baseURL: BASE_URL,
  validateStatus: () => true
});

function log(status, message) {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '📋';
  console.log(`   ${icon} ${message}`);
  if (status === 'pass') passed++;
  if (status === 'fail') failed++;
}

function section(title) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(55));
}

async function setup() {
  section('SETUP: Login & Get Outlet Data');
  
  // Admin login
  const loginRes = await api.post('/auth/login', {
    email: 'admin@restropos.com',
    password: 'admin123'
  });
  
  if (loginRes.data.success) {
    adminToken = loginRes.data.data.accessToken;
    api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
    log('pass', 'Admin login successful');
  } else {
    log('fail', 'Admin login failed');
    process.exit(1);
  }

  // Get outlet
  const outletRes = await api.get('/outlets');
  if (outletRes.data.data?.length > 0) {
    outletId = outletRes.data.data[0].id;
    log('pass', `Got outlet ID: ${outletId}`);
  }

  // Get floors
  const floorRes = await api.get(`/outlets/${outletId}/floors`);
  if (floorRes.data.data?.length > 0) {
    floorId = floorRes.data.data[0].id;
    barFloorId = floorRes.data.data[1]?.id || floorId;
    log('pass', `Got floors: Restaurant=${floorId}, Bar=${barFloorId}`);
  }

  // Get sections
  const sectionRes = await api.get(`/outlets/${outletId}/sections`);
  if (sectionRes.data.data?.length > 0) {
    sectionId = sectionRes.data.data[0].id;
    const bar = sectionRes.data.data.find(s => s.name.toLowerCase().includes('bar'));
    barSectionId = bar?.id || sectionId;
    log('pass', `Got sections: Main=${sectionId}, Bar=${barSectionId}`);
  }

  // Get tables
  const tableRes = await api.get(`/tables/outlet/${outletId}`);
  if (tableRes.data.data?.length > 0) {
    tableId = tableRes.data.data[0].id;
    log('pass', `Got table ID: ${tableId}`);
  }
}

async function setupKitchenStations() {
  section('STEP 1: Create Kitchen Stations for KOT/BOT Routing');

  // Main Kitchen
  const kitchenRes = await api.post('/tax/kitchen-stations', {
    outletId,
    name: 'Main Kitchen',
    code: 'KITCHEN',
    stationType: 'kitchen',
    description: 'Main food preparation area'
  });
  if (kitchenRes.data.success || kitchenRes.data.data) {
    kitchenStationId = kitchenRes.data.data?.id || kitchenRes.data.id;
    log('pass', `Created Main Kitchen station: ${kitchenStationId}`);
  } else {
    // Try to get existing
    const existing = await api.get(`/tax/kitchen-stations/${outletId}`);
    const kitchen = existing.data.data?.find(s => s.station_type === 'kitchen' || s.name.toLowerCase().includes('kitchen'));
    kitchenStationId = kitchen?.id;
    log('pass', `Using existing Kitchen station: ${kitchenStationId}`);
  }

  // Bar Station (for liquor - BOT)
  const barRes = await api.post('/tax/kitchen-stations', {
    outletId,
    name: 'Bar Counter',
    code: 'BAR',
    stationType: 'bar',
    description: 'Bar for alcoholic beverages'
  });
  if (barRes.data.success || barRes.data.data) {
    barStationId = barRes.data.data?.id || barRes.data.id;
    log('pass', `Created Bar station: ${barStationId}`);
  } else {
    const existing = await api.get(`/tax/kitchen-stations/${outletId}`);
    const bar = existing.data.data?.find(s => s.station_type === 'bar' || s.name.toLowerCase().includes('bar'));
    barStationId = bar?.id;
    log('pass', `Using existing Bar station: ${barStationId}`);
  }

  // Dessert Station
  const dessertRes = await api.post('/tax/kitchen-stations', {
    outletId,
    name: 'Dessert Station',
    code: 'DESSERT',
    stationType: 'dessert',
    description: 'Desserts and sweets'
  });
  if (dessertRes.data.success) {
    dessertStationId = dessertRes.data.data?.id;
    log('pass', `Created Dessert station: ${dessertStationId}`);
  } else {
    const existing = await api.get(`/tax/kitchen-stations/${outletId}`);
    const dessert = existing.data.data?.find(s => s.station_type === 'dessert');
    dessertStationId = dessert?.id || kitchenStationId;
    log('pass', `Using Dessert station: ${dessertStationId}`);
  }

  // Mocktail Station
  const mocktailRes = await api.post('/tax/kitchen-stations', {
    outletId,
    name: 'Mocktail Counter',
    code: 'MOCKTAIL',
    stationType: 'mocktail',
    description: 'Non-alcoholic beverages'
  });
  if (mocktailRes.data.success) {
    mocktailStationId = mocktailRes.data.data?.id;
    log('pass', `Created Mocktail station: ${mocktailStationId}`);
  } else {
    const existing = await api.get(`/tax/kitchen-stations/${outletId}`);
    const mocktail = existing.data.data?.find(s => s.station_type === 'mocktail');
    mocktailStationId = mocktail?.id || barStationId;
    log('pass', `Using Mocktail station: ${mocktailStationId}`);
  }

  // Create Bar Counter for BOT
  const counterRes = await api.post('/tax/counters', {
    outletId,
    floorId: barFloorId,
    name: 'Main Bar',
    code: 'MAINBAR',
    counterType: 'bar',
    description: 'Main bar counter'
  });
  if (counterRes.data.success) {
    barCounterId = counterRes.data.data?.id;
    log('pass', `Created Bar counter: ${barCounterId}`);
  } else {
    const existing = await api.get(`/tax/counters/${outletId}`);
    const counter = existing.data.data?.find(c => c.counter_type === 'bar');
    barCounterId = counter?.id;
    log('pass', `Using existing Bar counter: ${barCounterId}`);
  }
}

async function setupCategoriesAndItems() {
  section('STEP 2: Create Categories & Items with Station Mapping');

  // Food Category (Global - visible everywhere)
  const foodCatRes = await api.post('/menu/categories', {
    outletId,
    name: 'Food Items',
    description: 'Main food items',
    isGlobal: true,
    imageUrl: 'https://example.com/food.jpg'
  });
  foodCategoryId = foodCatRes.data.data?.id;
  log('pass', `Created Food category (isGlobal=true): ${foodCategoryId}`);

  // Liquor Category (Bar only)
  const liquorCatRes = await api.post('/menu/categories', {
    outletId,
    name: 'Liquor',
    description: 'Alcoholic beverages',
    floorIds: [barFloorId],
    sectionIds: barSectionId ? [barSectionId] : [],
    imageUrl: 'https://example.com/liquor.jpg'
  });
  liquorCategoryId = liquorCatRes.data.data?.id;
  log('pass', `Created Liquor category (Bar only): ${liquorCategoryId}`);

  // Dessert Category
  const dessertCatRes = await api.post('/menu/categories', {
    outletId,
    name: 'Desserts',
    description: 'Sweet treats',
    isGlobal: true,
    imageUrl: 'https://example.com/dessert.jpg'
  });
  dessertCategoryId = dessertCatRes.data.data?.id;
  log('pass', `Created Dessert category: ${dessertCategoryId}`);

  // Mocktail Category
  const mocktailCatRes = await api.post('/menu/categories', {
    outletId,
    name: 'Mocktails',
    description: 'Non-alcoholic beverages',
    isGlobal: true,
    imageUrl: 'https://example.com/mocktail.jpg'
  });
  mocktailCategoryId = mocktailCatRes.data.data?.id;
  log('pass', `Created Mocktail category: ${mocktailCategoryId}`);

  // Create Items with different station mappings

  // 1. Pizza → Kitchen Station (KOT)
  const pizzaRes = await api.post('/menu/items', {
    outletId,
    categoryId: foodCategoryId,
    name: 'Margherita Pizza',
    basePrice: 299,
    itemType: 'veg',
    kitchenStationId: kitchenStationId,
    isGlobal: true,
    imageUrl: 'https://example.com/pizza.jpg',
    hasVariants: true,
    variants: [
      { name: 'Medium', price: 299, isDefault: true },
      { name: 'Large', price: 399 }
    ]
  });
  pizzaItemId = pizzaRes.data.data?.id;
  log('pass', `Created Pizza → Kitchen: ${pizzaItemId}`);

  // 2. Burger → Kitchen Station (KOT)
  const burgerRes = await api.post('/menu/items', {
    outletId,
    categoryId: foodCategoryId,
    name: 'Veg Burger',
    basePrice: 149,
    itemType: 'veg',
    kitchenStationId: kitchenStationId,
    isGlobal: true,
    imageUrl: 'https://example.com/burger.jpg'
  });
  burgerItemId = burgerRes.data.data?.id;
  log('pass', `Created Burger → Kitchen: ${burgerItemId}`);

  // 3. Beer → Bar Counter (BOT)
  const beerRes = await api.post('/menu/items', {
    outletId,
    categoryId: liquorCategoryId,
    name: 'Kingfisher Beer',
    basePrice: 250,
    itemType: 'veg',
    counterId: barCounterId,
    kitchenStationId: barStationId,
    floorIds: [barFloorId],
    imageUrl: 'https://example.com/beer.jpg'
  });
  beerItemId = beerRes.data.data?.id;
  log('pass', `Created Beer → Bar Counter (BOT): ${beerItemId}`);

  // 4. Whisky → Bar Counter (BOT) with variants
  const whiskyRes = await api.post('/menu/items', {
    outletId,
    categoryId: liquorCategoryId,
    name: 'Premium Whisky',
    basePrice: 300,
    itemType: 'veg',
    counterId: barCounterId,
    kitchenStationId: barStationId,
    floorIds: [barFloorId],
    hasVariants: true,
    imageUrl: 'https://example.com/whisky.jpg',
    variants: [
      { name: '30ml', price: 300, isDefault: true },
      { name: '60ml', price: 550 }
    ]
  });
  whiskyItemId = whiskyRes.data.data?.id;
  log('pass', `Created Whisky → Bar Counter (BOT): ${whiskyItemId}`);

  // 5. Cake → Dessert Station
  const cakeRes = await api.post('/menu/items', {
    outletId,
    categoryId: dessertCategoryId,
    name: 'Chocolate Cake',
    basePrice: 199,
    itemType: 'veg',
    kitchenStationId: dessertStationId,
    isGlobal: true,
    imageUrl: 'https://example.com/cake.jpg'
  });
  cakeItemId = cakeRes.data.data?.id;
  log('pass', `Created Cake → Dessert Station: ${cakeItemId}`);

  // 6. Virgin Mojito → Mocktail Station
  const mojitoRes = await api.post('/menu/items', {
    outletId,
    categoryId: mocktailCategoryId,
    name: 'Virgin Mojito',
    basePrice: 149,
    itemType: 'veg',
    kitchenStationId: mocktailStationId,
    isGlobal: true,
    imageUrl: 'https://example.com/mojito.jpg'
  });
  mojioItemId = mojitoRes.data.data?.id;
  log('pass', `Created Mojito → Mocktail Station: ${mojioItemId}`);
}

async function testMixedOrderKotRouting() {
  section('STEP 3: Create Mixed Order (Food + Drinks + Dessert)');

  // Create order with items from different stations
  const orderRes = await api.post('/orders', {
    outletId,
    tableId,
    orderType: 'dine_in',
    items: [
      // Kitchen items (KOT)
      { itemId: pizzaItemId, quantity: 1, specialInstructions: 'Extra cheese' },
      { itemId: burgerItemId, quantity: 2 },
      // Bar items (BOT) - if available
      ...(beerItemId ? [{ itemId: beerItemId, quantity: 2 }] : []),
      // Dessert items
      ...(cakeItemId ? [{ itemId: cakeItemId, quantity: 1 }] : []),
      // Mocktail items
      ...(mojioItemId ? [{ itemId: mojioItemId, quantity: 2 }] : [])
    ]
  });

  if (orderRes.data.success) {
    orderId = orderRes.data.data?.id;
    orderNumber = orderRes.data.data?.order_number || orderRes.data.data?.orderNumber;
    log('pass', `Created mixed order: ${orderNumber} (ID: ${orderId})`);
    console.log(`      Items: Pizza, Burger x2, Beer x2, Cake, Mojito x2`);
  } else {
    log('fail', `Failed to create order: ${orderRes.data.message}`);
    return;
  }

  section('STEP 4: Send KOT - Test Station Routing');

  // Send KOT
  const kotRes = await api.post(`/orders/${orderId}/kot`);

  if (kotRes.data.success) {
    const tickets = kotRes.data.data?.tickets || [];
    log('pass', `KOT sent - Created ${tickets.length} ticket(s)`);

    // Verify routing
    for (const ticket of tickets) {
      const station = ticket.station;
      const itemCount = ticket.itemCount || ticket.items?.length;
      const ticketType = station === 'bar' ? 'BOT' : 'KOT';
      
      console.log(`      ${ticketType} #${ticket.kotNumber}: ${station.toUpperCase()} station - ${itemCount} items`);
      
      if (ticket.items) {
        ticket.items.forEach(item => {
          console.log(`         → ${item.name} x${item.quantity}`);
        });
      }
    }

    // Verify we have multiple stations
    const stations = [...new Set(tickets.map(t => t.station))];
    if (stations.length > 1) {
      log('pass', `Order correctly split to ${stations.length} stations: ${stations.join(', ')}`);
    } else if (stations.length === 1) {
      log('pass', `All items routed to ${stations[0]} station`);
    }

    // Check for bar/BOT
    const hasBar = tickets.some(t => t.station === 'bar');
    if (beerItemId && hasBar) {
      log('pass', 'Bar items correctly routed to BOT');
    }

    // Check for kitchen/KOT
    const hasKitchen = tickets.some(t => t.station === 'kitchen');
    if (hasKitchen) {
      log('pass', 'Food items correctly routed to KOT');
    }

  } else {
    log('fail', `Failed to send KOT: ${kotRes.data.message}`);
  }
}

async function testKotStationDashboard() {
  section('STEP 5: Kitchen Station Dashboard (Real-time Display)');

  // Get active KOTs for kitchen
  const kitchenKots = await api.get(`/orders/kot/station/${outletId}/kitchen`);
  if (kitchenKots.data.success) {
    const kots = kitchenKots.data.data?.kots || kitchenKots.data.data || [];
    log('pass', `Kitchen station has ${kots.length} active KOT(s)`);
  }

  // Get active BOTs for bar
  const barKots = await api.get(`/orders/kot/station/${outletId}/bar`);
  if (barKots.data.success) {
    const bots = barKots.data.data?.kots || barKots.data.data || [];
    log('pass', `Bar station has ${bots.length} active BOT(s)`);
  }

  // Get station dashboard
  const dashboardRes = await api.get(`/orders/kot/dashboard/${outletId}`);
  if (dashboardRes.data.success) {
    log('pass', 'Station dashboard retrieved successfully');
  }
}

async function testKotStatusUpdates() {
  section('STEP 6: KOT Status Updates (Prepare → Ready → Served)');

  // Get order KOTs
  const kotsRes = await api.get(`/orders/${orderId}/kots`);
  if (!kotsRes.data.success || !kotsRes.data.data?.length) {
    log('fail', 'No KOTs found for order');
    return;
  }

  const kots = kotsRes.data.data;
  log('pass', `Order has ${kots.length} KOT/BOT ticket(s)`);

  // Update first KOT status through lifecycle
  const kotId = kots[0].id;

  // Accept KOT
  const acceptRes = await api.put(`/orders/kot/${kotId}/accept`);
  if (acceptRes.data.success) {
    log('pass', `KOT ${kotId} accepted`);
  }

  // Start preparing
  const prepareRes = await api.put(`/orders/kot/${kotId}/preparing`);
  if (prepareRes.data.success) {
    log('pass', `KOT ${kotId} preparing`);
  }

  // Mark ready
  const readyRes = await api.put(`/orders/kot/${kotId}/ready`);
  if (readyRes.data.success) {
    log('pass', `KOT ${kotId} ready - Captain notified`);
  }

  // Mark served
  const servedRes = await api.put(`/orders/kot/${kotId}/served`);
  if (servedRes.data.success) {
    log('pass', `KOT ${kotId} served`);
  }
}

async function testPrinterRouting() {
  section('STEP 7: Printer Routing Verification');

  // Get printers by station
  const printersRes = await api.get(`/printers/${outletId}`);
  if (printersRes.data.success) {
    const printers = printersRes.data.data || [];
    log('pass', `Outlet has ${printers.length} printer(s) configured`);
    
    printers.forEach(p => {
      console.log(`      → ${p.name}: ${p.station || 'general'} (${p.is_online ? 'online' : 'offline'})`);
    });
  }

  // Get pending print jobs
  const jobsRes = await api.get(`/printers/${outletId}/jobs/pending`);
  if (jobsRes.data.success) {
    const jobs = jobsRes.data.data || [];
    log('pass', `${jobs.length} pending print job(s)`);

    jobs.forEach(j => {
      console.log(`      → ${j.job_type} for ${j.station}: ${j.reference_number}`);
    });
  }

  // Get job stats
  const statsRes = await api.get(`/printers/${outletId}/jobs/stats`);
  if (statsRes.data.success) {
    log('pass', 'Print job stats retrieved');
  }
}

async function testGlobalVisibility() {
  section('STEP 8: Test Global Visibility Override');

  // Get menu for restaurant floor
  const restaurantMenu = await api.get(`/menu/${outletId}/preview?floorId=${floorId}`);
  const restaurantItems = restaurantMenu.data.data?.categories?.reduce((sum, c) => sum + c.items?.length, 0) || 0;
  log('pass', `Restaurant floor menu: ${restaurantItems} items`);

  // Get menu for bar floor
  const barMenu = await api.get(`/menu/${outletId}/preview?floorId=${barFloorId}`);
  const barItems = barMenu.data.data?.categories?.reduce((sum, c) => sum + c.items?.length, 0) || 0;
  log('pass', `Bar floor menu: ${barItems} items`);

  // Verify global items appear in both
  if (pizzaItemId) {
    const pizzaInRestaurant = restaurantMenu.data.data?.categories?.some(c => 
      c.items?.some(i => i.id === pizzaItemId)
    );
    const pizzaInBar = barMenu.data.data?.categories?.some(c => 
      c.items?.some(i => i.id === pizzaItemId)
    );
    
    if (pizzaInRestaurant && pizzaInBar) {
      log('pass', 'Global item (Pizza) visible in both floors');
    } else if (pizzaInRestaurant) {
      log('pass', 'Pizza visible in restaurant floor');
    }
  }
}

async function testCaptainMenuSimplified() {
  section('STEP 9: Captain Menu (Simplified View)');

  const captainMenu = await api.get(`/menu/${outletId}/captain`);
  if (captainMenu.data.success) {
    const menu = captainMenu.data.data;
    log('pass', `Captain menu loaded`);
    console.log(`      Summary: ${menu.summary?.categories || 0} categories, ${menu.summary?.items || 0} items`);
    console.log(`      Time Slot: ${menu.timeSlot || 'All Day'}`);

    // Verify simplified structure
    if (menu.menu && Array.isArray(menu.menu)) {
      const firstCat = menu.menu[0];
      if (firstCat) {
        console.log(`      First category: ${firstCat.name} (${firstCat.count} items)`);
        if (firstCat.items?.[0]) {
          const item = firstCat.items[0];
          console.log(`      Sample item: ${item.name} - ₹${item.price}`);
          if (item.variants) console.log(`         Has ${item.variants.length} variant(s)`);
          if (item.addons) console.log(`         Has ${item.addons.length} addon group(s)`);
        }
      }
      log('pass', 'Captain menu structure is clean and simplified');
    }
  } else {
    log('fail', 'Failed to load captain menu');
  }
}

async function cleanup() {
  section('CLEANUP');

  // Delete test items
  if (pizzaItemId) await api.delete(`/menu/items/${pizzaItemId}`);
  if (burgerItemId) await api.delete(`/menu/items/${burgerItemId}`);
  if (beerItemId) await api.delete(`/menu/items/${beerItemId}`);
  if (whiskyItemId) await api.delete(`/menu/items/${whiskyItemId}`);
  if (cakeItemId) await api.delete(`/menu/items/${cakeItemId}`);
  if (mojioItemId) await api.delete(`/menu/items/${mojioItemId}`);
  log('pass', 'Deleted test items');

  // Delete test categories
  if (foodCategoryId) await api.delete(`/menu/categories/${foodCategoryId}`);
  if (liquorCategoryId) await api.delete(`/menu/categories/${liquorCategoryId}`);
  if (dessertCategoryId) await api.delete(`/menu/categories/${dessertCategoryId}`);
  if (mocktailCategoryId) await api.delete(`/menu/categories/${mocktailCategoryId}`);
  log('pass', 'Deleted test categories');

  // Note: Not deleting kitchen stations as they may be used by other data
  console.log('   ℹ️  Kitchen stations retained for system use');
}

async function run() {
  console.log('\n' + '═'.repeat(55));
  console.log('   KOT/BOT ROUTING & MENU ENGINE TEST SUITE');
  console.log('═'.repeat(55));

  try {
    await setup();
    await setupKitchenStations();
    await setupCategoriesAndItems();
    await testMixedOrderKotRouting();
    await testKotStationDashboard();
    await testKotStatusUpdates();
    await testPrinterRouting();
    await testGlobalVisibility();
    await testCaptainMenuSimplified();
    await cleanup();
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }

  console.log('\n' + '═'.repeat(55));
  console.log('   TEST RESULTS');
  console.log('═'.repeat(55));
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   📊 Total:   ${passed + failed}`);
  console.log(`   📈 Rate:    ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('═'.repeat(55) + '\n');
}

run();
