/**
 * Enhanced Reports & APIs — Comprehensive Verification Test Script
 *
 * Tests all enhanced API responses for accuracy:
 *   1. Inventory Items API — batch details per item
 *   2. Menu Item Details API — recipe details
 *   3. Daily Sales Report — making cost, profit, wastage, food cost %
 *   4. Item Sales Report — making cost, profit per item
 *   5. Day End Summary — cost/profit/wastage per day + grand total
 *   6. Shift History — cost/profit/wastage per shift
 *   7. CSV Exports — new columns present
 *   8. Cross-report consistency checks
 *
 * Usage:
 *   node scripts/test-enhanced-reports.js
 *
 *   Env vars:
 *     BASE_URL    (default http://localhost:3005)
 *     OUTLET_ID   (default 44)
 *     START_DATE / END_DATE (default today)
 */
require('dotenv').config();
const http = require('http');
const mysql = require('mysql2/promise');

const BASE = process.env.BASE_URL || 'http://localhost:3005';
const OUTLET_ID = process.env.OUTLET_ID || 43;
const today = new Date().toISOString().slice(0, 10);
const START_DATE = process.env.START_DATE || today;
const END_DATE = process.env.END_DATE || today;

let passed = 0, failed = 0, skipped = 0;
const failures = [];
let dbPool = null;

// Hard-coded super_admin token — replace if expired
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInV1aWQiOiIwMTNiZWQ4Ni05ZDYzLTQ2ZjctYmExNy1mMTYxYjkwMGM0NzEiLCJlbWFpbCI6ImFkbWluQHJlc3Ryb3Bvcy5jb20iLCJyb2xlcyI6WyJzdXBlcl9hZG1pbiJdLCJvdXRsZXRJZCI6NDMsImlhdCI6MTc3Mzg5NTQ4OCwiZXhwIjoxNzc2NDg3NDg4LCJpc3MiOiJyZXN0cm8tcG9zIn0.78PrFvPhuCtUFghfVDU6bsbJ30h1ULi7ZHrF7R88Shs';

// ── DB pool ──
async function getDB() {
  if (!dbPool) {
    dbPool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  }
  return dbPool;
}

// ── HTTP helper ──
function api(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data, raw: true }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Assertion helpers ──
function ok(cond, name, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; const m = `  ❌ ${name}${detail ? ' — ' + detail : ''}`; console.log(m); failures.push(m); }
}
function approx(a, b, name, tol = 1) {
  const d = Math.abs(a - b);
  if (d <= tol) { passed++; console.log(`  ✅ ${name} (${a} ≈ ${b})`); }
  else { failed++; const m = `  ❌ ${name} — expected ≈${b}, got ${a} (diff=${d.toFixed(2)})`; console.log(m); failures.push(m); }
}
function skip(name, reason) { skipped++; console.log(`  ⏭️  ${name} — ${reason}`); }

// ═══════════════════════════════════════
// TEST 1: Inventory Items — Batch Details
// ═══════════════════════════════════════
async function testInventoryBatchDetails() {
  console.log('\n══ 1. INVENTORY ITEMS — BATCH DETAILS ══');

  const res = await api('GET', `/api/v1/inventory/${OUTLET_ID}/items?limit=5`);
  ok(res.status === 200, 'API returns 200');
  ok(res.body?.success === true, 'Response success=true');

  const items = res.body?.data?.items || [];
  ok(Array.isArray(items), 'items is an array');

  if (items.length === 0) {
    skip('Batch details check', 'No inventory items found');
    return;
  }

  // Every item should have a batches array
  let allHaveBatches = true;
  for (const item of items) {
    if (!Array.isArray(item.batches)) { allHaveBatches = false; break; }
  }
  ok(allHaveBatches, 'Every item has a "batches" array');

  // Find an item with batches to validate structure
  const itemWithBatch = items.find(i => i.batches && i.batches.length > 0);
  if (!itemWithBatch) {
    skip('Batch field validation', 'No items with active batches');
    return;
  }

  const b = itemWithBatch.batches[0];
  ok(b.id !== undefined, 'Batch has id');
  ok(b.batchCode !== undefined, 'Batch has batchCode');
  ok(b.quantity !== undefined, 'Batch has quantity');
  ok(b.remainingQuantity !== undefined, 'Batch has remainingQuantity');
  ok(typeof b.remainingQuantity === 'number', 'remainingQuantity is a number');
  ok(b.remainingQuantity > 0, 'Active batch has remainingQuantity > 0');

  // DB cross-check: count active batches for this item
  const pool = await getDB();
  const [dbBatches] = await pool.query(
    `SELECT COUNT(*) as cnt FROM inventory_batches WHERE inventory_item_id = ? AND is_active = 1 AND remaining_quantity > 0`,
    [itemWithBatch.id]
  );
  approx(itemWithBatch.batches.length, parseInt(dbBatches[0].cnt), `Item ${itemWithBatch.id} batch count matches DB`);

  // activeBatchCount should match batches.length
  if (itemWithBatch.activeBatchCount !== undefined) {
    approx(itemWithBatch.activeBatchCount, itemWithBatch.batches.length, 'activeBatchCount matches batches.length');
  }
}

// ═══════════════════════════════════════
// TEST 2: Menu Item — Recipe Details
// ═══════════════════════════════════════
async function testMenuItemRecipeDetails() {
  console.log('\n══ 2. MENU ITEM DETAILS — RECIPE DETAILS ══');

  // Find an item that has a recipe
  const pool = await getDB();
  const [recipeItems] = await pool.query(
    `SELECT r.menu_item_id FROM recipes r WHERE r.is_active = 1 AND r.is_current = 1 LIMIT 1`
  );

  if (recipeItems.length === 0) {
    skip('Menu item recipe test', 'No active recipes in DB');
    return;
  }

  const itemId = recipeItems[0].menu_item_id;
  const res = await api('GET', `/api/v1/menu/items/${itemId}/details`);
  ok(res.status === 200, `GET /menu/items/${itemId}/details returns 200`);
  ok(res.body?.success === true, 'Response success=true');

  const data = res.body?.data;
  ok(data !== undefined, 'data exists');
  ok(Array.isArray(data?.recipes), 'recipes is an array');

  if (!data?.recipes?.length) {
    skip('Recipe ingredient validation', 'Recipe array empty');
    return;
  }

  const recipe = data.recipes[0];
  ok(recipe.id !== undefined, 'Recipe has id');
  ok(recipe.name !== undefined, 'Recipe has name');
  ok(recipe.portionSize !== undefined || recipe.portionSize === null, 'Recipe has portionSize');
  ok(recipe.isCurrent !== undefined, 'Recipe has isCurrent flag');
  ok(recipe.totalCostPerPortion !== undefined, 'Recipe has totalCostPerPortion');
  ok(typeof recipe.totalCostPerPortion === 'number', 'totalCostPerPortion is a number');
  ok(Array.isArray(recipe.ingredients), 'Recipe has ingredients array');

  if (recipe.ingredients.length > 0) {
    const ing = recipe.ingredients[0];
    ok(ing.ingredientId !== undefined, 'Ingredient has ingredientId');
    ok(ing.ingredientName !== undefined, 'Ingredient has ingredientName');
    ok(ing.quantity !== undefined, 'Ingredient has quantity');
    ok(ing.costPerPortion !== undefined, 'Ingredient has costPerPortion');
    ok(ing.currentStock !== undefined, 'Ingredient has currentStock');
    ok(ing.wastagePercentage !== undefined, 'Ingredient has wastagePercentage');
    ok(ing.yieldPercentage !== undefined, 'Ingredient has yieldPercentage');
    ok(ing.effectiveQtyBase !== undefined, 'Ingredient has effectiveQtyBase');
    ok(typeof ing.costPerPortion === 'number', 'costPerPortion is a number');
  }

  // Verify totalCostPerPortion = sum of ingredient costs
  const calcTotal = recipe.ingredients.reduce((s, i) => s + (i.costPerPortion || 0), 0);
  approx(recipe.totalCostPerPortion, parseFloat(calcTotal.toFixed(2)), 'totalCostPerPortion = sum(ingredient costPerPortion)', 0.05);
}

// ═══════════════════════════════════════
// TEST 3: Daily Sales Report — Cost/Profit/Wastage
// ═══════════════════════════════════════
async function testDailySalesReport() {
  console.log('\n══ 3. DAILY SALES REPORT — COST/PROFIT/WASTAGE ══');

  const res = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(res.status === 200, 'API returns 200');
  ok(res.body?.success === true, 'Response success=true');

  const data = res.body?.data;
  ok(data?.daily !== undefined, 'daily array exists');
  ok(data?.summary !== undefined, 'summary object exists');

  const summary = data?.summary || {};
  // New fields present
  ok(summary.making_cost !== undefined, 'summary.making_cost present');
  ok(summary.profit !== undefined, 'summary.profit present');
  ok(summary.food_cost_percentage !== undefined, 'summary.food_cost_percentage present');
  ok(summary.wastage_count !== undefined, 'summary.wastage_count present');
  ok(summary.wastage_cost !== undefined, 'summary.wastage_cost present');

  const daily = data?.daily || [];
  if (daily.length > 0) {
    const d = daily[0];
    ok(d.making_cost !== undefined, 'daily row has making_cost');
    ok(d.profit !== undefined, 'daily row has profit');
    ok(d.food_cost_percentage !== undefined, 'daily row has food_cost_percentage');
    ok(d.wastage_count !== undefined, 'daily row has wastage_count');
    ok(d.wastage_cost !== undefined, 'daily row has wastage_cost');
  }

  // DB cross-check: total making cost from order_item_costs
  const pool = await getDB();
  const [dbCost] = await pool.query(
    `SELECT COALESCE(SUM(oic.making_cost), 0) as total_cost, COALESCE(SUM(oic.profit), 0) as total_profit
     FROM order_item_costs oic
     JOIN orders o ON oic.order_id = o.id
     WHERE o.outlet_id = ? AND o.status IN ('paid','completed')
       AND DATE(o.created_at) BETWEEN ? AND ?`,
    [OUTLET_ID, START_DATE, END_DATE]
  );
  const dbMakingCost = parseFloat(dbCost[0].total_cost) || 0;
  const dbProfit = parseFloat(dbCost[0].total_profit) || 0;

  approx(parseFloat(summary.making_cost), dbMakingCost, 'summary.making_cost matches DB', 2);
  approx(parseFloat(summary.profit), dbProfit, 'summary.profit matches DB', 2);

  // Wastage cross-check
  const [dbWastage] = await pool.query(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_cost), 0) as cost
     FROM wastage_logs WHERE outlet_id = ? AND wastage_date BETWEEN ? AND ?`,
    [OUTLET_ID, START_DATE, END_DATE]
  );
  approx(summary.wastage_count, parseInt(dbWastage[0].cnt), 'summary.wastage_count matches DB');
  approx(parseFloat(summary.wastage_cost), parseFloat(dbWastage[0].cost), 'summary.wastage_cost matches DB', 2);

  // Food cost % consistency
  const netSales = parseFloat(summary.net_sales) || 0;
  const mc = parseFloat(summary.making_cost) || 0;
  if (netSales > 0) {
    const expectedPct = parseFloat(((mc / netSales) * 100).toFixed(2));
    approx(parseFloat(summary.food_cost_percentage), expectedPct, 'food_cost_percentage = (making_cost/net_sales)*100', 0.1);
  }

  // Verify daily row aggregation: sum of daily making_cost = summary.making_cost
  const dailyMCSum = daily.reduce((s, r) => s + (r.making_cost || 0), 0);
  approx(parseFloat(summary.making_cost), dailyMCSum, 'sum(daily.making_cost) = summary.making_cost', 1);
}

// ═══════════════════════════════════════
// TEST 4: Item Sales Report — Cost/Profit per Item
// ═══════════════════════════════════════
async function testItemSalesReport() {
  console.log('\n══ 4. ITEM SALES REPORT — COST/PROFIT PER ITEM ══');

  const res = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(res.status === 200, 'API returns 200');
  ok(res.body?.success === true, 'Response success=true');

  const data = res.body?.data;
  const summary = data?.summary || {};
  const items = data?.items || [];

  ok(summary.making_cost !== undefined, 'summary.making_cost present');
  ok(summary.profit !== undefined, 'summary.profit present');
  ok(summary.food_cost_percentage !== undefined, 'summary.food_cost_percentage present');

  if (items.length > 0) {
    const item = items[0];
    ok(item.making_cost !== undefined, 'item has making_cost');
    ok(item.item_profit !== undefined, 'item has item_profit');
    ok(item.avg_cost_per_unit !== undefined, 'item has avg_cost_per_unit');
  }

  // Sum of item-level making_cost should match summary
  const itemCostSum = items.reduce((s, i) => s + parseFloat(i.making_cost || 0), 0);
  approx(parseFloat(summary.making_cost), itemCostSum, 'sum(items.making_cost) = summary.making_cost', 2);

  const itemProfitSum = items.reduce((s, i) => s + parseFloat(i.item_profit || 0), 0);
  approx(parseFloat(summary.profit), itemProfitSum, 'sum(items.item_profit) = summary.profit', 2);

  // Cross-check with daily sales report making_cost
  const dailyRes = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  if (dailyRes.body?.success) {
    const dailySummary = dailyRes.body.data?.summary || {};
    approx(parseFloat(summary.making_cost), parseFloat(dailySummary.making_cost), 'item-sales making_cost ≈ daily-sales making_cost', 5);
  }
}

// ═══════════════════════════════════════
// TEST 5: Day End Summary — Cost/Profit/Wastage
// ═══════════════════════════════════════
async function testDayEndSummary() {
  console.log('\n══ 5. DAY END SUMMARY — COST/PROFIT/WASTAGE ══');

  const res = await api('GET', `/api/v1/reports/day-end-summary?outletId=${OUTLET_ID}&startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(res.status === 200, 'API returns 200');
  ok(res.body?.success === true, 'Response success=true');

  const data = res.body?.data;
  ok(data?.days !== undefined, 'days array exists');
  ok(data?.grandTotal !== undefined, 'grandTotal object exists');

  const gt = data?.grandTotal || {};
  ok(gt.makingCost !== undefined, 'grandTotal.makingCost present');
  ok(gt.profit !== undefined, 'grandTotal.profit present');
  ok(gt.foodCostPercentage !== undefined, 'grandTotal.foodCostPercentage present');
  ok(gt.wastageCount !== undefined, 'grandTotal.wastageCount present');
  ok(gt.wastageCost !== undefined, 'grandTotal.wastageCost present');

  const days = data?.days || [];
  if (days.length > 0) {
    const d = days[0];
    ok(d.makingCost !== undefined, 'day row has makingCost');
    ok(d.profit !== undefined, 'day row has profit');
    ok(d.foodCostPercentage !== undefined, 'day row has foodCostPercentage');
    ok(d.wastageCount !== undefined, 'day row has wastageCount');
    ok(d.wastageCost !== undefined, 'day row has wastageCost');
  }

  // Aggregate check: grandTotal = sum of days
  const daysMC = days.reduce((s, d) => s + (d.makingCost || 0), 0);
  approx(gt.makingCost, daysMC, 'grandTotal.makingCost = sum(days.makingCost)', 1);

  const daysProfit = days.reduce((s, d) => s + (d.profit || 0), 0);
  approx(gt.profit, daysProfit, 'grandTotal.profit = sum(days.profit)', 1);

  const daysWC = days.reduce((s, d) => s + (d.wastageCount || 0), 0);
  ok(gt.wastageCount === daysWC, 'grandTotal.wastageCount = sum(days.wastageCount)');

  // Food cost % check
  if (gt.totalSales > 0) {
    const expectedPct = parseFloat(((gt.makingCost / gt.totalSales) * 100).toFixed(2));
    approx(gt.foodCostPercentage, expectedPct, 'grandTotal.foodCostPercentage matches calculation', 0.1);
  }
}

// ═══════════════════════════════════════
// TEST 6: Shift History — Cost/Profit/Wastage
// ═══════════════════════════════════════
async function testShiftHistory() {
  console.log('\n══ 6. SHIFT HISTORY — COST/PROFIT/WASTAGE ══');

  const res = await api('GET', `/api/v1/orders/shifts/${OUTLET_ID}/history?startDate=${START_DATE}&endDate=${END_DATE}&limit=5`);
  ok(res.status === 200, 'API returns 200');
  ok(res.body?.success === true, 'Response success=true');

  const shifts = res.body?.data?.shifts || [];
  ok(Array.isArray(shifts), 'shifts is an array');

  if (shifts.length === 0) {
    skip('Shift cost/profit checks', 'No shifts found in date range');
    return;
  }

  const s = shifts[0];
  ok(s.makingCost !== undefined, 'shift has makingCost');
  ok(s.profit !== undefined, 'shift has profit');
  ok(s.foodCostPercentage !== undefined, 'shift has foodCostPercentage');
  ok(s.wastageCount !== undefined, 'shift has wastageCount');
  ok(s.wastageCost !== undefined, 'shift has wastageCost');
  ok(typeof s.makingCost === 'number', 'makingCost is a number');
  ok(typeof s.profit === 'number', 'profit is a number');

  // Food cost % for the shift
  if (s.totalSales > 0) {
    const expectedPct = parseFloat(((s.makingCost / s.totalSales) * 100).toFixed(2));
    approx(s.foodCostPercentage, expectedPct, 'shift foodCostPercentage matches calculation', 0.1);
  }

  // Verify all shifts have the fields
  let allOk = true;
  for (const sh of shifts) {
    if (sh.makingCost === undefined || sh.profit === undefined || sh.wastageCount === undefined) {
      allOk = false;
      break;
    }
  }
  ok(allOk, 'All shifts have cost/profit/wastage fields');
}

// ═══════════════════════════════════════
// TEST 7: CSV Exports — New Columns
// ═══════════════════════════════════════
async function testCSVExports() {
  console.log('\n══ 7. CSV EXPORTS — NEW COLUMNS ══');

  // Daily sales export
  const dailyCSV = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales/export?startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(dailyCSV.status === 200, 'Daily sales export returns 200');
  if (dailyCSV.raw && typeof dailyCSV.body === 'string') {
    ok(dailyCSV.body.includes('Making Cost'), 'Daily sales CSV has Making Cost column');
    ok(dailyCSV.body.includes('Profit'), 'Daily sales CSV has Profit column');
    ok(dailyCSV.body.includes('Food Cost %'), 'Daily sales CSV has Food Cost % column');
    ok(dailyCSV.body.includes('Wastage'), 'Daily sales CSV has Wastage column');
  } else {
    skip('Daily sales CSV column check', 'Response was JSON, not CSV');
  }

  // Item sales export
  const itemCSV = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales/export?startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(itemCSV.status === 200, 'Item sales export returns 200');
  if (itemCSV.raw && typeof itemCSV.body === 'string') {
    ok(itemCSV.body.includes('Making Cost'), 'Item sales CSV has Making Cost column');
    ok(itemCSV.body.includes('Profit'), 'Item sales CSV has Profit column');
    ok(itemCSV.body.includes('Avg Cost/Unit'), 'Item sales CSV has Avg Cost/Unit column');
  } else {
    skip('Item sales CSV column check', 'Response was JSON, not CSV');
  }

  // Shift history export
  const shiftCSV = await api('GET', `/api/v1/orders/shifts/${OUTLET_ID}/history/export?startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(shiftCSV.status === 200, 'Shift history export returns 200');
  if (shiftCSV.raw && typeof shiftCSV.body === 'string') {
    ok(shiftCSV.body.includes('Making Cost'), 'Shift CSV has Making Cost column');
    ok(shiftCSV.body.includes('Profit'), 'Shift CSV has Profit column');
    ok(shiftCSV.body.includes('Wastage'), 'Shift CSV has Wastage column');
  } else {
    skip('Shift CSV column check', 'Response was JSON, not CSV');
  }

  // Day end summary export
  const deCSV = await api('GET', `/api/v1/reports/day-end-summary/export?outletId=${OUTLET_ID}&startDate=${START_DATE}&endDate=${END_DATE}`);
  ok(deCSV.status === 200, 'Day end summary export returns 200');
  if (deCSV.raw && typeof deCSV.body === 'string') {
    ok(deCSV.body.includes('Making Cost'), 'Day end CSV has Making Cost column');
    ok(deCSV.body.includes('Profit'), 'Day end CSV has Profit column');
    ok(deCSV.body.includes('Wastage'), 'Day end CSV has Wastage column');
  } else {
    skip('Day end CSV column check', 'Response was JSON, not CSV');
  }
}

// ═══════════════════════════════════════
// TEST 8: Cross-Report Consistency
// ═══════════════════════════════════════
async function testCrossReportConsistency() {
  console.log('\n══ 8. CROSS-REPORT CONSISTENCY ══');

  const [dailyRes, itemRes, deRes] = await Promise.all([
    api('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`),
    api('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales?startDate=${START_DATE}&endDate=${END_DATE}`),
    api('GET', `/api/v1/reports/day-end-summary?outletId=${OUTLET_ID}&startDate=${START_DATE}&endDate=${END_DATE}`)
  ]);

  const daily = dailyRes.body?.data?.summary || {};
  const item = itemRes.body?.data?.summary || {};
  const de = deRes.body?.data?.grandTotal || {};

  // Making cost across reports
  const dailyMC = parseFloat(daily.making_cost) || 0;
  const itemMC = parseFloat(item.making_cost) || 0;
  const deMC = parseFloat(de.makingCost) || 0;

  approx(dailyMC, itemMC, 'daily-sales.making_cost ≈ item-sales.making_cost', 5);
  approx(dailyMC, deMC, 'daily-sales.making_cost ≈ day-end.makingCost', 5);

  // Profit across reports
  const dailyProfit = parseFloat(daily.profit) || 0;
  const itemProfit = parseFloat(item.profit) || 0;
  const deProfit = parseFloat(de.profit) || 0;

  approx(dailyProfit, itemProfit, 'daily-sales.profit ≈ item-sales.profit', 5);
  approx(dailyProfit, deProfit, 'daily-sales.profit ≈ day-end.profit', 5);

  // Wastage across reports
  const dailyWC = parseInt(daily.wastage_count) || 0;
  const deWC = parseInt(de.wastageCount) || 0;

  ok(dailyWC === deWC, `wastage_count consistent: daily=${dailyWC}, day-end=${deWC}`);

  const dailyWCost = parseFloat(daily.wastage_cost) || 0;
  const deWCost = parseFloat(de.wastageCost) || 0;

  approx(dailyWCost, deWCost, 'wastage_cost consistent across reports', 2);

  // Net sales consistency
  const dailyNet = parseFloat(daily.net_sales) || 0;
  const deNet = parseFloat(de.totalSales) || 0;
  approx(dailyNet, deNet, 'net_sales consistent: daily-sales ≈ day-end', 5);
}

// ═══════════════════════════════════════
// TEST 9: DB Schema Validation — required tables & columns
// ═══════════════════════════════════════
async function testDBSchema() {
  console.log('\n══ 9. DB SCHEMA VALIDATION ══');
  const pool = await getDB();

  // order_item_costs
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM order_item_costs`);
    const colNames = cols.map(c => c.Field);
    ok(colNames.includes('making_cost'), 'order_item_costs has making_cost');
    ok(colNames.includes('profit'), 'order_item_costs has profit');
    ok(colNames.includes('order_id'), 'order_item_costs has order_id');
    ok(colNames.includes('order_item_id'), 'order_item_costs has order_item_id');
    ok(colNames.includes('selling_price'), 'order_item_costs has selling_price');
    ok(colNames.includes('food_cost_percentage'), 'order_item_costs has food_cost_percentage');
  } catch (e) {
    ok(false, 'order_item_costs table exists', e.message);
  }

  // wastage_logs
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM wastage_logs`);
    const colNames = cols.map(c => c.Field);
    ok(colNames.includes('total_cost'), 'wastage_logs has total_cost');
    ok(colNames.includes('wastage_date'), 'wastage_logs has wastage_date');
    ok(colNames.includes('outlet_id'), 'wastage_logs has outlet_id');
    ok(colNames.includes('wastage_type'), 'wastage_logs has wastage_type');
    ok(colNames.includes('quantity'), 'wastage_logs has quantity');
  } catch (e) {
    ok(false, 'wastage_logs table exists', e.message);
  }

  // inventory_batches
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM inventory_batches`);
    const colNames = cols.map(c => c.Field);
    ok(colNames.includes('batch_code'), 'inventory_batches has batch_code');
    ok(colNames.includes('remaining_quantity'), 'inventory_batches has remaining_quantity');
    ok(colNames.includes('is_active'), 'inventory_batches has is_active');
  } catch (e) {
    ok(false, 'inventory_batches table exists', e.message);
  }

  // recipes & recipe_ingredients
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM recipes`);
    const colNames = cols.map(c => c.Field);
    ok(colNames.includes('menu_item_id'), 'recipes has menu_item_id');
    ok(colNames.includes('is_current'), 'recipes has is_current');
    ok(colNames.includes('portion_size'), 'recipes has portion_size');
  } catch (e) {
    ok(false, 'recipes table exists', e.message);
  }
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM recipe_ingredients`);
    const colNames = cols.map(c => c.Field);
    ok(colNames.includes('recipe_id'), 'recipe_ingredients has recipe_id');
    ok(colNames.includes('ingredient_id'), 'recipe_ingredients has ingredient_id');
    ok(colNames.includes('quantity'), 'recipe_ingredients has quantity');
    ok(colNames.includes('unit_id'), 'recipe_ingredients has unit_id');
  } catch (e) {
    ok(false, 'recipe_ingredients table exists', e.message);
  }
}

// ═══════════════════════════════════════
// TEST 10: Data Integrity — No Negative/NaN values
// ═══════════════════════════════════════
async function testDataIntegrity() {
  console.log('\n══ 10. DATA INTEGRITY — NO NEGATIVE/NaN VALUES ══');

  // Daily sales
  const daily = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  if (daily.body?.data?.daily) {
    for (const d of daily.body.data.daily) {
      ok(!isNaN(d.making_cost), `daily making_cost not NaN (date=${d.report_date})`);
      ok(!isNaN(d.profit), `daily profit not NaN (date=${d.report_date})`);
      ok(!isNaN(d.wastage_cost), `daily wastage_cost not NaN (date=${d.report_date})`);
      ok(d.making_cost >= 0, `daily making_cost >= 0 (date=${d.report_date})`);
      ok(d.wastage_cost >= 0, `daily wastage_cost >= 0 (date=${d.report_date})`);
      ok(d.wastage_count >= 0, `daily wastage_count >= 0 (date=${d.report_date})`);
      ok(d.food_cost_percentage >= 0 && d.food_cost_percentage <= 100, `food_cost_percentage 0-100 (date=${d.report_date}, val=${d.food_cost_percentage})`);
    }
  }

  // Item sales
  const items = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  if (items.body?.data?.items) {
    let hasAnyNaN = false;
    for (const i of items.body.data.items) {
      if (isNaN(parseFloat(i.making_cost)) || isNaN(parseFloat(i.item_profit))) {
        hasAnyNaN = true;
        break;
      }
    }
    ok(!hasAnyNaN, 'No NaN in item-level making_cost/profit');
  }

  // Shifts
  const shifts = await api('GET', `/api/v1/orders/shifts/${OUTLET_ID}/history?startDate=${START_DATE}&endDate=${END_DATE}&limit=5`);
  if (shifts.body?.data?.shifts) {
    let shiftOk = true;
    for (const s of shifts.body.data.shifts) {
      if (typeof s.makingCost !== 'number' || typeof s.profit !== 'number' || isNaN(s.makingCost) || isNaN(s.profit)) {
        shiftOk = false;
        break;
      }
    }
    ok(shiftOk, 'All shift cost/profit fields are valid numbers');
  }
}

// ═══════════════════════════════════════
// TEST 11: Existing Fields Still Present (No Regression)
// ═══════════════════════════════════════
async function testNoRegression() {
  console.log('\n══ 11. NO REGRESSION — EXISTING FIELDS INTACT ══');

  // Inventory items should still have all old fields
  const inv = await api('GET', `/api/v1/inventory/${OUTLET_ID}/items?limit=2`);
  if (inv.body?.data?.items?.length > 0) {
    const it = inv.body.data.items[0];
    ok(it.id !== undefined, 'inventory item has id');
    ok(it.name !== undefined, 'inventory item has name');
    ok(it.currentStock !== undefined, 'inventory item has currentStock');
    ok(it.activeBatchCount !== undefined, 'inventory item has activeBatchCount');
    ok(it.batches !== undefined, 'inventory item has batches (NEW)');
    ok(inv.body.data.pagination !== undefined, 'pagination present');
  }

  // Daily sales should still have original fields
  const ds = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  if (ds.body?.data?.summary) {
    const s = ds.body.data.summary;
    ok(s.total_orders !== undefined, 'summary has total_orders');
    ok(s.gross_sales !== undefined, 'summary has gross_sales');
    ok(s.net_sales !== undefined, 'summary has net_sales');
    ok(s.total_collection !== undefined, 'summary has total_collection');
    ok(s.cash_collection !== undefined, 'summary has cash_collection');
    ok(s.nc_orders !== undefined, 'summary has nc_orders');
    ok(s.average_order_value !== undefined, 'summary has average_order_value');
    ok(s.making_cost !== undefined, 'summary has making_cost (NEW)');
    ok(s.profit !== undefined, 'summary has profit (NEW)');
  }

  // Item sales should still have original fields
  const is = await api('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales?startDate=${START_DATE}&endDate=${END_DATE}`);
  if (is.body?.data?.items?.length > 0) {
    const it = is.body.data.items[0];
    ok(it.item_name !== undefined, 'item has item_name');
    ok(it.total_quantity !== undefined, 'item has total_quantity');
    ok(it.gross_revenue !== undefined, 'item has gross_revenue');
    ok(it.net_revenue !== undefined, 'item has net_revenue');
    ok(it.making_cost !== undefined, 'item has making_cost (NEW)');
  }

  // Shift history should still have original fields
  const sh = await api('GET', `/api/v1/orders/shifts/${OUTLET_ID}/history?startDate=${START_DATE}&endDate=${END_DATE}&limit=2`);
  if (sh.body?.data?.shifts?.length > 0) {
    const s = sh.body.data.shifts[0];
    ok(s.id !== undefined, 'shift has id');
    ok(s.totalSales !== undefined, 'shift has totalSales');
    ok(s.totalCashSales !== undefined, 'shift has totalCashSales');
    ok(s.cashVariance !== undefined, 'shift has cashVariance');
    ok(s.ncOrders !== undefined, 'shift has ncOrders');
    ok(s.openedByName !== undefined, 'shift has openedByName');
    ok(s.makingCost !== undefined, 'shift has makingCost (NEW)');
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Enhanced Reports & APIs — Verification Tests   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Base URL:   ${BASE}`);
  console.log(`  Outlet ID:  ${OUTLET_ID}`);
  console.log(`  Date Range: ${START_DATE} to ${END_DATE}`);
  console.log();

  try {
    // DB schema tests (no server needed)
    await testDBSchema();

    // API tests
    await testInventoryBatchDetails();
    await testMenuItemRecipeDetails();
    await testDailySalesReport();
    await testItemSalesReport();
    await testDayEndSummary();
    await testShiftHistory();
    await testCSVExports();
    await testCrossReportConsistency();
    await testDataIntegrity();
    await testNoRegression();
  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    console.error(err.stack);
  }

  // Summary
  console.log('\n══════════════════════════════════');
  console.log(`  RESULTS: ✅ ${passed}  ❌ ${failed}  ⏭️  ${skipped}`);
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(f));
  }
  console.log('══════════════════════════════════\n');

  if (dbPool) await dbPool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
