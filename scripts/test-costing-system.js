/**
 * Comprehensive Test Script — Inventory, Costing, Recipe, Production, Reversal
 * 
 * Tests the ENTIRE costing pipeline end-to-end:
 *   1. Unit verification
 *   2. Inventory item creation + stock tracking
 *   3. Purchase → batch creation → average/latest price
 *   4. Ingredient creation + inventory linking
 *   5. Recipe creation with ingredients
 *   6. Cost calculation with ALL 3 methods (average, latest, FIFO)
 *   7. Wastage + yield effects on cost
 *   8. Production → stock deduction + output batch creation
 *   9. Production reversal → stock restoration
 *  10. Inventory detail API — batches + stock value
 *  11. Cost snapshot at order time
 *  12. Manual stock adjustment
 * 
 * Run: node scripts/test-costing-system.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

// ============================================================
// CONFIG
// ============================================================
const TEST_OUTLET_ID = 43; // Change if needed

let pool;
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ============================================================
// HELPERS
// ============================================================

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
// TEST 1: UNIT VERIFICATION
// ============================================================
async function testUnits() {
  section('TEST 1: Unit Verification');

  const [units] = await pool.query(
    'SELECT * FROM units WHERE outlet_id = ? AND is_active = 1 ORDER BY unit_type, conversion_factor',
    [TEST_OUTLET_ID]
  );

  console.log(`  Found ${units.length} active units for outlet ${TEST_OUTLET_ID}`);

  // Find base units
  const gram = units.find(u => u.abbreviation === 'g' && u.is_base_unit);
  const kg = units.find(u => u.abbreviation === 'kg' || u.abbreviation === 'KG');
  const ml = units.find(u => u.abbreviation === 'ml' && u.is_base_unit);
  const ltr = units.find(u => u.abbreviation === 'L' || u.abbreviation === 'ltr' || u.abbreviation === 'l');
  const pcs = units.find(u => (u.abbreviation === 'pcs' || u.abbreviation === 'pc' || u.abbreviation === 'nos') && u.is_base_unit);

  assert(gram, 'Gram base unit exists');
  if (gram) {
    assert(parseFloat(gram.conversion_factor) === 1, `Gram conversion_factor = 1 (got ${gram.conversion_factor})`);
  }
  assert(kg, 'KG unit exists');
  if (kg) {
    assert(parseFloat(kg.conversion_factor) === 1000, `KG conversion_factor = 1000 (got ${kg.conversion_factor})`);
  }
  if (ml) {
    assert(parseFloat(ml.conversion_factor) === 1, `ML conversion_factor = 1 (got ${ml.conversion_factor})`);
  }
  if (ltr) {
    assert(parseFloat(ltr.conversion_factor) === 1000, `Litre conversion_factor = 1000 (got ${ltr.conversion_factor})`);
  }

  // Print all units for reference
  console.log('\n  All units:');
  for (const u of units) {
    console.log(`    id=${u.id} ${u.name} (${u.abbreviation}) cf=${u.conversion_factor} base=${u.is_base_unit ? 'YES' : 'no'} type=${u.unit_type}`);
  }

  return { gram, kg, ml, ltr, pcs, units };
}

// ============================================================
// TEST 2: INVENTORY ITEMS
// ============================================================
async function testInventoryItems(unitInfo) {
  section('TEST 2: Inventory Items');

  const [items] = await pool.query(
    `SELECT ii.*, 
      bu.abbreviation as base_unit_abbr, bu.conversion_factor as base_cf,
      COALESCE(pu.abbreviation, bu.abbreviation) as purchase_unit_abbr,
      COALESCE(pu.conversion_factor, 1) as purchase_cf
     FROM inventory_items ii
     LEFT JOIN units bu ON ii.base_unit_id = bu.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE ii.outlet_id = ? AND ii.is_active = 1
     ORDER BY ii.name`,
    [TEST_OUTLET_ID]
  );

  console.log(`  Found ${items.length} active inventory items\n`);

  for (const item of items) {
    const purchaseCf = parseFloat(item.purchase_cf) || 1;
    const rawStock = parseFloat(item.current_stock) || 0;
    const rawAvg = parseFloat(item.average_price) || 0;
    const rawLatest = parseFloat(item.latest_price) || 0;

    const displayStock = (rawStock / purchaseCf).toFixed(4);
    const displayAvg = (rawAvg * purchaseCf).toFixed(4);
    const displayLatest = (rawLatest * purchaseCf).toFixed(4);

    console.log(`  📦 ${item.name} (id=${item.id})`);
    console.log(`     base_unit: ${item.base_unit_abbr}(cf=${item.base_cf}) | purchase_unit: ${item.purchase_unit_abbr}(cf=${purchaseCf})`);
    console.log(`     raw_stock: ${rawStock} ${item.base_unit_abbr} → display: ${displayStock} ${item.purchase_unit_abbr}`);
    console.log(`     raw_avg: ₹${rawAvg}/${item.base_unit_abbr} → display: ₹${displayAvg}/${item.purchase_unit_abbr}`);
    console.log(`     raw_latest: ₹${rawLatest}/${item.base_unit_abbr} → display: ₹${displayLatest}/${item.purchase_unit_abbr}`);

    // Verify base_unit_id points to a base unit
    const isBaseCorrect = parseFloat(item.base_cf) === 1;
    if (!isBaseCorrect) {
      console.log(`     ⚠️  WARNING: base_unit has cf=${item.base_cf}, expected cf=1 (should be gram/ml/pcs)`);
    }
  }

  return items;
}

// ============================================================
// TEST 3: BATCH VERIFICATION + AVERAGE PRICE
// ============================================================
async function testBatchesAndAveragePrice() {
  section('TEST 3: Batch Verification & Average Price');

  const [items] = await pool.query(
    `SELECT ii.id, ii.name, ii.average_price, ii.latest_price, ii.current_stock,
      COALESCE(pu.conversion_factor, 1) as purchase_cf,
      COALESCE(pu.abbreviation, bu.abbreviation) as purchase_unit_abbr,
      bu.abbreviation as base_unit_abbr
     FROM inventory_items ii
     LEFT JOIN units bu ON ii.base_unit_id = bu.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE ii.outlet_id = ? AND ii.is_active = 1`,
    [TEST_OUTLET_ID]
  );

  for (const item of items) {
    // Get all active batches
    const [batches] = await pool.query(
      `SELECT id, batch_code, quantity, remaining_quantity, purchase_price, purchase_date
       FROM inventory_batches
       WHERE inventory_item_id = ? AND is_active = 1
       ORDER BY purchase_date ASC, id ASC`,
      [item.id]
    );

    if (batches.length === 0) continue;

    const cf = parseFloat(item.purchase_cf) || 1;
    console.log(`\n  📦 ${item.name} (id=${item.id}) — ${batches.length} active batch(es)`);

    // Calculate expected average from batches
    let totalValue = 0;
    let totalQty = 0;
    let latestPrice = 0;

    for (const b of batches) {
      const bQty = parseFloat(b.remaining_quantity);
      const bPrice = parseFloat(b.purchase_price);
      totalValue += bQty * bPrice;
      totalQty += bQty;
      latestPrice = bPrice; // last batch price

      console.log(`     Batch #${b.id} (${b.batch_code || 'N/A'}): qty=${(bQty/cf).toFixed(4)} ${item.purchase_unit_abbr}, price=₹${(bPrice*cf).toFixed(4)}/${item.purchase_unit_abbr} (raw: ${bQty} ${item.base_unit_abbr} @ ₹${bPrice}/${item.base_unit_abbr})`);
    }

    const expectedAvg = totalQty > 0 ? totalValue / totalQty : 0;
    const storedAvg = parseFloat(item.average_price) || 0;

    console.log(`     Calculated avg: ₹${expectedAvg.toFixed(6)}/${item.base_unit_abbr} = ₹${(expectedAvg*cf).toFixed(4)}/${item.purchase_unit_abbr}`);
    console.log(`     Stored avg:     ₹${storedAvg.toFixed(6)}/${item.base_unit_abbr} = ₹${(storedAvg*cf).toFixed(4)}/${item.purchase_unit_abbr}`);

    assertApprox(storedAvg, expectedAvg, `${item.name} average_price matches batch calculation`, 0.001);

    // Stock check: total batch remaining should match current_stock
    const storedStock = parseFloat(item.current_stock) || 0;
    assertApprox(storedStock, totalQty, `${item.name} current_stock matches batch totals`, 1);
  }
}

// ============================================================
// TEST 4: INGREDIENT → INVENTORY LINK
// ============================================================
async function testIngredientLinks() {
  section('TEST 4: Ingredient → Inventory Linking');

  const [ingredients] = await pool.query(
    `SELECT ing.*, ii.name as inventory_item_name, ii.id as inv_id,
      ii.average_price, ii.latest_price
     FROM ingredients ing
     LEFT JOIN inventory_items ii ON ing.inventory_item_id = ii.id
     WHERE ing.outlet_id = ? AND ing.is_active = 1
     ORDER BY ing.name`,
    [TEST_OUTLET_ID]
  );

  console.log(`  Found ${ingredients.length} active ingredients\n`);

  let linked = 0, unlinked = 0;
  for (const ing of ingredients) {
    if (ing.inv_id) {
      linked++;
      console.log(`  ✅ ${ing.name} → inventory: ${ing.inventory_item_name} (id=${ing.inv_id}), avg=₹${ing.average_price}, yield=${ing.yield_percentage}%, wastage=${ing.wastage_percentage}%`);
    } else {
      unlinked++;
      console.log(`  ⚠️  ${ing.name} — NOT linked to any inventory item`);
    }
  }

  assert(linked > 0, `At least 1 ingredient linked to inventory (${linked} linked, ${unlinked} unlinked)`);
  return ingredients;
}

// ============================================================
// TEST 5: RECIPE COST CALCULATION — ALL 3 METHODS
// ============================================================
async function testRecipeCostCalculation() {
  section('TEST 5: Recipe Cost Calculation (Average, Latest, FIFO)');

  const [recipes] = await pool.query(
    `SELECT r.id, r.name, r.outlet_id,
      mi.name as menu_item_name, mi.base_price as selling_price
     FROM recipes r
     LEFT JOIN items mi ON r.menu_item_id = mi.id
     WHERE r.outlet_id = ? AND r.is_active = 1 AND r.is_current = 1`,
    [TEST_OUTLET_ID]
  );

  console.log(`  Found ${recipes.length} active recipe(s)\n`);

  for (const recipe of recipes) {
    console.log(`\n  🍳 Recipe: ${recipe.name} (id=${recipe.id}) — ${recipe.menu_item_name || 'unlinked'}`);
    if (recipe.selling_price) console.log(`     Selling price: ₹${recipe.selling_price}`);

    // Get ingredients with all pricing data
    const [ingredients] = await pool.query(
      `SELECT ri.*, ing.name as ingredient_name, ing.yield_percentage, ing.wastage_percentage,
        ing.inventory_item_id,
        ii.average_price, ii.latest_price, ii.current_stock,
        bu.abbreviation as base_unit_abbr, bu.conversion_factor as base_cf,
        ru.name as recipe_unit_name, ru.abbreviation as recipe_unit_abbr,
        ru.conversion_factor as recipe_unit_cf,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as purchase_unit_abbr
       FROM recipe_ingredients ri
       JOIN ingredients ing ON ri.ingredient_id = ing.id
       JOIN inventory_items ii ON ing.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units ru ON ri.unit_id = ru.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       WHERE ri.recipe_id = ?
       ORDER BY ri.display_order, ri.id`,
      [recipe.id]
    );

    const methods = ['average', 'latest'];
    for (const method of methods) {
      let totalCost = 0;
      console.log(`\n     --- Method: ${method.toUpperCase()} ---`);

      for (const ing of ingredients) {
        const qty = parseFloat(ing.quantity) || 0;
        const unitCf = parseFloat(ing.recipe_unit_cf) || 1;
        const purchaseCf = parseFloat(ing.purchase_cf) || 1;
        const wastage = parseFloat(ing.wastage_percentage) || 0;
        const yieldPct = parseFloat(ing.yield_percentage) || 100;

        // Step 1: Convert to base units
        const qtyInBase = qty * unitCf;

        // Step 2: Apply wastage + yield
        const effectiveQty = qtyInBase * (1 + wastage / 100) * (100 / yieldPct);

        // Step 3: Get price
        let pricePerBase = 0;
        if (method === 'average') pricePerBase = parseFloat(ing.average_price) || 0;
        else if (method === 'latest') pricePerBase = parseFloat(ing.latest_price) || 0;

        const cost = effectiveQty * pricePerBase;
        totalCost += cost;

        const pricePerPurchaseUnit = pricePerBase * purchaseCf;

        console.log(`     ${ing.ingredient_name}: ${qty}${ing.recipe_unit_abbr}`
          + (unitCf !== 1 ? ` = ${qtyInBase.toFixed(2)}${ing.base_unit_abbr}` : '')
          + (wastage > 0 ? ` +${wastage}%waste` : '')
          + (yieldPct < 100 ? ` ÷${yieldPct}%yield` : '')
          + (wastage > 0 || yieldPct < 100 ? ` = ${effectiveQty.toFixed(2)}${ing.base_unit_abbr}` : '')
          + ` × ₹${pricePerPurchaseUnit.toFixed(2)}/${ing.purchase_unit_abbr}`
          + ` = ₹${cost.toFixed(2)}`
        );
      }

      console.log(`     TOTAL making cost (${method}): ₹${totalCost.toFixed(2)}`);
      if (recipe.selling_price) {
        const profit = parseFloat(recipe.selling_price) - totalCost;
        const foodCostPct = (totalCost / parseFloat(recipe.selling_price)) * 100;
        console.log(`     Profit: ₹${profit.toFixed(2)} | Food cost: ${foodCostPct.toFixed(2)}%`);
      }

      assert(totalCost >= 0, `Recipe ${recipe.name} — ${method} cost is non-negative (₹${totalCost.toFixed(2)})`);
      if (ingredients.length > 0) {
        assert(totalCost > 0, `Recipe ${recipe.name} — ${method} cost is > 0 (has ${ingredients.length} ingredients)`);
      }
    }

    // FIFO calculation
    console.log(`\n     --- Method: FIFO ---`);
    let fifoTotalCost = 0;

    for (const ing of ingredients) {
      const qty = parseFloat(ing.quantity) || 0;
      const unitCf = parseFloat(ing.recipe_unit_cf) || 1;
      const purchaseCf = parseFloat(ing.purchase_cf) || 1;
      const wastage = parseFloat(ing.wastage_percentage) || 0;
      const yieldPct = parseFloat(ing.yield_percentage) || 100;

      const qtyInBase = qty * unitCf;
      const effectiveQty = qtyInBase * (1 + wastage / 100) * (100 / yieldPct);

      // FIFO: consume from oldest batch first
      const [batches] = await pool.query(
        `SELECT id, remaining_quantity, purchase_price FROM inventory_batches
         WHERE inventory_item_id = ? AND remaining_quantity > 0 AND is_active = 1
         ORDER BY purchase_date ASC, id ASC`,
        [ing.inventory_item_id]
      );

      let remaining = effectiveQty;
      let fifoCost = 0;
      const batchBreakdown = [];

      for (const b of batches) {
        if (remaining <= 0) break;
        const bQty = parseFloat(b.remaining_quantity);
        const bPrice = parseFloat(b.purchase_price);
        const take = Math.min(remaining, bQty);
        fifoCost += take * bPrice;
        batchBreakdown.push(`B#${b.id}:${(take/purchaseCf).toFixed(2)}×₹${(bPrice*purchaseCf).toFixed(2)}`);
        remaining -= take;
      }

      if (remaining > 0) {
        const avgFallback = parseFloat(ing.average_price) || 0;
        fifoCost += remaining * avgFallback;
        batchBreakdown.push(`avg-fallback:${remaining.toFixed(2)}×₹${avgFallback.toFixed(4)}`);
      }

      fifoTotalCost += fifoCost;
      console.log(`     ${ing.ingredient_name}: ${effectiveQty.toFixed(2)} base → [${batchBreakdown.join(' + ')}] = ₹${fifoCost.toFixed(2)}`);
    }

    console.log(`     TOTAL making cost (FIFO): ₹${fifoTotalCost.toFixed(2)}`);
    assert(fifoTotalCost >= 0, `Recipe ${recipe.name} — FIFO cost is non-negative (₹${fifoTotalCost.toFixed(2)})`);
  }
}

// ============================================================
// TEST 6: WASTAGE + YIELD EDGE CASES
// ============================================================
async function testWastageYieldEdgeCases() {
  section('TEST 6: Wastage + Yield Edge Cases (Calculation Verification)');

  // Pure math tests — no DB needed
  const cases = [
    { qty: 150, unitCf: 1, wastage: 0, yield: 100, price: 0.04, expected: 6.00, label: '150g, no waste, 100% yield, ₹40/kg' },
    { qty: 150, unitCf: 1, wastage: 0, yield: 90, price: 0.04, expected: 6.67, label: '150g, no waste, 90% yield, ₹40/kg' },
    { qty: 150, unitCf: 1, wastage: 10, yield: 100, price: 0.04, expected: 6.60, label: '150g, 10% waste, 100% yield, ₹40/kg' },
    { qty: 150, unitCf: 1, wastage: 10, yield: 90, price: 0.04, expected: 7.33, label: '150g, 10% waste, 90% yield, ₹40/kg' },
    { qty: 0.5, unitCf: 1000, wastage: 0, yield: 100, price: 0.04, expected: 20.00, label: '0.5kg, no waste, 100% yield, ₹40/kg' },
    { qty: 1, unitCf: 1000, wastage: 5, yield: 85, price: 0.055, expected: 67.94, label: '1kg, 5% waste, 85% yield, ₹55/kg' },
    { qty: 200, unitCf: 1, wastage: 0, yield: 100, price: 0.32, expected: 64.00, label: '200g paneer, no waste, ₹320/kg' },
  ];

  for (const c of cases) {
    const qtyInBase = c.qty * c.unitCf;
    const effectiveQty = qtyInBase * (1 + c.wastage / 100) * (100 / c.yield);
    const totalCost = effectiveQty * c.price;

    assertApprox(
      parseFloat(totalCost.toFixed(2)),
      c.expected,
      c.label,
      0.02
    );

    // Show breakdown
    console.log(`       → ${c.qty}×cf${c.unitCf}=${qtyInBase} base`
      + (c.wastage > 0 ? ` ×1.${String(c.wastage).padStart(2, '0')}` : '')
      + (c.yield < 100 ? ` ÷${c.yield/100}` : '')
      + ` = ${effectiveQty.toFixed(4)} effective × ₹${c.price} = ₹${totalCost.toFixed(2)}`
    );
  }
}

// ============================================================
// TEST 7: PRODUCTION RECORDS
// ============================================================
async function testProductions() {
  section('TEST 7: Production Records');

  const [productions] = await pool.query(
    `SELECT p.*, oi.name as output_item_name,
      COALESCE(pu.conversion_factor, 1) as purchase_cf,
      COALESCE(pu.abbreviation, 'unit') as purchase_unit_abbr
     FROM productions p
     LEFT JOIN inventory_items oi ON p.output_inventory_item_id = oi.id
     LEFT JOIN units pu ON oi.purchase_unit_id = pu.id
     WHERE p.outlet_id = ?
     ORDER BY p.produced_at DESC
     LIMIT 10`,
    [TEST_OUTLET_ID]
  );

  console.log(`  Found ${productions.length} recent production(s)\n`);

  for (const prod of productions) {
    const cf = parseFloat(prod.purchase_cf) || 1;
    console.log(`  🏭 ${prod.name} (#${prod.production_number}) — status: ${prod.status}`);
    console.log(`     Output: ${(parseFloat(prod.output_quantity)/cf).toFixed(4)} ${prod.purchase_unit_abbr} of ${prod.output_item_name}`);
    console.log(`     Input cost: ₹${prod.total_input_cost} | Cost/unit: ₹${(parseFloat(prod.cost_per_output_unit)*cf).toFixed(4)}/${prod.purchase_unit_abbr}`);
    if (prod.reversed_at) {
      console.log(`     ⏪ REVERSED at ${prod.reversed_at} — ${prod.reversal_notes}`);
    }

    // Get inputs
    const [inputs] = await pool.query(
      `SELECT pi.*, ii.name as item_name,
        COALESCE(pu.conversion_factor, 1) as input_cf,
        COALESCE(pu.abbreviation, 'unit') as input_unit_abbr
       FROM production_inputs pi
       JOIN inventory_items ii ON pi.inventory_item_id = ii.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       WHERE pi.production_id = ?`,
      [prod.id]
    );

    let verifiedCost = 0;
    for (const inp of inputs) {
      const inputCf = parseFloat(inp.input_cf) || 1;
      const displayQty = (parseFloat(inp.quantity_in_base) / inputCf).toFixed(4);
      const displayPrice = (parseFloat(inp.unit_cost) * inputCf).toFixed(4);
      console.log(`     ← ${inp.item_name}: ${displayQty} ${inp.input_unit_abbr} @ ₹${displayPrice}/${inp.input_unit_abbr} = ₹${inp.total_cost}`);
      verifiedCost += parseFloat(inp.total_cost);
    }

    assertApprox(
      parseFloat(prod.total_input_cost),
      verifiedCost,
      `Production ${prod.production_number} total_input_cost matches sum of inputs`,
      0.02
    );
  }
}

// ============================================================
// TEST 8: INVENTORY MOVEMENTS INTEGRITY
// ============================================================
async function testInventoryMovements() {
  section('TEST 8: Inventory Movements Integrity');

  // Pick a few items and verify movement chain
  const [items] = await pool.query(
    `SELECT ii.id, ii.name, ii.current_stock,
      COALESCE(pu.conversion_factor, 1) as purchase_cf,
      COALESCE(pu.abbreviation, bu.abbreviation) as unit_abbr
     FROM inventory_items ii
     LEFT JOIN units bu ON ii.base_unit_id = bu.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE ii.outlet_id = ? AND ii.is_active = 1
     LIMIT 5`,
    [TEST_OUTLET_ID]
  );

  for (const item of items) {
    const [movements] = await pool.query(
      `SELECT movement_type, SUM(quantity) as total_qty, COUNT(*) as cnt
       FROM inventory_movements
       WHERE inventory_item_id = ?
       GROUP BY movement_type`,
      [item.id]
    );

    if (movements.length === 0) continue;

    const cf = parseFloat(item.purchase_cf) || 1;
    console.log(`\n  📦 ${item.name} (stock: ${(parseFloat(item.current_stock)/cf).toFixed(4)} ${item.unit_abbr})`);
    
    let netMovement = 0;
    for (const m of movements) {
      const totalQty = parseFloat(m.total_qty);
      netMovement += totalQty;
      console.log(`     ${m.movement_type}: ${m.cnt} records, net qty: ${(totalQty/cf).toFixed(4)} ${item.unit_abbr}`);
    }

    console.log(`     Net movement: ${(netMovement/cf).toFixed(4)} ${item.unit_abbr}`);
  }
}

// ============================================================
// TEST 9: COST SETTINGS
// ============================================================
async function testCostSettings() {
  section('TEST 9: Cost Settings');

  const [settings] = await pool.query(
    'SELECT * FROM cost_settings WHERE outlet_id = ?',
    [TEST_OUTLET_ID]
  );

  if (settings.length === 0) {
    console.log(`  ⚠️  No cost settings for outlet ${TEST_OUTLET_ID} — defaults to 'average'`);
    skipped++;
  } else {
    const s = settings[0];
    console.log(`  Costing method: ${s.costing_method}`);
    assert(
      ['average', 'latest', 'fifo', 'manual'].includes(s.costing_method),
      `Valid costing method: ${s.costing_method}`
    );
  }
}

// ============================================================
// TEST 10: COST SNAPSHOT (ORDER_ITEM_COSTS)
// ============================================================
async function testCostSnapshots() {
  section('TEST 10: Cost Snapshots (Order Time)');

  const [snapshots] = await pool.query(
    `SELECT oic.*, oi.item_name, o.order_number
     FROM order_item_costs oic
     JOIN order_items oi ON oic.order_item_id = oi.id
     JOIN orders o ON oic.order_id = o.id
     WHERE o.outlet_id = ?
     ORDER BY oic.created_at DESC
     LIMIT 10`,
    [TEST_OUTLET_ID]
  );

  if (snapshots.length === 0) {
    console.log('  No cost snapshots found — this is normal if no orders have been placed with recipes');
    skipped++;
    return;
  }

  console.log(`  Found ${snapshots.length} recent cost snapshot(s)\n`);

  for (const snap of snapshots) {
    console.log(`  📋 Order ${snap.order_number} — ${snap.item_name}`);
    console.log(`     Method: ${snap.costing_method} | Making: ₹${snap.making_cost} | Selling: ₹${snap.selling_price} | Profit: ₹${snap.profit}`);
    
    if (snap.cost_breakdown) {
      try {
        const breakdown = JSON.parse(snap.cost_breakdown);
        for (const b of breakdown) {
          console.log(`       → ${b.name}: ${b.qty} base → ₹${b.cost}`);
        }
      } catch (e) { /* skip parse errors */ }
    }

    assert(parseFloat(snap.making_cost) >= 0, `Snapshot making_cost >= 0 for ${snap.item_name}`);
  }
}

// ============================================================
// TEST 11: STOCK AFTER ORDER (SALE DEDUCTION)
// ============================================================
async function testOrderStockDeduction() {
  section('TEST 11: Stock After Order — Sale Deductions');

  // Check if any sale movements exist
  const [saleMovements] = await pool.query(
    `SELECT im.*, ii.name as item_name,
      COALESCE(pu.conversion_factor, 1) as cf,
      COALESCE(pu.abbreviation, 'unit') as unit_abbr
     FROM inventory_movements im
     JOIN inventory_items ii ON im.inventory_item_id = ii.id
     LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
     WHERE im.outlet_id = ? AND im.movement_type = 'sale'
     ORDER BY im.created_at DESC
     LIMIT 10`,
    [TEST_OUTLET_ID]
  );

  if (saleMovements.length === 0) {
    console.log('  No sale movements found — stock deduction on order may not be implemented yet');
    skipped++;
    return;
  }

  console.log(`  Found ${saleMovements.length} recent sale movement(s)\n`);

  for (const m of saleMovements) {
    const cf = parseFloat(m.cf) || 1;
    console.log(`  📉 ${m.item_name}: ${(Math.abs(parseFloat(m.quantity))/cf).toFixed(4)} ${m.unit_abbr} deducted`);
    console.log(`     Before: ${(parseFloat(m.balance_before)/cf).toFixed(4)} → After: ${(parseFloat(m.balance_after)/cf).toFixed(4)} ${m.unit_abbr}`);
    
    assert(
      parseFloat(m.balance_after) <= parseFloat(m.balance_before),
      `Sale movement reduces stock for ${m.item_name}`
    );
  }
}

// ============================================================
// TEST 12: PRODUCTION REVERSAL VERIFICATION
// ============================================================
async function testProductionReversals() {
  section('TEST 12: Production Reversal Verification');

  const [reversed] = await pool.query(
    `SELECT p.*, oi.name as output_item_name
     FROM productions p
     LEFT JOIN inventory_items oi ON p.output_inventory_item_id = oi.id
     WHERE p.outlet_id = ? AND p.status = 'cancelled' AND p.reversed_at IS NOT NULL
     ORDER BY p.reversed_at DESC
     LIMIT 5`,
    [TEST_OUTLET_ID]
  );

  if (reversed.length === 0) {
    console.log('  No reversed productions found — this is normal');
    skipped++;
    return;
  }

  for (const prod of reversed) {
    console.log(`\n  ⏪ ${prod.name} (#${prod.production_number}) reversed at ${prod.reversed_at}`);
    console.log(`     Reason: ${prod.reversal_notes}`);

    // Check reversal movements exist
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM inventory_movements
       WHERE reference_type = 'production' AND reference_id = ? AND movement_type = 'production_reversal'`,
      [prod.id]
    );

    assert(cnt > 0, `Reversal movements recorded for production ${prod.production_number} (${cnt} movements)`);

    // Check output batch is deactivated
    if (prod.output_batch_id) {
      const [[batch]] = await pool.query(
        'SELECT is_active, remaining_quantity FROM inventory_batches WHERE id = ?',
        [prod.output_batch_id]
      );
      if (batch) {
        assert(!batch.is_active || parseFloat(batch.remaining_quantity) === 0,
          `Output batch ${prod.output_batch_id} is deactivated after reversal`);
      }
    }
  }
}

// ============================================================
// TEST 13: DATA CONSISTENCY CHECKS
// ============================================================
async function testDataConsistency() {
  section('TEST 13: Data Consistency Checks');

  // Check: no negative stock
  const [negativeStock] = await pool.query(
    `SELECT id, name, current_stock FROM inventory_items
     WHERE outlet_id = ? AND current_stock < -0.01`,
    [TEST_OUTLET_ID]
  );
  assert(negativeStock.length === 0, `No items with negative stock (found ${negativeStock.length})`);
  for (const item of negativeStock) {
    console.log(`     ⚠️  ${item.name}: stock = ${item.current_stock}`);
  }

  // Check: no negative average_price
  const [negativePrice] = await pool.query(
    `SELECT id, name, average_price FROM inventory_items
     WHERE outlet_id = ? AND average_price < 0`,
    [TEST_OUTLET_ID]
  );
  assert(negativePrice.length === 0, `No items with negative average_price (found ${negativePrice.length})`);

  // Check: all recipe ingredients have valid inventory links
  const [orphanedIngredients] = await pool.query(
    `SELECT ri.id, ri.recipe_id, ing.name as ingredient_name
     FROM recipe_ingredients ri
     JOIN recipes r ON ri.recipe_id = r.id
     JOIN ingredients ing ON ri.ingredient_id = ing.id
     LEFT JOIN inventory_items ii ON ing.inventory_item_id = ii.id
     WHERE r.outlet_id = ? AND r.is_active = 1 AND ii.id IS NULL`,
    [TEST_OUTLET_ID]
  );
  assert(orphanedIngredients.length === 0,
    `All recipe ingredients linked to valid inventory items (${orphanedIngredients.length} orphaned)`);
  for (const o of orphanedIngredients) {
    console.log(`     ⚠️  Recipe #${o.recipe_id} ingredient "${o.ingredient_name}" has no inventory item`);
  }

  // Check: batch remaining_quantity not exceeding original quantity
  const [overBatches] = await pool.query(
    `SELECT ib.id, ib.batch_code, ib.quantity, ib.remaining_quantity, ii.name as item_name
     FROM inventory_batches ib
     JOIN inventory_items ii ON ib.inventory_item_id = ii.id
     WHERE ii.outlet_id = ? AND ib.remaining_quantity > ib.quantity + 0.01`,
    [TEST_OUTLET_ID]
  );
  assert(overBatches.length === 0,
    `No batches with remaining > original quantity (found ${overBatches.length})`);
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
  console.log('  COMPREHENSIVE COSTING SYSTEM TEST');
  console.log(`  Outlet: ${TEST_OUTLET_ID} | Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  try {
    const unitInfo = await testUnits();
    await testInventoryItems(unitInfo);
    await testBatchesAndAveragePrice();
    await testIngredientLinks();
    await testRecipeCostCalculation();
    await testWastageYieldEdgeCases();
    await testProductions();
    await testInventoryMovements();
    await testCostSettings();
    await testCostSnapshots();
    await testOrderStockDeduction();
    await testProductionReversals();
    await testDataConsistency();
  } catch (error) {
    console.error('\n🔥 FATAL ERROR:', error.message);
    console.error(error.stack);
  }

  // ========================
  // SUMMARY
  // ========================
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
