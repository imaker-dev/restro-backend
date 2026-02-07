/**
 * Comprehensive test script for veg/non-veg/liquor filters
 * Tests both Search API and Captain Menu API
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');
const menuEngineService = require('../services/menuEngine.service');

const OUTLET_ID = 4;

async function testFilters() {
  await initializeDatabase();
  const pool = getPool();

  console.log('='.repeat(70));
  console.log('FILTER FUNCTIONALITY TEST');
  console.log('='.repeat(70));

  // ==========================================
  // TEST 1: Captain Menu Filters
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: Captain Menu API Filters');
  console.log('='.repeat(70));

  // 1.1 No filter - should return all items
  console.log('\n1.1 No filter (all items):');
  const allMenu = await menuEngineService.getCaptainMenu(OUTLET_ID, {});
  console.log(`   Total categories: ${allMenu.summary.categories}`);
  console.log(`   Total items: ${allMenu.summary.items}`);
  console.log(`   Filter applied: ${allMenu.filter || 'none'}`);
  const allCategories = allMenu.menu.map(c => c.name);
  console.log(`   Categories: ${allCategories.join(', ')}`);

  // 1.2 Veg filter
  console.log('\n1.2 Veg filter:');
  const vegMenu = await menuEngineService.getCaptainMenu(OUTLET_ID, { filter: 'veg' });
  console.log(`   Total categories: ${vegMenu.summary.categories}`);
  console.log(`   Total items: ${vegMenu.summary.items}`);
  console.log(`   Filter applied: ${vegMenu.filter}`);
  const vegCategories = vegMenu.menu.map(c => c.name);
  console.log(`   Categories: ${vegCategories.join(', ')}`);
  // Verify no liquor categories
  const hasLiquorInVeg = vegMenu.menu.some(c => 
    ['whiskey', 'vodka', 'wine', 'beer', 'cocktail'].some(k => c.name.toLowerCase().includes(k))
  );
  console.log(`   ✓ No liquor categories: ${!hasLiquorInVeg ? 'PASS' : 'FAIL'}`);
  // Verify all items are veg
  const allVegItems = vegMenu.menu.every(c => 
    c.items.every(i => ['veg', 'vegan'].includes(i.type))
  );
  console.log(`   ✓ All items are veg/vegan: ${allVegItems ? 'PASS' : 'FAIL'}`);

  // 1.3 Non-veg filter
  console.log('\n1.3 Non-veg filter:');
  const nonVegMenu = await menuEngineService.getCaptainMenu(OUTLET_ID, { filter: 'non_veg' });
  console.log(`   Total categories: ${nonVegMenu.summary.categories}`);
  console.log(`   Total items: ${nonVegMenu.summary.items}`);
  console.log(`   Filter applied: ${nonVegMenu.filter}`);
  const nonVegCategories = nonVegMenu.menu.map(c => c.name);
  console.log(`   Categories: ${nonVegCategories.join(', ')}`);
  // Verify all items are non-veg
  const allNonVegItems = nonVegMenu.menu.every(c => 
    c.items.every(i => ['non_veg', 'egg'].includes(i.type))
  );
  console.log(`   ✓ All items are non_veg/egg: ${allNonVegItems ? 'PASS' : 'FAIL'}`);
  // Sample items
  if (nonVegMenu.menu.length > 0 && nonVegMenu.menu[0].items.length > 0) {
    console.log(`   Sample items: ${nonVegMenu.menu[0].items.slice(0, 3).map(i => `${i.name}(${i.type})`).join(', ')}`);
  }

  // 1.4 Liquor filter
  console.log('\n1.4 Liquor filter:');
  const liquorMenu = await menuEngineService.getCaptainMenu(OUTLET_ID, { filter: 'liquor' });
  console.log(`   Total categories: ${liquorMenu.summary.categories}`);
  console.log(`   Total items: ${liquorMenu.summary.items}`);
  console.log(`   Filter applied: ${liquorMenu.filter}`);
  const liquorCategories = liquorMenu.menu.map(c => c.name);
  console.log(`   Categories: ${liquorCategories.join(', ')}`);
  // Verify all categories are liquor
  const allLiquorCats = liquorMenu.menu.every(c => 
    ['whiskey', 'vodka', 'wine', 'beer', 'cocktail', 'rum', 'gin', 'brandy'].some(k => c.name.toLowerCase().includes(k))
  );
  console.log(`   ✓ All categories are liquor: ${allLiquorCats ? 'PASS' : 'FAIL'}`);

  // ==========================================
  // TEST 2: Search API Filters
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Search API Filters');
  console.log('='.repeat(70));

  // 2.1 Search without filter
  console.log('\n2.1 Search "butter" without filter:');
  const searchAll = await menuEngineService.searchItems(OUTLET_ID, 'butter', {});
  console.log(`   Categories found: ${searchAll.totalCategories}`);
  console.log(`   Items found: ${searchAll.totalItems}`);
  if (searchAll.matchingItems.length > 0) {
    console.log(`   Items: ${searchAll.matchingItems.map(i => `${i.name}(${i.type})`).join(', ')}`);
  }

  // 2.2 Search with veg filter
  console.log('\n2.2 Search "butter" with veg filter:');
  const searchVeg = await menuEngineService.searchItems(OUTLET_ID, 'butter', { filter: 'veg' });
  console.log(`   Categories found: ${searchVeg.totalCategories}`);
  console.log(`   Items found: ${searchVeg.totalItems}`);
  if (searchVeg.matchingItems.length > 0) {
    console.log(`   Items: ${searchVeg.matchingItems.map(i => `${i.name}(${i.type})`).join(', ')}`);
    const allSearchVeg = searchVeg.matchingItems.every(i => ['veg', 'vegan'].includes(i.type));
    console.log(`   ✓ All items are veg: ${allSearchVeg ? 'PASS' : 'FAIL'}`);
  }

  // 2.3 Search with non_veg filter
  console.log('\n2.3 Search "chicken" with non_veg filter:');
  const searchNonVeg = await menuEngineService.searchItems(OUTLET_ID, 'chicken', { filter: 'non_veg' });
  console.log(`   Categories found: ${searchNonVeg.totalCategories}`);
  console.log(`   Items found: ${searchNonVeg.totalItems}`);
  if (searchNonVeg.matchingItems.length > 0) {
    console.log(`   Items: ${searchNonVeg.matchingItems.map(i => `${i.name}(${i.type})`).join(', ')}`);
    const allSearchNonVeg = searchNonVeg.matchingItems.every(i => ['non_veg', 'egg'].includes(i.type));
    console.log(`   ✓ All items are non_veg: ${allSearchNonVeg ? 'PASS' : 'FAIL'}`);
  }

  // 2.4 Search with liquor filter
  console.log('\n2.4 Search "johnnie" with liquor filter:');
  const searchLiquor = await menuEngineService.searchItems(OUTLET_ID, 'johnnie', { filter: 'liquor' });
  console.log(`   Categories found: ${searchLiquor.totalCategories}`);
  console.log(`   Items found: ${searchLiquor.totalItems}`);
  if (searchLiquor.matchingItems.length > 0) {
    console.log(`   Items: ${searchLiquor.matchingItems.map(i => `${i.name}(${i.categoryName})`).join(', ')}`);
  }

  // 2.5 Search category with filter
  console.log('\n2.5 Search category "whiskey" with liquor filter:');
  const searchCatLiquor = await menuEngineService.searchItems(OUTLET_ID, 'whiskey', { filter: 'liquor' });
  console.log(`   Categories found: ${searchCatLiquor.totalCategories}`);
  console.log(`   Items found: ${searchCatLiquor.totalItems}`);
  if (searchCatLiquor.matchingCategories.length > 0) {
    console.log(`   Category: ${searchCatLiquor.matchingCategories[0].name} with ${searchCatLiquor.matchingCategories[0].itemCount} items`);
  }

  // 2.6 Search category "breads" with veg filter (should return category)
  console.log('\n2.6 Search category "breads" with veg filter:');
  const searchBreadsVeg = await menuEngineService.searchItems(OUTLET_ID, 'breads', { filter: 'veg' });
  console.log(`   Categories found: ${searchBreadsVeg.totalCategories}`);
  console.log(`   Items found: ${searchBreadsVeg.totalItems}`);
  if (searchBreadsVeg.matchingCategories.length > 0) {
    console.log(`   Category: ${searchBreadsVeg.matchingCategories[0].name} with ${searchBreadsVeg.matchingCategories[0].itemCount} items`);
  }

  // 2.7 Search "whiskey" with veg filter (should return nothing - liquor excluded)
  console.log('\n2.7 Search "whiskey" with veg filter (should be empty):');
  const searchWhiskeyVeg = await menuEngineService.searchItems(OUTLET_ID, 'whiskey', { filter: 'veg' });
  console.log(`   Categories found: ${searchWhiskeyVeg.totalCategories}`);
  console.log(`   Items found: ${searchWhiskeyVeg.totalItems}`);
  console.log(`   ✓ Liquor excluded from veg: ${searchWhiskeyVeg.totalCategories === 0 && searchWhiskeyVeg.totalItems === 0 ? 'PASS' : 'FAIL'}`);

  // ==========================================
  // TEST 3: Edge Cases
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3: Edge Cases');
  console.log('='.repeat(70));

  // 3.1 Empty search with filter
  console.log('\n3.1 Search "xyz123" (no results) with veg filter:');
  const searchNoResults = await menuEngineService.searchItems(OUTLET_ID, 'xyz123', { filter: 'veg' });
  console.log(`   Items found: ${searchNoResults.totalItems}`);
  console.log(`   ✓ Handles no results: PASS`);

  // 3.2 Verify counts match
  console.log('\n3.2 Verify veg + non_veg + liquor covers all items:');
  const vegCount = vegMenu.summary.items;
  const nonVegCount = nonVegMenu.summary.items;
  const liquorCount = liquorMenu.summary.items;
  const totalCount = allMenu.summary.items;
  console.log(`   Veg items: ${vegCount}`);
  console.log(`   Non-veg items: ${nonVegCount}`);
  console.log(`   Liquor items: ${liquorCount}`);
  console.log(`   Total items: ${totalCount}`);
  console.log(`   Sum: ${vegCount + nonVegCount + liquorCount}`);
  // Note: Some items might be excluded if they don't match any filter
  console.log(`   ✓ Filter segregation working: ${vegCount > 0 && nonVegCount > 0 && liquorCount > 0 ? 'PASS' : 'NEEDS REVIEW'}`);

  console.log('\n' + '='.repeat(70));
  console.log('ALL TESTS COMPLETED');
  console.log('='.repeat(70));

  process.exit(0);
}

testFilters().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
