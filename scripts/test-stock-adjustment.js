/**
 * Stock Adjustment Test Script
 * 
 * Tests the batch-specific stock adjustment functionality:
 * 1. Verify batchId is required
 * 2. Positive adjustment increases batch and total stock
 * 3. Negative adjustment decreases batch and total stock
 * 4. Cannot adjust to negative batch quantity
 * 5. Movement record is created correctly
 * 
 * Usage: node scripts/test-stock-adjustment.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

let pool = null;
let passed = 0, failed = 0;
const failures = [];

async function getPool() {
  if (!pool) {
    pool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  }
  return pool;
}

function ok(cond, name, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; const m = `  ❌ ${name}${detail ? ' — ' + detail : ''}`; console.log(m); failures.push(m); }
}

function approx(a, b, name, tol = 0.01) {
  const d = Math.abs(a - b);
  if (d <= tol) { passed++; console.log(`  ✅ ${name} (${a} ≈ ${b})`); }
  else { failed++; const m = `  ❌ ${name} — expected ≈${b}, got ${a}`; console.log(m); failures.push(m); }
}

// ═══════════════════════════════════════
// TEST: Service-level adjustment logic
// ═══════════════════════════════════════
async function testAdjustmentLogic() {
  console.log('\n══ STOCK ADJUSTMENT — BATCH-SPECIFIC LOGIC ══\n');
  
  const db = await getPool();
  
  // Initialize the service's database pool
  const { initializeDatabase } = require('../src/database');
  await initializeDatabase();
  
  // Find an outlet with inventory items and batches
  const [outlets] = await db.query(`
    SELECT DISTINCT ii.outlet_id 
    FROM inventory_items ii
    JOIN inventory_batches ib ON ib.inventory_item_id = ii.id
    WHERE ib.is_active = 1 AND ib.remaining_quantity > 0
    LIMIT 1
  `);
  
  if (outlets.length === 0) {
    console.log('  ⚠️  No outlets with active batches found. Skipping tests.');
    return;
  }
  
  const outletId = outlets[0].outlet_id;
  console.log(`  Using outlet ID: ${outletId}\n`);
  
  // Find an item with multiple batches
  const [items] = await db.query(`
    SELECT ii.id, ii.name, ii.current_stock,
           COALESCE(pu.conversion_factor, 1) as cf,
           COALESCE(pu.abbreviation, bu.abbreviation) as unit
    FROM inventory_items ii
    LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
    LEFT JOIN units bu ON ii.base_unit_id = bu.id
    WHERE ii.outlet_id = ? AND ii.is_active = 1
    AND EXISTS (SELECT 1 FROM inventory_batches ib WHERE ib.inventory_item_id = ii.id AND ib.is_active = 1 AND ib.remaining_quantity > 0)
    LIMIT 1
  `, [outletId]);
  
  if (items.length === 0) {
    console.log('  ⚠️  No items with active batches found. Skipping tests.');
    return;
  }
  
  const item = items[0];
  const cf = parseFloat(item.cf) || 1;
  console.log(`  Item: ${item.name} (ID: ${item.id})`);
  console.log(`  Current stock: ${(item.current_stock / cf).toFixed(2)} ${item.unit}`);
  
  // Get batches for this item
  const [batches] = await db.query(`
    SELECT id, batch_code, remaining_quantity, purchase_date
    FROM inventory_batches
    WHERE inventory_item_id = ? AND is_active = 1 AND remaining_quantity > 0
    ORDER BY purchase_date ASC
  `, [item.id]);
  
  console.log(`  Batches: ${batches.length}`);
  batches.forEach(b => {
    console.log(`    - ${b.batch_code}: ${(b.remaining_quantity / cf).toFixed(2)} ${item.unit} (purchased: ${b.purchase_date?.toISOString?.()?.slice(0,10) || b.purchase_date})`);
  });
  console.log();
  
  // ─── Test 1: Verify service requires batchId ───
  console.log('── Test 1: batchId is required ──');
  const inventoryService = require('../src/services/inventory.service');
  
  try {
    await inventoryService.recordAdjustment(outletId, {
      inventoryItemId: item.id,
      quantity: 10,
      reason: 'Test without batchId'
    }, 1);
    ok(false, 'Should throw error when batchId missing');
  } catch (e) {
    ok(e.message.includes('batchId is required'), 'Throws error when batchId missing', e.message);
  }
  
  // ─── Test 2: Positive adjustment ───
  console.log('\n── Test 2: Positive adjustment increases batch and stock ──');
  const testBatch = batches[0];
  const batchBefore = parseFloat(testBatch.remaining_quantity);
  const stockBefore = parseFloat(item.current_stock);
  const adjustQty = 5; // in purchase units
  const adjustQtyBase = adjustQty * cf;
  
  try {
    const result = await inventoryService.recordAdjustment(outletId, {
      inventoryItemId: item.id,
      batchId: testBatch.id,
      quantity: adjustQty,
      reason: 'Test positive adjustment'
    }, 1);
    
    ok(result.batchId === testBatch.id, `Result has correct batchId (${result.batchId})`);
    ok(result.batchCode === testBatch.batch_code, `Result has batchCode (${result.batchCode})`);
    approx(result.batchRemainingBefore, batchBefore / cf, 'batchRemainingBefore correct');
    approx(result.batchRemainingAfter, (batchBefore + adjustQtyBase) / cf, 'batchRemainingAfter correct');
    approx(result.stockBefore, stockBefore / cf, 'stockBefore correct');
    approx(result.stockAfter, (stockBefore + adjustQtyBase) / cf, 'stockAfter correct');
    
    // Verify DB state
    const [[dbBatch]] = await db.query('SELECT remaining_quantity FROM inventory_batches WHERE id = ?', [testBatch.id]);
    const [[dbItem]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [item.id]);
    
    approx(parseFloat(dbBatch.remaining_quantity), batchBefore + adjustQtyBase, 'DB batch quantity updated');
    approx(parseFloat(dbItem.current_stock), stockBefore + adjustQtyBase, 'DB item stock updated');
    
    // Check movement record
    const [[movement]] = await db.query(`
      SELECT * FROM inventory_movements 
      WHERE inventory_item_id = ? AND inventory_batch_id = ? AND movement_type = 'adjustment'
      ORDER BY id DESC LIMIT 1
    `, [item.id, testBatch.id]);
    
    ok(movement !== undefined, 'Movement record created');
    approx(parseFloat(movement.quantity), adjustQtyBase, 'Movement quantity correct');
    ok(movement.notes === 'Test positive adjustment', 'Movement notes correct');
    
  } catch (e) {
    ok(false, 'Positive adjustment failed', e.message);
  }
  
  // ─── Test 3: Negative adjustment ───
  console.log('\n── Test 3: Negative adjustment decreases batch and stock ──');
  
  // Refresh batch/item state
  const [[freshBatch]] = await db.query('SELECT remaining_quantity FROM inventory_batches WHERE id = ?', [testBatch.id]);
  const [[freshItem]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [item.id]);
  const batchBefore2 = parseFloat(freshBatch.remaining_quantity);
  const stockBefore2 = parseFloat(freshItem.current_stock);
  const negAdjust = -3; // in purchase units
  const negAdjustBase = negAdjust * cf;
  
  try {
    const result = await inventoryService.recordAdjustment(outletId, {
      inventoryItemId: item.id,
      batchId: testBatch.id,
      quantity: negAdjust,
      reason: 'Test negative adjustment'
    }, 1);
    
    approx(result.batchRemainingAfter, (batchBefore2 + negAdjustBase) / cf, 'Negative: batchRemainingAfter correct');
    approx(result.stockAfter, (stockBefore2 + negAdjustBase) / cf, 'Negative: stockAfter correct');
    
    // Verify DB
    const [[dbBatch2]] = await db.query('SELECT remaining_quantity FROM inventory_batches WHERE id = ?', [testBatch.id]);
    approx(parseFloat(dbBatch2.remaining_quantity), batchBefore2 + negAdjustBase, 'DB batch decreased correctly');
    
  } catch (e) {
    ok(false, 'Negative adjustment failed', e.message);
  }
  
  // ─── Test 4: Cannot go negative ───
  console.log('\n── Test 4: Cannot adjust batch to negative quantity ──');
  
  const [[currentBatch]] = await db.query('SELECT remaining_quantity FROM inventory_batches WHERE id = ?', [testBatch.id]);
  const currentQty = parseFloat(currentBatch.remaining_quantity) / cf;
  const tooMuch = -(currentQty + 100); // More than available
  
  try {
    await inventoryService.recordAdjustment(outletId, {
      inventoryItemId: item.id,
      batchId: testBatch.id,
      quantity: tooMuch,
      reason: 'Test over-deduction'
    }, 1);
    ok(false, 'Should throw error for negative batch result');
  } catch (e) {
    ok(e.message.includes('negative batch quantity'), 'Throws error for negative batch result', e.message);
  }
  
  // ─── Test 5: Wrong batch for item ───
  console.log('\n── Test 5: Cannot use batch from different item ──');
  
  // Find a batch from a different item
  const [otherBatches] = await db.query(`
    SELECT ib.id FROM inventory_batches ib
    WHERE ib.inventory_item_id != ? AND ib.is_active = 1
    LIMIT 1
  `, [item.id]);
  
  if (otherBatches.length > 0) {
    try {
      await inventoryService.recordAdjustment(outletId, {
        inventoryItemId: item.id,
        batchId: otherBatches[0].id,
        quantity: 1,
        reason: 'Test wrong batch'
      }, 1);
      ok(false, 'Should throw error for wrong batch');
    } catch (e) {
      ok(e.message.includes('does not belong'), 'Throws error for wrong batch', e.message);
    }
  } else {
    console.log('  ⏭️  No other batches to test wrong-batch scenario');
  }
  
  // ─── Cleanup: Revert our test adjustments ───
  console.log('\n── Cleanup: Reverting test adjustments ──');
  
  // Net adjustment was +5 -3 = +2, so revert with -2
  try {
    await inventoryService.recordAdjustment(outletId, {
      inventoryItemId: item.id,
      batchId: testBatch.id,
      quantity: -2,
      reason: 'Test cleanup - reverting test adjustments'
    }, 1);
    
    // Verify back to original
    const [[finalBatch]] = await db.query('SELECT remaining_quantity FROM inventory_batches WHERE id = ?', [testBatch.id]);
    const [[finalItem]] = await db.query('SELECT current_stock FROM inventory_items WHERE id = ?', [item.id]);
    
    approx(parseFloat(finalBatch.remaining_quantity), batchBefore, 'Batch reverted to original');
    approx(parseFloat(finalItem.current_stock), stockBefore, 'Item stock reverted to original');
    
    console.log('  ✅ Test data cleaned up successfully');
  } catch (e) {
    console.log(`  ⚠️  Cleanup failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Stock Adjustment — Batch-Specific Tests        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  
  try {
    await testAdjustmentLogic();
  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    console.error(err.stack);
  }
  
  console.log('\n══════════════════════════════════════');
  console.log(`  RESULTS: ✅ ${passed}  ❌ ${failed}`);
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(f));
  }
  console.log('══════════════════════════════════════\n');
  
  if (pool) await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
