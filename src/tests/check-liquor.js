require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');

async function check() {
  await initializeDatabase();
  const pool = getPool();

  // Check liquor categories
  const liquorKeywords = ['whiskey', 'vodka', 'wine', 'cocktails', 'beer', 'rum', 'gin', 'brandy', 'liquor', 'alcohol', 'spirits'];
  
  const [cats] = await pool.query('SELECT id, name FROM categories WHERE outlet_id = 4 AND is_active = 1');
  console.log('All categories:');
  cats.forEach(c => {
    const isLiquor = liquorKeywords.some(k => c.name.toLowerCase().includes(k));
    console.log(`  - ${c.id}: ${c.name} ${isLiquor ? '[LIQUOR]' : ''}`);
  });

  // Check items in liquor categories
  const [liquorItems] = await pool.query(`
    SELECT i.name, i.item_type, c.name as cat_name 
    FROM items i 
    JOIN categories c ON i.category_id = c.id 
    WHERE i.outlet_id = 4 AND i.is_active = 1 
    AND (c.name LIKE '%whiskey%' OR c.name LIKE '%vodka%' OR c.name LIKE '%wine%' OR c.name LIKE '%cocktail%' OR c.name LIKE '%beer%')
    LIMIT 10
  `);
  console.log('\nLiquor category items:');
  liquorItems.forEach(i => console.log(`  - ${i.name} | ${i.item_type} | ${i.cat_name}`));

  // Check veg items
  const [vegItems] = await pool.query(`SELECT name, item_type FROM items WHERE outlet_id = 4 AND is_active = 1 AND item_type IN ('veg', 'vegan') LIMIT 5`);
  console.log('\nVeg items sample:');
  vegItems.forEach(i => console.log(`  - ${i.name} | ${i.item_type}`));

  // Check non-veg items
  const [nonVegItems] = await pool.query(`SELECT name, item_type FROM items WHERE outlet_id = 4 AND is_active = 1 AND item_type IN ('non_veg', 'egg') LIMIT 5`);
  console.log('\nNon-veg items sample:');
  nonVegItems.forEach(i => console.log(`  - ${i.name} | ${i.item_type}`));

  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
