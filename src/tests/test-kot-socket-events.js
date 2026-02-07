/**
 * KOT Events & Status Test - Kitchen Perspective
 * Tests all KOT events and their corresponding statuses via API
 * 
 * EVENT TYPES & STATUS MAPPING:
 * ┌──────────────────┬────────────────┬──────────────────┐
 * │ Event Type       │ Triggered By   │ KOT Status       │
 * ├──────────────────┼────────────────┼──────────────────┤
 * │ kot:created      │ Captain        │ pending          │
 * │ kot:accepted     │ Kitchen        │ accepted         │
 * │ kot:preparing    │ Kitchen        │ preparing        │
 * │ kot:item_ready   │ Kitchen        │ item: ready      │
 * │ kot:ready        │ Kitchen        │ ready            │
 * │ kot:served       │ Captain        │ served           │
 * └──────────────────┴────────────────┴──────────────────┘
 * 
 * SOCKET CHANNEL: kot:update (internal) → kot:updated (emitted)
 * SOCKET ROOMS: kitchen:{outletId}, station:{outletId}:{station}
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const TABLE_ID = 14;

let passed = 0, failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`   ✓ ${name}`);
    passed++;
  } else {
    console.log(`   ✗ ${name}`);
    failed++;
  }
}

async function runTests() {
  console.log('═'.repeat(70));
  console.log('KOT EVENTS & STATUS TEST - KITCHEN PERSPECTIVE');
  console.log('═'.repeat(70));

  let captainToken, kitchenToken, orderId, kotId, kotItemId;

  // ═══════════════════════════════════════════════════════════════
  // 1. AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════
  console.log('\n1. AUTHENTICATION');
  console.log('─'.repeat(50));

  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@restropos.com',
      password: 'admin123'
    });
    captainToken = res.data.data.accessToken;
    test('Captain login successful', !!captainToken);
  } catch (err) {
    console.log('   ✗ Captain login failed:', err.message);
    failed++;
    process.exit(1);
  }

  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'kitchen@restropos.com',
      password: 'Kitchen@123'
    });
    kitchenToken = res.data.data.accessToken;
    test('Kitchen staff login successful', !!kitchenToken);
  } catch (err) {
    kitchenToken = captainToken;
    console.log('   ⚠ Using admin token for kitchen');
  }

  const captainApi = axios.create({
    baseURL: BASE_URL,
    headers: { 'Authorization': `Bearer ${captainToken}` }
  });

  const kitchenApi = axios.create({
    baseURL: BASE_URL,
    headers: { 'Authorization': `Bearer ${kitchenToken}` }
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. SETUP ORDER
  // ═══════════════════════════════════════════════════════════════
  console.log('\n2. SETUP - Create Order');
  console.log('─'.repeat(50));

  try { await captainApi.delete(`/tables/${TABLE_ID}/session`); } catch (e) {}

  try {
    await captainApi.post(`/tables/${TABLE_ID}/session`, { guestCount: 4 });
    test('Table session started', true);
  } catch (err) {
    console.log('   Note:', err.response?.data?.message || err.message);
  }

  try {
    const res = await captainApi.post('/orders', {
      outletId: OUTLET_ID,
      tableId: TABLE_ID,
      orderType: 'dine_in',
      guestCount: 4
    });
    orderId = res.data.data.id;
    test('Order created', !!orderId);
  } catch (err) {
    console.log('   ✗ Create order failed:', err.response?.data?.message || err.message);
    failed++;
  }

  try {
    await captainApi.post(`/orders/${orderId}/items`, {
      items: [
        { itemId: 1, quantity: 2, specialInstructions: 'Extra spicy' },
        { itemId: 2, quantity: 1 }
      ]
    });
    test('Items added', true);
  } catch (err) {
    console.log('   ✗ Add items failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. EVENT: kot:created (Status: pending)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('3. EVENT: kot:created');
  console.log('─'.repeat(50));
  console.log('   Trigger: Captain sends KOT');
  console.log('   API: POST /orders/:id/kot');
  console.log('   Socket Event: kot:updated with type=kot:created');
  console.log('   Expected Status: pending');

  try {
    const res = await captainApi.post(`/orders/${orderId}/kot`);
    test('API call successful', res.data.success);
    
    if (res.data.data.tickets?.length > 0) {
      kotId = res.data.data.tickets[0].id;
      const station = res.data.data.tickets[0].station;
      console.log(`   Info: KOT ID = ${kotId}`);
      console.log(`   Info: KOT Number = ${res.data.data.tickets[0].kotNumber}`);
      console.log(`   Info: Station = ${station}`);
      test('KOT station is kitchen', station === 'kitchen');
    }

    // Verify status via GET
    const kotRes = await kitchenApi.get(`/orders/kot/${kotId}`);
    test('KOT status = pending', kotRes.data.data.status === 'pending');
    
    if (kotRes.data.data.items?.length > 0) {
      kotItemId = kotRes.data.data.items[0].id;
      console.log(`   Info: KOT Item ID = ${kotItemId}`);
    }
  } catch (err) {
    console.log('   ✗ Test failed:', err.response?.data?.message || err.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. EVENT: kot:accepted (Status: accepted)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('4. EVENT: kot:accepted');
  console.log('─'.repeat(50));
  console.log('   Trigger: Kitchen chef accepts KOT');
  console.log('   API: POST /orders/kot/:id/accept');
  console.log('   Socket Event: kot:updated with type=kot:accepted');
  console.log('   Expected Status: accepted');

  try {
    const res = await kitchenApi.post(`/orders/kot/${kotId}/accept`);
    test('API call successful', res.data.success);
    test('Status = accepted', res.data.data.status === 'accepted');
    test('Has accepted_at timestamp', !!res.data.data.accepted_at);
    console.log(`   Info: accepted_at = ${res.data.data.accepted_at}`);
  } catch (err) {
    console.log('   ✗ Test failed:', err.response?.data?.message || err.message);
    failed += 3;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. EVENT: kot:preparing (Status: preparing)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('5. EVENT: kot:preparing');
  console.log('─'.repeat(50));
  console.log('   Trigger: Kitchen chef starts cooking');
  console.log('   API: POST /orders/kot/:id/preparing');
  console.log('   Socket Event: kot:updated with type=kot:preparing');
  console.log('   Expected Status: preparing');

  try {
    const res = await kitchenApi.post(`/orders/kot/${kotId}/preparing`);
    test('API call successful', res.data.success);
    test('Status = preparing', res.data.data.status === 'preparing');
    console.log(`   Info: Status changed to preparing`);
  } catch (err) {
    console.log('   ✗ Test failed:', err.response?.data?.message || err.message);
    failed += 2;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. EVENT: kot:item_ready (Item Status: ready)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('6. EVENT: kot:item_ready');
  console.log('─'.repeat(50));
  console.log('   Trigger: Kitchen marks single item ready');
  console.log('   API: POST /orders/kot/items/:itemId/ready');
  console.log('   Socket Event: kot:updated with type=kot:item_ready');
  console.log('   Expected: Item status = ready');

  if (kotItemId) {
    try {
      const res = await kitchenApi.post(`/orders/kot/items/${kotItemId}/ready`);
      test('API call successful', res.data.success);
      
      const readyItem = res.data.data.items?.find(i => i.id === kotItemId);
      test('Item status = ready', readyItem?.status === 'ready');
      console.log(`   Info: Item ${kotItemId} marked ready`);
    } catch (err) {
      console.log('   ✗ Test failed:', err.response?.data?.message || err.message);
      failed += 2;
    }
  } else {
    console.log('   ⚠ No KOT item ID, skipping');
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. EVENT: kot:ready (Status: ready)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('7. EVENT: kot:ready');
  console.log('─'.repeat(50));
  console.log('   Trigger: Kitchen marks entire KOT ready');
  console.log('   API: POST /orders/kot/:id/ready');
  console.log('   Socket Event: kot:updated with type=kot:ready');
  console.log('   Captain also receives: item:ready event');
  console.log('   Expected Status: ready');

  try {
    const res = await kitchenApi.post(`/orders/kot/${kotId}/ready`);
    test('API call successful', res.data.success);
    test('Status = ready', res.data.data.status === 'ready');
    test('Has ready_at timestamp', !!res.data.data.ready_at);
    console.log(`   Info: ready_at = ${res.data.data.ready_at}`);
    
    // Verify all items are ready
    const kotRes = await kitchenApi.get(`/orders/kot/${kotId}`);
    const allReady = kotRes.data.data.items.every(i => i.status === 'ready');
    test('All items status = ready', allReady);
  } catch (err) {
    console.log('   ✗ Test failed:', err.response?.data?.message || err.message);
    failed += 4;
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. EVENT: kot:served (Status: served)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('8. EVENT: kot:served');
  console.log('─'.repeat(50));
  console.log('   Trigger: Captain picks up food from kitchen');
  console.log('   API: POST /orders/kot/:id/served');
  console.log('   Socket Event: kot:updated with type=kot:served');
  console.log('   Expected Status: served');

  try {
    const res = await captainApi.post(`/orders/kot/${kotId}/served`);
    test('API call successful', res.data.success);
    test('Status = served', res.data.data.status === 'served');
    test('Has served_at timestamp', !!res.data.data.served_at);
    test('Has served_by user ID', !!res.data.data.served_by);
    console.log(`   Info: served_at = ${res.data.data.served_at}`);
    console.log(`   Info: served_by = ${res.data.data.served_by}`);
  } catch (err) {
    console.log('   ✗ Test failed:', err.response?.data?.message || err.message);
    failed += 4;
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. VERIFY ORDER STATUS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('9. VERIFY ORDER STATUS');
  console.log('─'.repeat(50));

  try {
    const res = await captainApi.get(`/orders/${orderId}`);
    test('Order status = served', res.data.data.status === 'served');
    console.log(`   Info: Order ${orderId} status = ${res.data.data.status}`);
  } catch (err) {
    console.log('   ✗ Verify failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // ═══════════════════════════════════════════════════════════════
  // 10. CLEANUP
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('10. CLEANUP');
  console.log('─'.repeat(50));

  try {
    await captainApi.delete(`/tables/${TABLE_ID}/session`);
    test('Table session ended', true);
  } catch (err) {
    console.log('   Note:', err.response?.data?.message || err.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('KOT EVENT & STATUS REFERENCE');
  console.log('═'.repeat(70));
  console.log(`
┌──────────────────┬────────────────┬──────────────────┬─────────────────────────────────┐
│ Event Type       │ Triggered By   │ KOT Status       │ API Endpoint                    │
├──────────────────┼────────────────┼──────────────────┼─────────────────────────────────┤
│ kot:created      │ Captain        │ pending          │ POST /orders/:id/kot            │
│ kot:accepted     │ Kitchen        │ accepted         │ POST /orders/kot/:id/accept     │
│ kot:preparing    │ Kitchen        │ preparing        │ POST /orders/kot/:id/preparing  │
│ kot:item_ready   │ Kitchen        │ (item: ready)    │ POST /kot/items/:itemId/ready   │
│ kot:ready        │ Kitchen        │ ready            │ POST /orders/kot/:id/ready      │
│ kot:served       │ Captain        │ served           │ POST /orders/kot/:id/served     │
└──────────────────┴────────────────┴──────────────────┴─────────────────────────────────┘

SOCKET DETAILS:
  Internal Channel: kot:update (Redis PubSub)
  Emitted Event:    kot:updated (to clients)
  Kitchen Rooms:    kitchen:{outletId}, station:{outletId}:{station}
  Captain Room:     captain:{outletId} (receives item:ready on ready events)
  `);

  console.log('═'.repeat(70));
  console.log('TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`   ✓ Passed: ${passed}`);
  console.log(`   ✗ Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);
  console.log('═'.repeat(70));

  if (failed === 0) {
    console.log('\n✅ All KOT events and statuses verified successfully!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
