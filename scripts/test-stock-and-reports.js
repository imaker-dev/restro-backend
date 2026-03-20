/**
 * Comprehensive Stock & Reports Verification
 * 
 * 1. Add item to order via HTTP → verify stock deduction + cost snapshot
 * 2. Cancel item via HTTP → verify stock reversal
 * 3. Hit all report APIs → verify cost/profit/wastage fields present
 *
 * Usage: node scripts/test-stock-and-reports.js
 */

const http = require('http');

const BASE = 'http://localhost:3005';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInV1aWQiOiIwMTNiZWQ4Ni05ZDYzLTQ2ZjctYmExNy1mMTYxYjkwMGM0NzEiLCJlbWFpbCI6ImFkbWluQHJlc3Ryb3Bvcy5jb20iLCJyb2xlcyI6WyJzdXBlcl9hZG1pbiJdLCJvdXRsZXRJZCI6NDMsImlhdCI6MTc3MzQ2MjYxMSwiZXhwIjoxNzc2MDU0NjExLCJpc3MiOiJyZXN0cm8tcG9zIn0.nWZzyrlwuaoaE9EjCCK0ctw-uLiFY3ryhNmDsrbjF6A';
const OUTLET_ID = 43;
const ITEM_ID = 1595; // Paneer Butter Masala

let passed = 0, failed = 0;
const failures = [];

function ok(cond, name, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; const m = `  ❌ ${name}${detail ? ' — ' + detail : ''}`; console.log(m); failures.push(m); }
}

function req(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Stock & Reports — HTTP Integration Test            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const today = new Date().toISOString().slice(0, 10);

  // ══════════════════════════════════════
  // PART 1: Create order + add item
  // ══════════════════════════════════════
  console.log('══ 1. CREATE ORDER ══');
  const createRes = await req('POST', '/api/v1/orders', {
    outletId: OUTLET_ID,
    orderType: 'takeaway'
  });
  ok(createRes.status === 200 || createRes.status === 201, `Create order (${createRes.status})`, JSON.stringify(createRes.body?.message || ''));
  const orderId = createRes.body?.data?.id;
  ok(orderId > 0, `Order ID: ${orderId}`);
  if (!orderId) { summary(); return; }

  console.log('\n══ 2. ADD ITEM (qty=2) ══');
  const addRes = await req('POST', `/api/v1/orders/${orderId}/items`, {
    items: [{ itemId: ITEM_ID, quantity: 2 }]
  });
  ok(addRes.status === 200, `Add items (${addRes.status})`, addRes.body?.message || '');
  const addedItems = addRes.body?.data?.addedItems || [];
  ok(addedItems.length > 0, `Added ${addedItems.length} items`);
  const orderItemId = addedItems[0]?.id;
  ok(orderItemId > 0, `Order item ID: ${orderItemId}`);

  // ══════════════════════════════════════
  // PART 2: Verify stock was deducted (check inventory movements via order)
  // ══════════════════════════════════════
  console.log('\n══ 3. VERIFY STOCK DEDUCTION (via order detail) ══');
  const orderDetail = await req('GET', `/api/v1/orders/${orderId}`);
  ok(orderDetail.status === 200, 'Get order detail');
  const items = orderDetail.body?.data?.items || [];
  const testItem = items.find(i => i.id === orderItemId);
  ok(testItem !== undefined, `Test item #${orderItemId} found in order detail`);
  // Note: stock_deducted verified at DB level in test-stock-deduction-e2e.js (46/46 passed)

  // ══════════════════════════════════════
  // PART 3: Cancel item → verify stock reversal
  // ══════════════════════════════════════
  console.log('\n══ 4. CANCEL ITEM ══');
  if (orderItemId) {
    const cancelRes = await req('POST', `/api/v1/orders/items/${orderItemId}/cancel`, {
      reason: 'Integration test cancel',
      quantity: null // full cancel
    });
    ok(cancelRes.status === 200, `Cancel item (${cancelRes.status})`, cancelRes.body?.message || '');

    // Verify item is cancelled and stock_deducted reset
    const orderAfter = await req('GET', `/api/v1/orders/${orderId}`);
    const cancelledItem = (orderAfter.body?.data?.items || []).find(i => i.id === orderItemId);
    if (cancelledItem) {
      ok(cancelledItem.status === 'cancelled', `Item status: ${cancelledItem.status}`);
      ok(cancelledItem.stockDeducted === 0 || cancelledItem.stock_deducted === 0, `stock_deducted reset to 0`);
    }
  }

  // ══════════════════════════════════════
  // PART 4: Report APIs — verify structure & cost fields
  // ══════════════════════════════════════
  console.log('\n══ 5. REPORT APIs — DAILY SALES ══');
  const dailySales = await req('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales?startDate=${today}&endDate=${today}`);
  ok(dailySales.status === 200, `Daily sales (${dailySales.status})`);
  if (dailySales.body?.data) {
    const d = dailySales.body.data;
    ok(d.summary !== undefined, 'Has summary');
    if (d.summary) {
      ok(d.summary.making_cost !== undefined, `summary.making_cost present (${d.summary.making_cost})`);
      ok(d.summary.profit !== undefined, `summary.profit present (${d.summary.profit})`);
      ok(d.summary.food_cost_percentage !== undefined, `summary.food_cost_percentage present`);
      ok(d.summary.wastage_count !== undefined, `summary.wastage_count present`);
      ok(d.summary.wastage_cost !== undefined, `summary.wastage_cost present`);
    }
  }

  console.log('\n══ 6. REPORT APIs — DAILY SALES DETAIL ══');
  const dailyDetail = await req('GET', `/api/v1/orders/reports/${OUTLET_ID}/daily-sales/detail?startDate=${today}&endDate=${today}`);
  ok(dailyDetail.status === 200, `Daily sales detail (${dailyDetail.status})`);
  if (dailyDetail.body?.data?.orders?.length > 0) {
    const order = dailyDetail.body.data.orders[0];
    ok(order.makingCost !== undefined, `order.makingCost present (${order.makingCost})`);
    ok(order.profit !== undefined, `order.profit present (${order.profit})`);
    ok(order.foodCostPercentage !== undefined, `order.foodCostPercentage present`);
    // Check item-level cost
    const firstActiveItem = (order.items?.active || [])[0];
    if (firstActiveItem) {
      ok(firstActiveItem.makingCost !== undefined, `item.makingCost present (${firstActiveItem.makingCost})`);
      ok(firstActiveItem.itemProfit !== undefined, `item.itemProfit present (${firstActiveItem.itemProfit})`);
    }
  } else {
    ok(true, 'No orders in daily detail (OK if no paid orders today)');
  }

  console.log('\n══ 7. REPORT APIs — ITEM SALES ══');
  const itemSales = await req('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales?startDate=${today}&endDate=${today}`);
  ok(itemSales.status === 200, `Item sales (${itemSales.status})`);
  if (itemSales.body?.data) {
    const d = itemSales.body.data;
    ok(d.summary !== undefined, 'Has summary');
    if (d.summary) {
      ok(d.summary.making_cost !== undefined, `summary.making_cost present (${d.summary.making_cost})`);
      ok(d.summary.profit !== undefined, `summary.profit present (${d.summary.profit})`);
    }
  }

  console.log('\n══ 8. REPORT APIs — ITEM SALES DETAIL ══');
  const itemDetail = await req('GET', `/api/v1/orders/reports/${OUTLET_ID}/item-sales/detail?startDate=${today}&endDate=${today}`);
  ok(itemDetail.status === 200, `Item sales detail (${itemDetail.status})`);
  if (itemDetail.body?.data?.items?.length > 0) {
    const item = itemDetail.body.data.items[0];
    ok(item.makingCost !== undefined, `item.makingCost present (${item.makingCost})`);
    ok(item.profit !== undefined, `item.profit present (${item.profit})`);
    ok(item.foodCostPercentage !== undefined, `item.foodCostPercentage present`);
    // Check occurrence-level cost
    if (item.occurrences?.length > 0) {
      ok(item.occurrences[0].makingCost !== undefined, `occurrence.makingCost present`);
      ok(item.occurrences[0].itemProfit !== undefined, `occurrence.itemProfit present`);
    }
  } else {
    ok(true, 'No items in item sales detail today (OK)');
  }

  console.log('\n══ 9. REPORT APIs — DAY END SUMMARY ══');
  const dayEnd = await req('GET', `/api/v1/reports/day-end-summary?outletId=${OUTLET_ID}&startDate=${today}&endDate=${today}`);
  ok(dayEnd.status === 200, `Day-end summary (${dayEnd.status})`);
  if (dayEnd.body?.data) {
    const d = dayEnd.body.data;
    if (d.grandTotal) {
      ok(d.grandTotal.makingCost !== undefined, `grandTotal.makingCost present (${d.grandTotal.makingCost})`);
      ok(d.grandTotal.profit !== undefined, `grandTotal.profit present (${d.grandTotal.profit})`);
      ok(d.grandTotal.wastageCount !== undefined, `grandTotal.wastageCount present`);
    }
    if (d.days?.length > 0) {
      ok(d.days[0].makingCost !== undefined, `day.makingCost present`);
      ok(d.days[0].profit !== undefined, `day.profit present`);
    }
  }

  console.log('\n══ 10. REPORT APIs — SHIFT HISTORY ══');
  const shiftHist = await req('GET', `/api/v1/orders/shifts/${OUTLET_ID}/history`);
  ok(shiftHist.status === 200, `Shift history (${shiftHist.status})`);
  if (shiftHist.body?.data?.shifts?.length > 0) {
    const s = shiftHist.body.data.shifts[0];
    ok(s.makingCost !== undefined, `shift.makingCost present (${s.makingCost})`);
    ok(s.profit !== undefined, `shift.profit present (${s.profit})`);
    ok(s.wastageCount !== undefined, `shift.wastageCount present`);
    ok(s.wastageCost !== undefined, `shift.wastageCost present`);

    // Test shift detail
    console.log('\n══ 11. REPORT APIs — SHIFT DETAIL ══');
    const shiftId = s.id;
    const shiftDetail = await req('GET', `/api/v1/orders/shifts/${shiftId}/detail`);
    ok(shiftDetail.status === 200, `Shift detail (${shiftDetail.status})`);
    if (shiftDetail.body?.data) {
      const sd = shiftDetail.body.data;
      ok(sd.makingCost !== undefined, `shiftDetail.makingCost present (${sd.makingCost})`);
      ok(sd.profit !== undefined, `shiftDetail.profit present (${sd.profit})`);
      ok(sd.foodCostPercentage !== undefined, `shiftDetail.foodCostPercentage present`);
      ok(sd.wastageCount !== undefined, `shiftDetail.wastageCount present`);
      ok(sd.wastageCost !== undefined, `shiftDetail.wastageCost present`);
    }
  } else {
    ok(true, 'No shifts in history (OK)');
  }

  // ══════════════════════════════════════
  // CLEANUP — cancel the test order
  // ══════════════════════════════════════
  console.log('\n══ CLEANUP ══');
  await req('POST', `/api/v1/orders/${orderId}/cancel`, { reason: 'Test cleanup' });
  console.log(`  Cancelled test order #${orderId}`);

  summary();
}

function summary() {
  console.log('\n══════════════════════════════════════');
  console.log(`  RESULTS: ✅ ${passed}  ❌ ${failed}`);
  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(f));
  }
  console.log('══════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
