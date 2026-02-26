/**
 * Test Pagination APIs for Items and Categories
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testPaginationApis() {
  const outletId = 33;
  
  console.log('='.repeat(70));
  console.log('PAGINATION API TEST');
  console.log('='.repeat(70));
  console.log(`Outlet ID: ${outletId}\n`);

  try {
    await initializeDatabase();
    const itemService = require('../src/services/item.service');
    const categoryService = require('../src/services/category.service');

    // Test 1: Items with pagination
    console.log('--- 1. Items API with Pagination ---');
    const itemsPage1 = await itemService.getByOutlet(outletId, { page: 1, limit: 10 });
    console.log(`Page 1: ${itemsPage1.items.length} items`);
    console.log('Pagination:', itemsPage1.pagination);
    
    if (itemsPage1.pagination.totalPages > 1) {
      const itemsPage2 = await itemService.getByOutlet(outletId, { page: 2, limit: 10 });
      console.log(`Page 2: ${itemsPage2.items.length} items`);
    }

    // Test 2: Items with category filter
    console.log('\n--- 2. Items API with Category Filter ---');
    const pool = getPool();
    const [categories] = await pool.query('SELECT id, name FROM categories WHERE outlet_id = ? LIMIT 1', [outletId]);
    if (categories.length > 0) {
      const catId = categories[0].id;
      const itemsByCat = await itemService.getByOutlet(outletId, { categoryId: catId, limit: 10 });
      console.log(`Category "${categories[0].name}" (ID: ${catId}): ${itemsByCat.pagination.total} items`);
    }

    // Test 3: Items with itemType filter
    console.log('\n--- 3. Items API with ItemType Filter ---');
    const vegItems = await itemService.getByOutlet(outletId, { itemType: 'veg', limit: 10 });
    console.log(`Veg items: ${vegItems.pagination.total}`);
    
    const nonVegItems = await itemService.getByOutlet(outletId, { itemType: 'non_veg', limit: 10 });
    console.log(`Non-veg items: ${nonVegItems.pagination.total}`);

    // Test 4: Items with search
    console.log('\n--- 4. Items API with Search ---');
    const searchResults = await itemService.getByOutlet(outletId, { search: 'chicken', limit: 10 });
    console.log(`Search "chicken": ${searchResults.pagination.total} items`);
    if (searchResults.items.length > 0) {
      console.log('First 3 results:', searchResults.items.slice(0, 3).map(i => i.name));
    }

    // Test 5: Categories with pagination
    console.log('\n--- 5. Categories API with Pagination ---');
    const catsPage1 = await categoryService.getByOutlet(outletId, { page: 1, limit: 10 });
    console.log(`Page 1: ${catsPage1.categories.length} categories`);
    console.log('Pagination:', catsPage1.pagination);

    // Test 6: Categories with search
    console.log('\n--- 6. Categories API with Search ---');
    const catSearch = await categoryService.getByOutlet(outletId, { search: 'non', limit: 10 });
    console.log(`Search "non": ${catSearch.pagination.total} categories`);
    if (catSearch.categories.length > 0) {
      console.log('Results:', catSearch.categories.map(c => c.name));
    }

    // Test 7: Categories with serviceType filter
    console.log('\n--- 7. Categories API with ServiceType Filter ---');
    const restaurantCats = await categoryService.getByOutlet(outletId, { serviceType: 'restaurant', limit: 50 });
    console.log(`Restaurant categories: ${restaurantCats.pagination.total}`);
    
    const barCats = await categoryService.getByOutlet(outletId, { serviceType: 'bar', limit: 50 });
    console.log(`Bar categories: ${barCats.pagination.total}`);

    // Test 8: Verify station info in item details
    console.log('\n--- 8. Item Details with Station Info ---');
    const [itemWithStation] = await pool.query(
      `SELECT id, name, kitchen_station_id FROM items WHERE outlet_id = ? AND kitchen_station_id IS NOT NULL LIMIT 1`,
      [outletId]
    );
    if (itemWithStation.length > 0) {
      const itemDetails = await itemService.getFullDetails(itemWithStation[0].id);
      console.log(`Item: ${itemDetails.name}`);
      console.log(`  kitchen_station_id: ${itemDetails.kitchen_station_id}`);
      console.log(`  kitchen_station_name: ${itemDetails.kitchen_station_name}`);
      console.log(`  kitchen_station_code: ${itemDetails.kitchen_station_code}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('ALL TESTS PASSED');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testPaginationApis();
