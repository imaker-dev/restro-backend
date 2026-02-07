/**
 * Test: Item Cancel → KOT Auto-Cancel → Real-time Events → Table Status
 * 
 * Scenarios:
 *   1. Cancel 1 item → KOT stays pending, kitchen gets kot:item_cancelled
 *   2. Cancel remaining items → KOT auto-cancels, kitchen gets kot:cancelled
 *   3. GET /tables/:id shows correct KOT status and item counts
 *   4. Full order cancel → all KOTs cancelled, table available
 *   5. After cancel → can start new session and create new order
 * 
 * Run: node src/tests/test-item-cancel-kot-auto-cancel.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const TABLE_ID = 14;

const CAPTAIN_CREDS = { email: 'admin@restropos.com', password: 'admin123' };
const KITCHEN_CREDS = { email: 'kitchen@restropos.com', password: 'Kitchen@123' };

let captainApi, kitchenApi;
let passed = 0, failed = 0;

function test(name, condition, debug = '') {
  if (condition) { console.log(`   ✓ ${name}`); passed++; }
  else { console.log(`   ✗ ${name}${debug ? ' → ' + debug : ''}`); failed++; }
}

function section(title) {
  console.log('\n' + '─'.repeat(55));
  console.log(`  ${title}`);
  console.log('─'.repeat(55));
}

async function cleanup() {
  // Cancel stuck orders on this table
  for (let id = 50; id <= 120; id++) {
    try {
      const r = await captainApi.get(`/orders/${id}`);
      if (r.data.success && r.data.data?.table_id == TABLE_ID &&
          !['cancelled', 'paid'].includes(r.data.data?.status)) {
        await captainApi.post(`/orders/${id}/cancel`, { reason: 'cleanup' });
      }
    } catch (e) {}
  }
  try { await captainApi.delete(`/tables/${TABLE_ID}/session`); } catch (e) {}
  await captainApi.patch(`/tables/${TABLE_ID}/status`, { status: 'available' });
}

async function run() {
  console.log('\n' + '═'.repeat(55));
  console.log('  ITEM CANCEL → KOT AUTO-CANCEL → TABLE STATUS');
  console.log('═'.repeat(55));

  // AUTH
  section('1. AUTH');
  const capLogin = await axios.post(`${API_BASE}/auth/login`, CAPTAIN_CREDS);
  captainApi = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${capLogin.data.data.accessToken}` },
    timeout: 15000, validateStatus: () => true
  });
  test('Captain login', !!capLogin.data.data.accessToken);

  const kitLogin = await axios.post(`${API_BASE}/auth/login`, KITCHEN_CREDS);
  kitchenApi = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${kitLogin.data.data.accessToken}` },
    timeout: 15000, validateStatus: () => true
  });
  test('Kitchen login', !!kitLogin.data.data.accessToken);

  await cleanup();

  // CREATE DINE-IN ORDER
  section('2. CREATE DINE-IN ORDER');
  const sessRes = await captainApi.post(`/tables/${TABLE_ID}/session`, { guestCount: 2 });
  test('Session started', sessRes.data.success, sessRes.data.message);

  const orderRes = await captainApi.post('/orders', {
    outletId: OUTLET_ID, tableId: TABLE_ID,
    tableSessionId: sessRes.data.data?.sessionId || sessRes.data.data?.id,
    orderType: 'dine_in', covers: 2
  });
  test('Order created', orderRes.data.success, orderRes.data.message);
  const orderId = orderRes.data.data?.id;
  console.log(`   Order ID: ${orderId}`);

  // Add 3 items so we can cancel them one by one
  const addRes = await captainApi.post(`/orders/${orderId}/items`, {
    items: [
      { itemId: 1, quantity: 1 },
      { itemId: 2, quantity: 1 },
      { itemId: 3, quantity: 1 }
    ]
  });
  test('3 items added', addRes.data.success, addRes.data.message);

  // Get order items
  const detailRes = await captainApi.get(`/orders/${orderId}`);
  const orderItems = detailRes.data.data?.items || [];
  console.log(`   Items: ${orderItems.map(i => `${i.item_name}(id:${i.id})`).join(', ')}`);
  test('Have 3 items', orderItems.length === 3);

  // SEND KOT
  section('3. SEND KOT');
  const kotRes = await captainApi.post(`/orders/${orderId}/kot`);
  test('KOT sent', kotRes.data.success, kotRes.data.message);

  const kotsRes = await captainApi.get(`/orders/${orderId}/kots`);
  const kotId = kotsRes.data.data?.[0]?.id;
  console.log(`   KOT ID: ${kotId}`);

  // Check table shows KOT pending
  const table1 = await captainApi.get(`/tables/${TABLE_ID}`);
  const kotInTable = table1.data.data?.kots?.find(k => k.id === kotId);
  test('Table shows KOT', !!kotInTable);
  test('KOT status = pending', kotInTable?.status === 'pending', `Got: ${kotInTable?.status}`);
  test('KOT itemCount = 3', kotInTable?.itemCount === 3, `Got: ${kotInTable?.itemCount}`);
  console.log(`   Table KOT: status=${kotInTable?.status}, items=${kotInTable?.itemCount}, cancelled=${kotInTable?.cancelledItemCount}`);

  // SCENARIO A: Cancel 1 item → KOT stays pending
  section('4. CANCEL 1st ITEM (KOT should stay pending)');
  const item1Id = orderItems[0]?.id;
  console.log(`   Cancelling item ${item1Id} (${orderItems[0]?.item_name})`);
  console.log('   → Captain sends: POST /orders/items/:id/cancel');
  console.log('   → Kitchen receives: kot:item_cancelled event');

  const cancel1 = await captainApi.post(`/orders/items/${item1Id}/cancel`, {
    reason: 'Customer changed mind'
  });
  test('Item 1 cancelled', cancel1.data.success, cancel1.data.message);

  // Check KOT via kitchen API
  const kot2 = await kitchenApi.get(`/orders/kot/${kotId}`);
  const cancelledItems1 = kot2.data.data?.items?.filter(i => i.status === 'cancelled') || [];
  test('Kitchen sees 1 cancelled item', cancelledItems1.length === 1, `Got: ${cancelledItems1.length}`);
  test('KOT still pending', kot2.data.data?.status === 'pending', `Got: ${kot2.data.data?.status}`);

  // Check table API
  const table2 = await captainApi.get(`/tables/${TABLE_ID}`);
  const kot2InTable = table2.data.data?.kots?.find(k => k.id === kotId);
  test('Table KOT still pending', kot2InTable?.status === 'pending', `Got: ${kot2InTable?.status}`);
  test('Table KOT itemCount = 2 (active)', kot2InTable?.itemCount === 2, `Got: ${kot2InTable?.itemCount}`);
  test('Table KOT cancelledCount = 1', kot2InTable?.cancelledItemCount === 1, `Got: ${kot2InTable?.cancelledItemCount}`);

  // SCENARIO B: Cancel 2nd item → KOT still pending (1 item left)
  section('5. CANCEL 2nd ITEM (1 item left, KOT stays pending)');
  const item2Id = orderItems[1]?.id;
  console.log(`   Cancelling item ${item2Id} (${orderItems[1]?.item_name})`);

  const cancel2 = await captainApi.post(`/orders/items/${item2Id}/cancel`, {
    reason: 'Out of stock'
  });
  test('Item 2 cancelled', cancel2.data.success, cancel2.data.message);

  const kot3 = await kitchenApi.get(`/orders/kot/${kotId}`);
  test('KOT still pending (1 item left)', kot3.data.data?.status === 'pending', `Got: ${kot3.data.data?.status}`);

  const table3 = await captainApi.get(`/tables/${TABLE_ID}`);
  const kot3InTable = table3.data.data?.kots?.find(k => k.id === kotId);
  test('Table KOT itemCount = 1', kot3InTable?.itemCount === 1, `Got: ${kot3InTable?.itemCount}`);
  test('Table KOT cancelledCount = 2', kot3InTable?.cancelledItemCount === 2, `Got: ${kot3InTable?.cancelledItemCount}`);

  // SCENARIO C: Cancel last item → KOT AUTO-CANCELS
  section('6. CANCEL LAST ITEM → KOT AUTO-CANCELS');
  const item3Id = orderItems[2]?.id;
  console.log(`   Cancelling item ${item3Id} (${orderItems[2]?.item_name})`);
  console.log('   → Kitchen receives: kot:cancelled event (auto)');

  const cancel3 = await captainApi.post(`/orders/items/${item3Id}/cancel`, {
    reason: 'All items cancelled'
  });
  test('Item 3 cancelled', cancel3.data.success, cancel3.data.message);

  const kot4 = await kitchenApi.get(`/orders/kot/${kotId}`);
  test('KOT auto-cancelled', kot4.data.data?.status === 'cancelled', `Got: ${kot4.data.data?.status}`);

  // Check table API shows cancelled KOT
  const table4 = await captainApi.get(`/tables/${TABLE_ID}`);
  const kot4InTable = table4.data.data?.kots?.find(k => k.id === kotId);
  test('Table KOT status = cancelled', kot4InTable?.status === 'cancelled', `Got: ${kot4InTable?.status}`);
  test('Table KOT itemCount = 0 (all cancelled)', kot4InTable?.itemCount === 0, `Got: ${kot4InTable?.itemCount}`);

  // Kitchen active list should NOT have this KOT
  const active1 = await kitchenApi.get('/orders/kot/active?station=kitchen');
  const kotInActive = active1.data.data?.kots?.find(k => k.id === kotId);
  test('KOT removed from kitchen active list', !kotInActive);

  // SCENARIO D: Full order cancel → table available
  section('7. ORDER CANCEL → TABLE AVAILABLE');
  console.log('   → Kitchen receives: order:cancelled, kot:cancelled events');
  console.log('   → Floor receives: table:update event');

  const cancelOrder = await captainApi.post(`/orders/${orderId}/cancel`, {
    reason: 'All items were cancelled'
  });
  test('Order cancelled', cancelOrder.data.success, cancelOrder.data.message);

  const orderAfter = await captainApi.get(`/orders/${orderId}`);
  test('Order status = cancelled', orderAfter.data.data?.status === 'cancelled');

  // Table should be available
  const table5 = await captainApi.get(`/tables/${TABLE_ID}`);
  test('Table status = available', table5.data.data?.status === 'available', `Got: ${table5.data.data?.status}`);

  // SCENARIO E: New session + order on same table
  section('8. NEW SESSION + ORDER (same table)');
  const sess2 = await captainApi.post(`/tables/${TABLE_ID}/session`, { guestCount: 4 });
  test('New session started', sess2.data.success, sess2.data.message);

  const order2 = await captainApi.post('/orders', {
    outletId: OUTLET_ID, tableId: TABLE_ID,
    tableSessionId: sess2.data.data?.sessionId || sess2.data.data?.id,
    orderType: 'dine_in', covers: 4
  });
  test('New order created', order2.data.success, order2.data.message);
  const order2Id = order2.data.data?.id;
  console.log(`   New Order ID: ${order2Id}`);

  await captainApi.post(`/orders/${order2Id}/items`, {
    items: [{ itemId: 1, quantity: 2 }]
  });
  const kot2Res = await captainApi.post(`/orders/${order2Id}/kot`);
  test('New KOT sent', kot2Res.data.success, kot2Res.data.message);

  // Check new KOT appears in kitchen
  const active2 = await kitchenApi.get('/orders/kot/active?station=kitchen');
  const kots2 = await captainApi.get(`/orders/${order2Id}/kots`);
  const newKotId = kots2.data.data?.[0]?.id;
  const newKotInActive = active2.data.data?.kots?.find(k => k.id === newKotId);
  test('Kitchen sees new KOT', !!newKotInActive);

  // Check table shows new order and KOT
  const table6 = await captainApi.get(`/tables/${TABLE_ID}`);
  test('Table shows new order', table6.data.data?.order?.id === order2Id, `Got order: ${table6.data.data?.order?.id}`);
  const newKotInTable = table6.data.data?.kots?.find(k => k.id === newKotId);
  test('Table shows new KOT pending', newKotInTable?.status === 'pending', `Got: ${newKotInTable?.status}`);

  // CLEANUP
  section('9. CLEANUP');
  await captainApi.post(`/orders/${order2Id}/cancel`, { reason: 'Test done' });
  console.log('   Cleaned up');

  // RESULTS
  console.log('\n' + '═'.repeat(55));
  console.log('  REAL-TIME EVENT FLOW');
  console.log('═'.repeat(55));
  console.log(`
  Captain: POST /orders/items/:id/cancel
    → Kitchen listens: "kot:updated" (type: kot:item_cancelled)
    → Captain listens:  "kot:updated" (type: kot:item_cancelled)
    → If all items cancelled → auto-cancel KOT:
      → Kitchen listens: "kot:updated" (type: kot:cancelled)
      → Captain listens:  "kot:updated" (type: kot:cancelled)

  Captain: POST /orders/:id/cancel
    → Kitchen listens: "kot:updated" (type: kot:cancelled) per KOT
    → Captain listens:  "order:updated" (type: order:cancelled)
    → Floor listens:    "table:updated" (table → available)
`);

  console.log('═'.repeat(55));
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log('═'.repeat(55));
  console.log(failed === 0 ? '\n✅ All tests passed!' : '\n❌ Some tests failed');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
