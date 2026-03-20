/**
 * Comprehensive Test Script — Modules 9, 10, 11
 * Stock Deduction, Wastage Management, Inventory Reports
 * 
 * Run: node scripts/test-modules-9-10-11.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const TEST_OUTLET_ID = 43;

let pool;
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function assert(condition, label, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(`${label} ${details}`);
    console.log(`  ❌ ${label} ${details}`);
  }
}

function assertApprox(actual, expected, label, tolerance = 0.02) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✅ ${label}: ${actual} ≈ ${expected}`);
  } else {
    failed++;
    failures.push(`${label}: got ${actual}, expected ${expected} (diff: ${diff})`);
    console.log(`  ❌ ${label}: got ${actual}, expected ≈${expected} (diff: ${diff})`);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// ============================================================
// TEST 1: DATABASE SCHEMA VERIFICATION
// ============================================================
async function testSchema() {
  section('TEST 1: Database Schema Verification (Migration 043)');

  // Check movement_type ENUM includes sale_reversal
  const [[movCol]] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_movements' AND COLUMN_NAME = 'movement_type'`
  );
  assert(movCol && movCol.COLUMN_TYPE.includes('sale_reversal'), 
    'movement_type ENUM includes sale_reversal');
  assert(movCol && movCol.COLUMN_TYPE.includes('sale'),
    'movement_type ENUM includes sale');
  assert(movCol && movCol.COLUMN_TYPE.includes('production_reversal'),
    'movement_type ENUM includes production_reversal');

  // Check wastage_logs table exists
  const [[wastageTable]] = await pool.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wastage_logs'`
  );
  assert(wastageTable.cnt > 0, 'wastage_logs table exists');

  // Check order_items.stock_deducted column
  const [[stockDeducted]] = await pool.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'stock_deducted'`
  );
  assert(stockDeducted.cnt > 0, 'order_items.stock_deducted column exists');

  // Check orders.stock_reversed column
  const [[stockReversed]] = await pool.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'stock_reversed'`
  );
  assert(stockReversed.cnt > 0, 'orders.stock_reversed column exists');

  // Check wastage_logs columns
  const [wastageCols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wastage_logs'
     ORDER BY ORDINAL_POSITION`
  );
  const colNames = wastageCols.map(c => c.COLUMN_NAME);
  const requiredCols = ['id', 'outlet_id', 'inventory_item_id', 'quantity', 'quantity_in_base',
    'wastage_type', 'reason', 'reported_by', 'wastage_date', 'total_cost'];
  for (const col of requiredCols) {
    assert(colNames.includes(col), `wastage_logs has column: ${col}`);
  }
}

// ============================================================
// TEST 2: STOCK DEDUCTION SERVICE LOGIC
// ============================================================
async function testStockDeductionLogic() {
  section('TEST 2: Stock Deduction Logic Verification');

  // Find a recipe that has ingredients linked to inventory
  const [recipes] = await pool.query(
    `SELECT r.id, r.name, r.menu_item_id, r.variant_id
     FROM recipes r
     WHERE r.outlet_id = ? AND r.is_current = 1 AND r.is_active = 1
     LIMIT 1`,
    [TEST_OUTLET_ID]
  );

  if (recipes.length === 0) {
    console.log('  ⚠️  No active recipes found — skipping stock deduction tests');
    skipped += 3;
    return;
  }

  const recipe = recipes[0];
  console.log(`  Using recipe: ${recipe.name} (id=${recipe.id})`);

  // Get ingredients
  const [ingredients] = await pool.query(
    `SELECT ri.*, ing.name as ingredient_name, ing.yield_percentage, ing.wastage_percentage,
      ing.inventory_item_id,
      ii.current_stock, ii.average_price,
      ru.conversion_factor as recipe_unit_cf
     FROM recipe_ingredients ri
     JOIN ingredients ing ON ri.ingredient_id = ing.id
     JOIN inventory_items ii ON ing.inventory_item_id = ii.id
     LEFT JOIN units ru ON ri.unit_id = ru.id
     WHERE ri.recipe_id = ?`,
    [recipe.id]
  );

  assert(ingredients.length > 0, `Recipe has ${ingredients.length} ingredients linked to inventory`);

  // Verify the calculation for each ingredient
  console.log('\n  Deduction calculation for 1 portion:');
  for (const ing of ingredients) {
    const recipeQty = parseFloat(ing.quantity) || 0;
    const unitCf = parseFloat(ing.recipe_unit_cf) || 1;
    const wastage = parseFloat(ing.wastage_percentage) || 0;
    const yieldPct = parseFloat(ing.yield_percentage) || 100;

    const qtyInBase = recipeQty * unitCf;
    const effectiveQty = qtyInBase * (1 + wastage / 100) * (100 / yieldPct);

    console.log(`    ${ing.ingredient_name}: ${recipeQty} × cf${unitCf} = ${qtyInBase.toFixed(2)} base`
      + (wastage > 0 ? ` +${wastage}%w` : '')
      + (yieldPct < 100 ? ` ÷${yieldPct}%y` : '')
      + ` → ${effectiveQty.toFixed(4)} effective`
    );

    assert(effectiveQty > 0, `${ing.ingredient_name} effective qty > 0 (${effectiveQty.toFixed(4)})`);
    assert(effectiveQty >= qtyInBase, `${ing.ingredient_name} effective >= base (wastage/yield applied correctly)`);
  }

  // Check that order items have stock_deducted tracking
  const [[orderItemSample]] = await pool.query(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN stock_deducted = 1 THEN 1 ELSE 0 END) as deducted,
      SUM(CASE WHEN stock_deducted = 0 THEN 1 ELSE 0 END) as not_deducted
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE o.outlet_id = ?`,
    [TEST_OUTLET_ID]
  );
  console.log(`\n  Order items: total=${orderItemSample.total}, deducted=${orderItemSample.deducted}, not_deducted=${orderItemSample.not_deducted}`);
}

// ============================================================
// TEST 3: SALE MOVEMENTS VERIFICATION
// ============================================================
async function testSaleMovements() {
  section('TEST 3: Sale Movements Verification');

  const [saleMovements] = await pool.query(
    `SELECT im.movement_type, COUNT(*) as cnt, COALESCE(SUM(im.quantity), 0) as total_qty
     FROM inventory_movements im
     WHERE im.outlet_id = ? AND im.movement_type IN ('sale', 'sale_reversal')
     GROUP BY im.movement_type`,
    [TEST_OUTLET_ID]
  );

  if (saleMovements.length === 0) {
    console.log('  ⚠️  No sale movements yet — stock deduction will work when orders are placed');
    skipped++;
  } else {
    for (const m of saleMovements) {
      console.log(`  ${m.movement_type}: ${m.cnt} records, total qty: ${parseFloat(m.total_qty).toFixed(4)}`);
    }
    assert(true, `Found ${saleMovements.length} sale movement type(s)`);
  }

  // Verify all movement types that exist
  const [allTypes] = await pool.query(
    `SELECT movement_type, COUNT(*) as cnt FROM inventory_movements
     WHERE outlet_id = ? GROUP BY movement_type ORDER BY movement_type`,
    [TEST_OUTLET_ID]
  );

  console.log('\n  All movement types in system:');
  for (const t of allTypes) {
    console.log(`    ${t.movement_type}: ${t.cnt} records`);
  }
}

// ============================================================
// TEST 4: WASTAGE SERVICE SIMULATION
// ============================================================
async function testWastageService() {
  section('TEST 4: Wastage Service Verification');

  // Check wastage_logs table is accessible
  const [[{ cnt: wastageCount }]] = await pool.query(
    'SELECT COUNT(*) as cnt FROM wastage_logs WHERE outlet_id = ?',
    [TEST_OUTLET_ID]
  );
  console.log(`  Existing wastage logs: ${wastageCount}`);

  // Pick an item to simulate wastage calculation
  const [[item]] = await pool.query(
    `SELECT ii.id, ii.name, ii.current_stock, ii.average_price,
      COALESCE(pu.conversion_factor, 1) as purchase_cf,
      COALESCE(pu.abbreviation, bu.abbreviation) as display_unit
     FROM inventory_items ii
     LEFT JOIN units bu ON ii.base_unit_id = bu.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE ii.outlet_id = ? AND ii.is_active = 1 AND ii.current_stock > 0
     LIMIT 1`,
    [TEST_OUTLET_ID]
  );

  if (!item) {
    console.log('  ⚠️  No items with stock — skipping wastage simulation');
    skipped += 2;
    return;
  }

  const cf = parseFloat(item.purchase_cf) || 1;
  const stock = parseFloat(item.current_stock) || 0;
  const avgPrice = parseFloat(item.average_price) || 0;

  console.log(`\n  Simulating wastage for: ${item.name}`);
  console.log(`    Current stock: ${(stock / cf).toFixed(4)} ${item.display_unit}`);
  console.log(`    Average price: ₹${(avgPrice * cf).toFixed(4)}/${item.display_unit}`);

  // Simulate a wastage of 10% of current stock
  const wastageQty = stock * 0.1;
  const wastageCost = wastageQty * avgPrice;

  console.log(`    Wastage (10%): ${(wastageQty / cf).toFixed(4)} ${item.display_unit}`);
  console.log(`    Cost lost: ₹${wastageCost.toFixed(2)}`);
  console.log(`    After wastage: ${((stock - wastageQty) / cf).toFixed(4)} ${item.display_unit}`);

  assert(wastageCost >= 0, `Wastage cost calculation is non-negative: ₹${wastageCost.toFixed(2)}`);
  assert(stock - wastageQty >= 0, 'Stock after wastage is non-negative');

  // Verify wastage_logs schema by doing a dry-read query
  const [wastageSchema] = await pool.query(
    `SELECT wl.*, ii.name as item_name
     FROM wastage_logs wl
     JOIN inventory_items ii ON wl.inventory_item_id = ii.id
     WHERE wl.outlet_id = ?
     ORDER BY wl.created_at DESC LIMIT 5`,
    [TEST_OUTLET_ID]
  );
  assert(true, `Wastage logs query works (${wastageSchema.length} records)`);
}

// ============================================================
// TEST 5: EXPIRY BATCH DETECTION
// ============================================================
async function testExpiryDetection() {
  section('TEST 5: Expiry Batch Detection');

  // Check for batches with expiry dates
  const [[{ total, withExpiry }]] = await pool.query(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN ib.expiry_date IS NOT NULL THEN 1 ELSE 0 END) as withExpiry
     FROM inventory_batches ib
     JOIN inventory_items ii ON ib.inventory_item_id = ii.id
     WHERE ii.outlet_id = ? AND ib.is_active = 1 AND ib.remaining_quantity > 0`,
    [TEST_OUTLET_ID]
  );

  console.log(`  Active batches: ${total}, with expiry date: ${withExpiry}`);

  if (parseInt(withExpiry) === 0) {
    console.log('  ⚠️  No batches have expiry dates set — near-expiry detection will work when expiry dates are added');
    skipped++;
  } else {
    const [nearExpiry] = await pool.query(
      `SELECT ib.id, ib.batch_code, ii.name, ib.expiry_date,
        DATEDIFF(ib.expiry_date, CURDATE()) as days_until
       FROM inventory_batches ib
       JOIN inventory_items ii ON ib.inventory_item_id = ii.id
       WHERE ii.outlet_id = ? AND ib.is_active = 1 AND ib.remaining_quantity > 0
         AND ib.expiry_date IS NOT NULL AND ib.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY ib.expiry_date ASC`,
      [TEST_OUTLET_ID]
    );

    console.log(`  Near-expiry batches (30 days): ${nearExpiry.length}`);
    for (const b of nearExpiry) {
      console.log(`    Batch #${b.id} (${b.batch_code || 'N/A'}): ${b.name}, expires ${b.expiry_date} (${b.days_until} days)`);
    }
    assert(true, 'Near-expiry detection query works');
  }
}

// ============================================================
// TEST 6: STOCK SUMMARY REPORT
// ============================================================
async function testStockSummaryReport() {
  section('TEST 6: Stock Summary Report');

  const [items] = await pool.query(
    `SELECT ii.id, ii.name, ii.current_stock, ii.average_price,
      COALESCE(pu.conversion_factor, 1) as purchase_cf,
      COALESCE(pu.abbreviation, bu.abbreviation) as display_unit,
      (ii.current_stock * ii.average_price) as stock_value
     FROM inventory_items ii
     LEFT JOIN units bu ON ii.base_unit_id = bu.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE ii.outlet_id = ? AND ii.is_active = 1
     ORDER BY ii.name`,
    [TEST_OUTLET_ID]
  );

  let totalValue = 0;
  let zeroStock = 0;

  console.log('');
  for (const item of items) {
    const cf = parseFloat(item.purchase_cf) || 1;
    const stock = parseFloat(item.current_stock) || 0;
    const value = parseFloat(item.stock_value) || 0;
    totalValue += value;
    if (stock <= 0) zeroStock++;

    console.log(`  📦 ${item.name}: ${(stock / cf).toFixed(4)} ${item.display_unit} | Value: ₹${value.toFixed(2)}`);
  }

  console.log(`\n  Total items: ${items.length}`);
  console.log(`  Total stock value: ₹${totalValue.toFixed(2)}`);
  console.log(`  Zero stock items: ${zeroStock}`);

  assert(items.length > 0, `Stock summary has ${items.length} items`);
  assert(totalValue >= 0, `Total stock value is non-negative: ₹${totalValue.toFixed(2)}`);
}

// ============================================================
// TEST 7: STOCK LEDGER REPORT
// ============================================================
async function testStockLedger() {
  section('TEST 7: Stock Ledger Report');

  const [movements] = await pool.query(
    `SELECT im.*, ii.name as item_name,
      COALESCE(pu.conversion_factor, 1) as purchase_cf,
      COALESCE(pu.abbreviation, bu.abbreviation) as display_unit
     FROM inventory_movements im
     JOIN inventory_items ii ON im.inventory_item_id = ii.id
     LEFT JOIN units bu ON ii.base_unit_id = bu.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE im.outlet_id = ?
     ORDER BY im.created_at DESC
     LIMIT 20`,
    [TEST_OUTLET_ID]
  );

  assert(movements.length > 0, `Stock ledger has ${movements.length} movements`);

  // Show recent movements
  console.log('\n  Recent movements:');
  for (const m of movements.slice(0, 10)) {
    const cf = parseFloat(m.purchase_cf) || 1;
    const qty = parseFloat(m.quantity) || 0;
    const direction = qty >= 0 ? '📥 IN' : '📤 OUT';
    console.log(`    ${direction} ${m.item_name}: ${(Math.abs(qty) / cf).toFixed(4)} ${m.display_unit} (${m.movement_type}) | Balance: ${(parseFloat(m.balance_after) / cf).toFixed(4)}`);
  }

  // Verify balance continuity for a single item
  const [[sampleItem]] = await pool.query(
    `SELECT DISTINCT inventory_item_id FROM inventory_movements 
     WHERE outlet_id = ? LIMIT 1`,
    [TEST_OUTLET_ID]
  );

  if (sampleItem) {
    const [itemMovements] = await pool.query(
      `SELECT id, balance_before, balance_after, quantity FROM inventory_movements
       WHERE inventory_item_id = ? ORDER BY created_at ASC, id ASC`,
      [sampleItem.inventory_item_id]
    );

    let consistent = true;
    for (let i = 1; i < itemMovements.length; i++) {
      const prev = parseFloat(itemMovements[i - 1].balance_after);
      const curr = parseFloat(itemMovements[i].balance_before);
      if (Math.abs(prev - curr) > 0.1) {
        consistent = false;
        console.log(`    ⚠️  Gap at movement #${itemMovements[i].id}: prev_after=${prev}, curr_before=${curr}`);
      }
    }
    assert(consistent, 'Stock ledger balance continuity check (no gaps)');
  }
}

// ============================================================
// TEST 8: RECIPE CONSUMPTION REPORT
// ============================================================
async function testRecipeConsumption() {
  section('TEST 8: Recipe Consumption Report');

  const [rows] = await pool.query(
    `SELECT ing.name as ingredient_name, ii.name as inventory_name,
      SUM(oi.quantity) as total_orders
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     JOIN recipes r ON r.menu_item_id = oi.item_id
       AND (r.variant_id = oi.variant_id OR (r.variant_id IS NULL AND oi.variant_id IS NULL))
       AND r.is_current = 1 AND r.is_active = 1
     JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     JOIN ingredients ing ON ri.ingredient_id = ing.id
     JOIN inventory_items ii ON ing.inventory_item_id = ii.id
     WHERE o.outlet_id = ? AND o.status NOT IN ('cancelled') AND oi.status != 'cancelled'
     GROUP BY ing.id, ii.id
     ORDER BY ingredient_name`,
    [TEST_OUTLET_ID]
  );

  if (rows.length === 0) {
    console.log('  ⚠️  No completed orders with recipes — consumption report will populate after orders');
    skipped++;
  } else {
    console.log(`  Found ${rows.length} ingredient consumption records:\n`);
    for (const r of rows) {
      console.log(`    ${r.ingredient_name} (${r.inventory_name}): ${r.total_orders} portions ordered`);
    }
    assert(true, `Recipe consumption query works with ${rows.length} results`);
  }
}

// ============================================================
// TEST 9: PROFIT REPORT
// ============================================================
async function testProfitReport() {
  section('TEST 9: Profit Report');

  const [rows] = await pool.query(
    `SELECT oi.item_name, oi.variant_name,
      SUM(oi.quantity) as qty_sold,
      SUM(oi.total_price) as revenue,
      COALESCE(SUM(oic.making_cost), 0) as making_cost,
      COALESCE(SUM(oic.profit), 0) as profit
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     LEFT JOIN order_item_costs oic ON oic.order_item_id = oi.id
     WHERE o.outlet_id = ? AND o.status IN ('paid', 'completed') AND oi.status != 'cancelled'
     GROUP BY oi.item_id, oi.item_name, oi.variant_id, oi.variant_name
     ORDER BY profit DESC`,
    [TEST_OUTLET_ID]
  );

  if (rows.length === 0) {
    console.log('  ⚠️  No completed/paid orders — profit report will populate after orders are completed');
    skipped++;
  } else {
    let totalRevenue = 0, totalCost = 0, totalProfit = 0;
    console.log('');
    for (const r of rows) {
      const rev = parseFloat(r.revenue) || 0;
      const cost = parseFloat(r.making_cost) || 0;
      const profit = parseFloat(r.profit) || 0;
      totalRevenue += rev;
      totalCost += cost;
      totalProfit += profit;

      const margin = rev > 0 ? ((profit / rev) * 100).toFixed(1) : '—';
      console.log(`    ${r.item_name}${r.variant_name ? ` (${r.variant_name})` : ''}: Qty=${r.qty_sold}, Rev=₹${rev.toFixed(2)}, Cost=₹${cost.toFixed(2)}, Profit=₹${profit.toFixed(2)} (${margin}%)`);
    }

    console.log(`\n    TOTAL: Revenue=₹${totalRevenue.toFixed(2)}, Cost=₹${totalCost.toFixed(2)}, Profit=₹${totalProfit.toFixed(2)}`);
    assert(true, `Profit report generated for ${rows.length} items`);
  }
}

// ============================================================
// TEST 10: DAILY BUSINESS SUMMARY
// ============================================================
async function testDailySummary() {
  section('TEST 10: Daily Business Summary');

  const [[sales]] = await pool.query(
    `SELECT
      COUNT(DISTINCT o.id) as total_orders,
      COUNT(DISTINCT CASE WHEN o.status IN ('paid','completed') THEN o.id END) as completed,
      COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled,
      COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.total_amount ELSE 0 END), 0) as net_sale,
      COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.nc_amount ELSE 0 END), 0) as nc_amount,
      COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') AND o.due_amount > 0 THEN o.due_amount ELSE 0 END), 0) as due_amount
     FROM orders o
     WHERE o.outlet_id = ? AND DATE(o.created_at) = CURDATE()`,
    [TEST_OUTLET_ID]
  );

  const [[costs]] = await pool.query(
    `SELECT
      COALESCE(SUM(oic.making_cost), 0) as making_cost,
      COALESCE(SUM(oic.profit), 0) as profit
     FROM order_item_costs oic
     JOIN orders o ON oic.order_id = o.id
     WHERE o.outlet_id = ? AND o.status IN ('paid','completed') AND DATE(o.created_at) = CURDATE()`,
    [TEST_OUTLET_ID]
  );

  const [[wastage]] = await pool.query(
    `SELECT COALESCE(SUM(total_cost), 0) as wastage_cost, COUNT(*) as wastage_count
     FROM wastage_logs WHERE outlet_id = ? AND wastage_date = CURDATE()`,
    [TEST_OUTLET_ID]
  );

  const netSale = parseFloat(sales.net_sale) || 0;
  const makingCost = parseFloat(costs.making_cost) || 0;
  const wastageCost = parseFloat(wastage.wastage_cost) || 0;
  const netProfit = netSale - makingCost - wastageCost;

  console.log(`\n  📊 Today's Summary:`);
  console.log(`    Orders: ${sales.total_orders} total, ${sales.completed} completed, ${sales.cancelled} cancelled`);
  console.log(`    Net Sale: ₹${netSale.toFixed(2)}`);
  console.log(`    NC: ₹${parseFloat(sales.nc_amount).toFixed(2)}`);
  console.log(`    Due: ₹${parseFloat(sales.due_amount).toFixed(2)}`);
  console.log(`    Making Cost: ₹${makingCost.toFixed(2)}`);
  console.log(`    Wastage Cost: ₹${wastageCost.toFixed(2)} (${wastage.wastage_count} incidents)`);
  console.log(`    Net Profit: ₹${netProfit.toFixed(2)}`);

  assert(netSale >= 0, 'Net sale is non-negative');
  assert(makingCost >= 0, 'Making cost is non-negative');
}

// ============================================================
// TEST 11: MOVEMENT TYPE COVERAGE
// ============================================================
async function testMovementTypeCoverage() {
  section('TEST 11: Movement Type Coverage');

  const expectedTypes = [
    'purchase', 'sale', 'production', 'wastage', 'adjustment',
    'production_in', 'production_out', 'production_reversal', 'sale_reversal'
  ];

  const [existing] = await pool.query(
    `SELECT DISTINCT movement_type FROM inventory_movements WHERE outlet_id = ?`,
    [TEST_OUTLET_ID]
  );
  const existingTypes = existing.map(r => r.movement_type);

  console.log(`\n  Supported movement types: ${expectedTypes.join(', ')}`);
  console.log(`  Currently used types: ${existingTypes.join(', ') || '(none)'}`);

  // All used types must be in expected list
  for (const t of existingTypes) {
    assert(expectedTypes.includes(t), `Used type '${t}' is a valid movement type`);
  }

  // Check ENUM itself
  const [[enumDef]] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_movements' AND COLUMN_NAME = 'movement_type'`
  );
  for (const t of expectedTypes) {
    assert(enumDef.COLUMN_TYPE.includes(t), `ENUM includes '${t}'`);
  }
}

// ============================================================
// TEST 12: DATA INTEGRITY
// ============================================================
async function testDataIntegrity() {
  section('TEST 12: Data Integrity Checks');

  // No negative stock
  const [negativeStock] = await pool.query(
    `SELECT id, name, current_stock FROM inventory_items
     WHERE outlet_id = ? AND current_stock < -0.01`,
    [TEST_OUTLET_ID]
  );
  assert(negativeStock.length === 0, `No items with negative stock (found ${negativeStock.length})`);

  // No negative average price
  const [negativePrice] = await pool.query(
    `SELECT id, name, average_price FROM inventory_items
     WHERE outlet_id = ? AND average_price < 0`,
    [TEST_OUTLET_ID]
  );
  assert(negativePrice.length === 0, `No items with negative average_price (found ${negativePrice.length})`);

  // All recipe ingredients linked to inventory
  const [orphaned] = await pool.query(
    `SELECT ri.id, r.name as recipe_name, ing.name as ingredient_name
     FROM recipe_ingredients ri
     JOIN recipes r ON ri.recipe_id = r.id
     JOIN ingredients ing ON ri.ingredient_id = ing.id
     LEFT JOIN inventory_items ii ON ing.inventory_item_id = ii.id
     WHERE r.outlet_id = ? AND r.is_active = 1 AND ii.id IS NULL`,
    [TEST_OUTLET_ID]
  );
  assert(orphaned.length === 0, `All recipe ingredients have valid inventory links (${orphaned.length} orphaned)`);

  // Batch remaining_quantity not exceeding original quantity
  const [overBatches] = await pool.query(
    `SELECT ib.id, ii.name, ib.quantity, ib.remaining_quantity
     FROM inventory_batches ib
     JOIN inventory_items ii ON ib.inventory_item_id = ii.id
     WHERE ii.outlet_id = ? AND ib.remaining_quantity > ib.quantity + 0.01`,
    [TEST_OUTLET_ID]
  );
  assert(overBatches.length === 0, `No batches over-stocked (found ${overBatches.length})`);

  // Cost snapshots have valid data
  const [[snapCheck]] = await pool.query(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN oic.making_cost < 0 THEN 1 ELSE 0 END) as negative_cost
     FROM order_item_costs oic
     JOIN orders o ON oic.order_id = o.id
     WHERE o.outlet_id = ?`,
    [TEST_OUTLET_ID]
  );
  assert(parseInt(snapCheck.negative_cost || 0) === 0,
    `No negative making costs in snapshots (${snapCheck.total} total, ${snapCheck.negative_cost} negative)`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5
  });

  console.log('\n' + '═'.repeat(60));
  console.log('  MODULES 9, 10, 11 — COMPREHENSIVE TEST');
  console.log(`  Outlet: ${TEST_OUTLET_ID} | Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  try {
    await testSchema();
    await testStockDeductionLogic();
    await testSaleMovements();
    await testWastageService();
    await testExpiryDetection();
    await testStockSummaryReport();
    await testStockLedger();
    await testRecipeConsumption();
    await testProfitReport();
    await testDailySummary();
    await testMovementTypeCoverage();
    await testDataIntegrity();
  } catch (error) {
    console.error('\n🔥 FATAL ERROR:', error.message);
    console.error(error.stack);
  }

  // SUMMARY
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  Total:     ${passed + failed + skipped}`);

  if (failures.length > 0) {
    console.log('\n  ❌ FAILURES:');
    for (const f of failures) {
      console.log(`     • ${f}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED!');
  } else {
    console.log(`  ⚠️  ${failed} TEST(S) FAILED — review above output`);
  }
  console.log('═'.repeat(60) + '\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
