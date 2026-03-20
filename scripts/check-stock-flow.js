require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const p = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // 1. Recipe for item 1595
  const [recipes] = await p.query(
    'SELECT r.id, r.name, r.menu_item_id, r.variant_id, r.is_current, r.is_active FROM recipes r WHERE r.menu_item_id = 1595'
  );
  console.log('=== Recipes for item 1595 ===');
  console.log(JSON.stringify(recipes, null, 2));

  if (recipes.length > 0) {
    const [ings] = await p.query(
      `SELECT ri.id, ri.ingredient_id, ri.quantity, ri.unit_id,
        ing.name, ing.inventory_item_id, ing.wastage_percentage, ing.yield_percentage,
        ii.current_stock, ii.average_price, ii.outlet_id,
        ru.abbreviation as recipe_unit, ru.conversion_factor as recipe_unit_cf
       FROM recipe_ingredients ri
       JOIN ingredients ing ON ri.ingredient_id = ing.id
       LEFT JOIN inventory_items ii ON ing.inventory_item_id = ii.id
       LEFT JOIN units ru ON ri.unit_id = ru.id
       WHERE ri.recipe_id = ?`,
      [recipes[0].id]
    );
    console.log('\n=== Ingredients ===');
    ings.forEach(i => console.log(`  ${i.name}: qty=${i.quantity} ${i.recipe_unit || '?'} (cf=${i.recipe_unit_cf}), inv_item=${i.inventory_item_id}, stock=${i.current_stock}, avg_price=${i.average_price}, outlet=${i.outlet_id}`));
  }

  // 2. auto_deduct_stock setting
  try {
    const [settings] = await p.query(
      "SELECT * FROM outlet_settings WHERE `key` = 'auto_deduct_stock'"
    );
    console.log('\n=== auto_deduct_stock settings ===');
    console.log(settings.length > 0 ? JSON.stringify(settings) : 'No setting found (default: enabled)');
  } catch (e) {
    console.log('\n=== auto_deduct_stock settings ===');
    console.log('TABLE MISSING:', e.message);
  }

  // 3. cost_settings
  const [costSettings] = await p.query('SELECT * FROM cost_settings');
  console.log('\n=== cost_settings ===');
  console.log(costSettings.length > 0 ? JSON.stringify(costSettings) : 'No cost_settings rows');

  // 4. Check order 940
  const [order] = await p.query('SELECT id, outlet_id, status, stock_reversed FROM orders WHERE id = 940');
  console.log('\n=== Order 940 ===');
  console.log(JSON.stringify(order));

  // 5. Order items for order 940
  const [items] = await p.query(
    'SELECT id, item_id, item_name, quantity, status, stock_deducted, cancel_reason FROM order_items WHERE order_id = 940'
  );
  console.log('\n=== Order 940 Items ===');
  items.forEach(i => console.log(`  OI#${i.id}: ${i.item_name} x${i.quantity}, status=${i.status}, stock_deducted=${i.stock_deducted}, cancel=${i.cancel_reason || '-'}`));

  // 6. Movements for order 940 items
  const itemIds = items.map(i => i.id);
  if (itemIds.length > 0) {
    const [movs] = await p.query(
      `SELECT * FROM inventory_movements WHERE reference_type = 'order_item' AND reference_id IN (?)`,
      [itemIds]
    );
    console.log('\n=== Inventory Movements for order 940 ===');
    console.log(movs.length > 0 ? JSON.stringify(movs, null, 2) : 'NO MOVEMENTS FOUND');
  }

  // 7. Cost snapshots for order 940
  const [costs] = await p.query('SELECT * FROM order_item_costs WHERE order_id = 940');
  console.log('\n=== Cost Snapshots for order 940 ===');
  console.log(costs.length > 0 ? JSON.stringify(costs, null, 2) : 'NO COST SNAPSHOTS FOUND');

  // 8. Check if order_items has stock_deducted column
  const [cols] = await p.query("SHOW COLUMNS FROM order_items LIKE 'stock_deducted'");
  console.log('\n=== stock_deducted column ===');
  console.log(cols.length > 0 ? 'EXISTS' : 'MISSING');

  // 9. Check recent server errors in logs
  console.log('\n=== Checking recent order_item_costs inserts ===');
  const [recentCosts] = await p.query('SELECT COUNT(*) as cnt FROM order_item_costs');
  console.log(`Total order_item_costs rows: ${recentCosts[0].cnt}`);

  const [recentMovs] = await p.query("SELECT COUNT(*) as cnt FROM inventory_movements WHERE movement_type = 'sale'");
  console.log(`Total sale movements: ${recentMovs[0].cnt}`);

  await p.end();
})();
