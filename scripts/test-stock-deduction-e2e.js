/**
 * End-to-End Stock Deduction & Reversal Test
 * 
 * Tests stockDeduction + costSnapshot services DIRECTLY (no socket.io/redis needed):
 *   1. Record stock BEFORE
 *   2. Call deductForOrderItem() in a transaction
 *   3. Verify stock decreased, movements created, batch qty reduced
 *   4. Call reverseForOrderItem() in a transaction
 *   5. Verify stock restored, reversal movements created
 *
 * Usage: node scripts/test-stock-deduction-e2e.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

let testPool = null;
let passed = 0, failed = 0, skipped = 0;
const failures = [];

async function getPool() {
  if (!testPool) {
    testPool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  }
  return testPool;
}

function ok(cond, name, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; const m = `  ❌ ${name}${detail ? ' — ' + detail : ''}`; console.log(m); failures.push(m); }
}
function approx(a, b, name, tol = 1) {
  const d = Math.abs(a - b);
  if (d <= tol) { passed++; console.log(`  ✅ ${name} (${a} ≈ ${b})`); }
  else { failed++; const m = `  ❌ ${name} — expected ≈${b}, got ${a} (diff=${d.toFixed(4)})`; console.log(m); failures.push(m); }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Stock Deduction & Reversal — E2E Test          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const db = await getPool();

  // Initialize the app's database pool for services
  const { initializeDatabase } = require('../src/database');
  await initializeDatabase();

  const stockDeductionService = require('../src/services/stockDeduction.service');
  const costSnapshotService = require('../src/services/costSnapshot.service');

  const ITEM_ID = 1595;
  const OUTLET_ID = 43;
  const USER_ID = 1;
  const ORDER_QTY = 2;

  // ═══ Setup: Find recipe & ingredients ═══
  console.log('══ SETUP ══');
  const [recipes] = await db.query(
    'SELECT id FROM recipes WHERE menu_item_id = ? AND is_current = 1 AND is_active = 1 AND variant_id IS NULL',
    [ITEM_ID]
  );
  ok(recipes.length > 0, `Recipe exists for item ${ITEM_ID}`);
  if (!recipes.length) { await db.end(); return; }

  const [ingredients] = await db.query(
    `SELECT ri.*, ing.inventory_item_id, ing.name as ingredient_name,
      ing.wastage_percentage, ing.yield_percentage,
      ru.conversion_factor as recipe_unit_cf
     FROM recipe_ingredients ri
     JOIN ingredients ing ON ri.ingredient_id = ing.id
     LEFT JOIN units ru ON ri.unit_id = ru.id
     WHERE ri.recipe_id = ?`,
    [recipes[0].id]
  );
  ok(ingredients.length > 0, `Recipe has ${ingredients.length} ingredients`);

  // ═══ 1. Record stock BEFORE ═══
  console.log('\n══ 1. RECORD STOCK BEFORE ══');
  const stockBefore = {};
  const batchesBefore = {};
  for (const ing of ingredients) {
    const [[item]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
    stockBefore[ing.inventory_item_id] = parseFloat(item.current_stock);
    const [batches] = await db.query(
      'SELECT id, remaining_quantity FROM inventory_batches WHERE inventory_item_id = ? AND is_active = 1 AND remaining_quantity > 0 ORDER BY purchase_date ASC',
      [ing.inventory_item_id]
    );
    batchesBefore[ing.inventory_item_id] = batches.map(b => ({ id: b.id, qty: parseFloat(b.remaining_quantity) }));
    console.log(`  ${ing.ingredient_name} (inv#${ing.inventory_item_id}): stock=${item.current_stock}, batches=${batches.length}`);
  }

  // ═══ 2. Create a fake order + order_item for testing ═══
  console.log('\n══ 2. CREATE TEST ORDER + ORDER ITEM (DB only) ══');
  let testOrderId, testOrderItemId;
  
  // Get next order number
  const [[maxOrder]] = await db.query('SELECT MAX(id) as maxId FROM orders');
  const orderNum = `TEST-${(maxOrder?.maxId || 0) + 1}`;
  
  const [orderRes] = await db.query(
    `INSERT INTO orders (outlet_id, order_number, order_type, status, created_by, subtotal, total_amount)
     VALUES (?, ?, 'takeaway', 'confirmed', ?, 0, 0)`,
    [OUTLET_ID, orderNum, USER_ID]
  );
  testOrderId = orderRes.insertId;
  
  // Get item price
  const [[menuItem]] = await db.query('SELECT name, base_price FROM items WHERE id = ?', [ITEM_ID]);
  const unitPrice = parseFloat(menuItem?.base_price) || 329;
  
  const [oiRes] = await db.query(
    `INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, base_price, total_price, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [testOrderId, ITEM_ID, menuItem?.name || 'Paneer Butter Masala', ORDER_QTY, unitPrice, unitPrice, unitPrice * ORDER_QTY, USER_ID]
  );
  testOrderItemId = oiRes.insertId;
  console.log(`  Created test order #${testOrderId}, order_item #${testOrderItemId}`);

  // ═══ 3. Test stock deduction ═══
  console.log('\n══ 3. STOCK DEDUCTION ══');
  const conn1 = await db.getConnection();
  await conn1.beginTransaction();
  
  let deductResult;
  try {
    deductResult = await stockDeductionService.deductForOrderItem(conn1, {
      orderId: testOrderId,
      orderItemId: testOrderItemId,
      itemId: ITEM_ID,
      variantId: null,
      quantity: ORDER_QTY,
      outletId: OUTLET_ID,
      userId: USER_ID
    });
    await conn1.commit();
    ok(deductResult !== null, 'deductForOrderItem returned result (not null)');
    
    if (deductResult) {
      ok(deductResult.ingredientCount === ingredients.length, `Deducted ${deductResult.ingredientCount} ingredients`);
      ok(deductResult.totalCostDeducted > 0, `Total cost deducted: ₹${deductResult.totalCostDeducted}`);
      console.log(`  Deductions:`);
      (deductResult.deductions || []).forEach(d => {
        console.log(`    ${d.ingredientName}: -${d.qtyDeducted} (cost ₹${d.cost})`);
      });
    }
  } catch (e) {
    await conn1.rollback();
    ok(false, 'deductForOrderItem threw error', e.message);
    console.error('  Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  } finally {
    conn1.release();
  }

  // Also test cost snapshot
  console.log('\n══ 3b. COST SNAPSHOT ══');
  const conn1b = await db.getConnection();
  await conn1b.beginTransaction();
  try {
    const costResult = await costSnapshotService.snapshotOrderItemCost(conn1b, {
      orderId: testOrderId,
      orderItemId: testOrderItemId,
      itemId: ITEM_ID,
      variantId: null,
      quantity: ORDER_QTY,
      outletId: OUTLET_ID
    });
    await conn1b.commit();
    ok(costResult !== null, 'Cost snapshot created');
    if (costResult) {
      ok(costResult.makingCost > 0, `Making cost: ₹${costResult.makingCost}`);
      ok(costResult.profit > 0, `Profit: ₹${costResult.profit}`);
      ok(costResult.foodCostPct > 0, `Food cost %: ${costResult.foodCostPct}%`);
    }
  } catch (e) {
    await conn1b.rollback();
    ok(false, 'Cost snapshot', e.message);
  } finally {
    conn1b.release();
  }

  // ═══ 4. Verify stock decreased ═══
  console.log('\n══ 4. VERIFY STOCK DECREASED ══');
  
  if (deductResult) {
    // Check stock_deducted flag
    const [[oi]] = await db.query('SELECT stock_deducted FROM order_items WHERE id = ?', [testOrderItemId]);
    ok(oi.stock_deducted === 1, `stock_deducted = 1 (got ${oi.stock_deducted})`);
    
    // Check movements
    const [movements] = await db.query(
      "SELECT * FROM inventory_movements WHERE reference_type = 'order_item' AND reference_id = ? AND movement_type = 'sale'",
      [testOrderItemId]
    );
    ok(movements.length === ingredients.length, `Sale movements: ${movements.length} (expected ${ingredients.length})`);

    for (const mov of movements) {
      ok(mov.inventory_batch_id !== null, `Movement inv#${mov.inventory_item_id}: batch_id=${mov.inventory_batch_id}`);
      ok(parseFloat(mov.quantity) < 0, `Movement inv#${mov.inventory_item_id}: qty=${mov.quantity} (negative)`);
    }

    // Check stock decreased for each ingredient
    for (const ing of ingredients) {
      const [[item]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
      const after = parseFloat(item.current_stock);
      const before = stockBefore[ing.inventory_item_id];
      
      const recipeQty = parseFloat(ing.quantity);
      const cf = parseFloat(ing.recipe_unit_cf) || 1;
      const wastage = parseFloat(ing.wastage_percentage) || 0;
      const yieldPct = parseFloat(ing.yield_percentage) || 100;
      const effectivePerPortion = recipeQty * cf * (1 + wastage / 100) * (100 / yieldPct);
      const expectedDeduction = effectivePerPortion * ORDER_QTY;
      
      approx(before - after, expectedDeduction, `${ing.ingredient_name}: deducted ${(before - after).toFixed(2)} (expected ${expectedDeduction.toFixed(2)})`, 0.5);
    }

    // Check batch remaining decreased
    for (const ing of ingredients) {
      const [batchesAfter] = await db.query(
        'SELECT id, remaining_quantity FROM inventory_batches WHERE inventory_item_id = ? AND is_active = 1 ORDER BY purchase_date ASC',
        [ing.inventory_item_id]
      );
      const beforeTotal = batchesBefore[ing.inventory_item_id].reduce((s, b) => s + b.qty, 0);
      const afterTotal = batchesAfter.reduce((s, b) => s + parseFloat(b.remaining_quantity), 0);
      ok(afterTotal < beforeTotal, `${ing.ingredient_name}: batch total decreased (${beforeTotal} → ${afterTotal})`);
    }
  } else {
    ok(false, 'Skipping verification — deduction returned null');
  }

  // ═══ 5. Stock reversal ═══
  console.log('\n══ 5. STOCK REVERSAL ══');
  const stockBeforeCancel = {};
  for (const ing of ingredients) {
    const [[item]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
    stockBeforeCancel[ing.inventory_item_id] = parseFloat(item.current_stock);
  }

  const conn2 = await db.getConnection();
  await conn2.beginTransaction();
  try {
    const reverseResult = await stockDeductionService.reverseForOrderItem(conn2, {
      orderItemId: testOrderItemId,
      outletId: OUTLET_ID,
      userId: USER_ID,
      reason: 'E2E test cancel'
    });
    await conn2.commit();
    ok(reverseResult !== null, 'reverseForOrderItem returned result');
    if (reverseResult) {
      ok(reverseResult.restoredCount === ingredients.length, `Restored ${reverseResult.restoredCount} ingredients`);
    }
  } catch (e) {
    await conn2.rollback();
    ok(false, 'reverseForOrderItem threw error', e.message);
  } finally {
    conn2.release();
  }

  // ═══ 6. Verify stock restored ═══
  console.log('\n══ 6. VERIFY STOCK RESTORED ══');
  
  const [[oiAfterCancel]] = await db.query('SELECT stock_deducted FROM order_items WHERE id = ?', [testOrderItemId]);
  ok(oiAfterCancel.stock_deducted === 0, `stock_deducted reset to 0 (got ${oiAfterCancel.stock_deducted})`);

  const [reversals] = await db.query(
    "SELECT * FROM inventory_movements WHERE reference_type = 'order_item' AND reference_id = ? AND movement_type = 'sale_reversal'",
    [testOrderItemId]
  );
  ok(reversals.length === ingredients.length, `Reversal movements: ${reversals.length} (expected ${ingredients.length})`);

  for (const ing of ingredients) {
    const [[item]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [ing.inventory_item_id]);
    const restored = parseFloat(item.current_stock);
    const original = stockBefore[ing.inventory_item_id];
    approx(restored, original, `${ing.ingredient_name}: stock restored (${restored} ≈ ${original})`, 0.5);
  }

  // ═══ 7. Verify cost snapshot in DB ═══
  console.log('\n══ 7. VERIFY COST SNAPSHOT IN DB ══');
  const [costRows] = await db.query('SELECT * FROM order_item_costs WHERE order_id = ? AND order_item_id = ?', [testOrderId, testOrderItemId]);
  ok(costRows.length > 0, `Cost snapshot rows: ${costRows.length}`);
  if (costRows.length > 0) {
    const c = costRows[0];
    ok(parseFloat(c.making_cost) > 0, `making_cost = ₹${c.making_cost}`);
    ok(parseFloat(c.selling_price) > 0, `selling_price = ₹${c.selling_price}`);
    ok(parseFloat(c.profit) >= 0, `profit = ₹${c.profit}`);
    ok(c.cost_breakdown !== null, 'cost_breakdown present');
    const breakdown = JSON.parse(c.cost_breakdown);
    ok(breakdown.length === ingredients.length, `Breakdown has ${breakdown.length} ingredients`);
  }

  // ═══ Cleanup ═══
  console.log('\n══ CLEANUP ══');
  await cleanup(db, testOrderId);

  // ═══ Summary ═══
  console.log('\n══════════════════════════════════════');
  console.log(`  RESULTS: ✅ ${passed}  ❌ ${failed}  ⏭️  ${skipped}`);
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(f));
  }
  console.log('══════════════════════════════════════\n');

  await db.end();
  // Force exit (app DB pool may keep node alive)
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(db, orderId) {
  if (!orderId) return;
  try {
    await db.query("DELETE FROM inventory_movements WHERE reference_type = 'order_item' AND reference_id IN (SELECT id FROM order_items WHERE order_id = ?)", [orderId]);
    await db.query('DELETE FROM order_item_costs WHERE order_id = ?', [orderId]);
    // Delete reversal batches
    const [ois] = await db.query('SELECT id FROM order_items WHERE order_id = ?', [orderId]);
    for (const oi of ois) {
      await db.query("DELETE FROM inventory_batches WHERE batch_code = ?", [`REV-ORD-${oi.id}`]);
    }
    await db.query('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await db.query('DELETE FROM orders WHERE id = ?', [orderId]);
    console.log(`  Cleaned up test order #${orderId}`);
  } catch (e) {
    console.log(`  Cleanup warning: ${e.message}`);
  }
}

main();
