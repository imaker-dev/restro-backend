/**
 * Debug script to check search functionality
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');

async function debug() {
  await initializeDatabase();
  const pool = getPool();

  console.log('='.repeat(60));
  console.log('DEBUG: Menu Search Investigation');
  console.log('='.repeat(60));

  const outletId = 4;

  // 1. Check if categories exist
  console.log('\n1. Checking categories for outlet', outletId);
  const [categories] = await pool.query(
    'SELECT id, name, is_active, deleted_at FROM categories WHERE outlet_id = ? LIMIT 10',
    [outletId]
  );
  console.log(`   Found ${categories.length} categories`);
  categories.forEach(c => console.log(`   - ${c.name} (id: ${c.id}, active: ${c.is_active}, deleted: ${c.deleted_at})`));

  // 2. Check if items exist
  console.log('\n2. Checking items for outlet', outletId);
  const [items] = await pool.query(
    'SELECT id, name, short_name, category_id, is_active, is_available, deleted_at FROM items WHERE outlet_id = ? LIMIT 10',
    [outletId]
  );
  console.log(`   Found ${items.length} items`);
  items.forEach(i => console.log(`   - ${i.name} (short: ${i.short_name}, active: ${i.is_active}, available: ${i.is_available}, deleted: ${i.deleted_at})`));

  // 3. Check what outlets exist
  console.log('\n3. Checking all outlets');
  const [outlets] = await pool.query('SELECT id, name FROM outlets LIMIT 5');
  outlets.forEach(o => console.log(`   - Outlet ${o.id}: ${o.name}`));

  // 4. Check items across all outlets
  console.log('\n4. Sample items across all outlets');
  const [allItems] = await pool.query(
    'SELECT i.id, i.name, i.short_name, i.outlet_id, i.is_active, i.is_available FROM items i WHERE i.is_active = 1 AND i.deleted_at IS NULL LIMIT 10'
  );
  allItems.forEach(i => console.log(`   - [Outlet ${i.outlet_id}] ${i.name} (short: ${i.short_name})`));

  // 5. Check categories across all outlets
  console.log('\n5. Sample categories across all outlets');
  const [allCats] = await pool.query(
    'SELECT id, name, outlet_id, is_active FROM categories WHERE is_active = 1 AND deleted_at IS NULL LIMIT 10'
  );
  allCats.forEach(c => console.log(`   - [Outlet ${c.outlet_id}] ${c.name}`));

  // 6. Check if items have correct outlet_id
  console.log('\n6. Items count per outlet');
  const [itemCounts] = await pool.query(
    `SELECT outlet_id, COUNT(*) as count FROM items WHERE is_active = 1 AND deleted_at IS NULL GROUP BY outlet_id`
  );
  itemCounts.forEach(c => console.log(`   - Outlet ${c.outlet_id}: ${c.count} items`));

  // 7. Test the actual search query with a known item
  if (allItems.length > 0) {
    const testItem = allItems[0];
    const testOutlet = testItem.outlet_id;
    const searchTerm = testItem.name.substring(0, 4);
    
    console.log(`\n7. Testing search with: "${searchTerm}" on outlet ${testOutlet}`);
    
    const [searchResults] = await pool.query(
      `SELECT DISTINCT i.id, i.name, i.short_name, c.name as category_name
       FROM items i
       JOIN categories c ON i.category_id = c.id
       WHERE i.outlet_id = ? AND i.is_active = 1 AND i.is_available = 1 AND i.deleted_at IS NULL
       AND (i.name LIKE ? OR i.short_name LIKE ?)
       LIMIT 5`,
      [testOutlet, `%${searchTerm}%`, `%${searchTerm}%`]
    );
    console.log(`   Found ${searchResults.length} results`);
    searchResults.forEach(r => console.log(`   - ${r.name} (${r.category_name})`));
  }

  // 8. Check variants
  console.log('\n8. Sample variants');
  const [variants] = await pool.query(
    'SELECT v.id, v.name, v.item_id, i.name as item_name FROM variants v JOIN items i ON v.item_id = i.id LIMIT 5'
  );
  variants.forEach(v => console.log(`   - ${v.name} (for item: ${v.item_name})`));

  // 9. Test the menuEngineService.searchItems directly
  console.log('\n9. Testing menuEngineService.searchItems directly');
  const menuEngineService = require('../services/menuEngine.service');
  
  const testSearches = ['paneer', 'naan', 'Breads', 'B.Naan', 'chicken'];
  for (const term of testSearches) {
    try {
      const result = await menuEngineService.searchItems(4, term, { limit: 10 });
      console.log(`   Search "${term}": ${result.totalCategories} categories, ${result.totalItems} items`);
      if (result.matchingCategories.length > 0) {
        console.log(`      Categories: ${result.matchingCategories.map(c => c.name).join(', ')}`);
      }
      if (result.matchingItems.length > 0) {
        console.log(`      Items: ${result.matchingItems.slice(0, 3).map(i => i.name).join(', ')}${result.matchingItems.length > 3 ? '...' : ''}`);
      }
    } catch (err) {
      console.log(`   Search "${term}": ERROR - ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(60));

  process.exit(0);
}

debug().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
