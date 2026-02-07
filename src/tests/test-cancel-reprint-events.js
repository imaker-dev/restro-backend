/**
 * Test: Order & KOT Cancel/Reprint with Real-time Events
 * Run: node src/tests/test-cancel-reprint-events.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

const CAPTAIN_CREDS = { email: 'admin@restropos.com', password: 'admin123' };
const KITCHEN_CREDS = { email: 'kitchen@restropos.com', password: 'Kitchen@123' };

let captainApi, kitchenApi;
let testsPassed = 0, testsFailed = 0;

function test(name, condition) {
  if (condition) { console.log(`   ✓ ${name}`); testsPassed++; }
  else { console.log(`   ✗ ${name}`); testsFailed++; }
}

function section(num, title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`${num}. ${title}`);
  console.log('─'.repeat(40));
}

async function runTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('ORDER & KOT CANCEL/REPRINT - REAL-TIME EVENTS');
  console.log('═'.repeat(60));

  try {
    // 1. AUTH
    section(1, 'AUTHENTICATION');
    const captainLogin = await axios.post(`${API_BASE}/auth/login`, CAPTAIN_CREDS);
    const captainToken = captainLogin.data.data.accessToken;
    test('Captain login', !!captainToken);
    
    const kitchenLogin = await axios.post(`${API_BASE}/auth/login`, KITCHEN_CREDS);
    const kitchenToken = kitchenLogin.data.data.accessToken;
    test('Kitchen login', !!kitchenToken);

    captainApi = axios.create({
      baseURL: API_BASE, headers: { Authorization: `Bearer ${captainToken}` },
      timeout: 15000, validateStatus: () => true
    });
    kitchenApi = axios.create({
      baseURL: API_BASE, headers: { Authorization: `Bearer ${kitchenToken}` },
      timeout: 15000, validateStatus: () => true
    });

    // 2. CREATE ORDER (Takeaway - simpler, no table issues)
    section(2, 'CREATE ORDER (Captain)');
    const orderRes = await captainApi.post('/orders', {
      outletId: OUTLET_ID, orderType: 'takeaway',
      customerName: 'Test Customer', customerPhone: '9999999999'
    });
    test('Order created', orderRes.data.success);
    const orderId = orderRes.data.data?.id;
    console.log(`   Order ID: ${orderId}`);

    await captainApi.post(`/orders/${orderId}/items`, {
      items: [
        { itemId: 1, quantity: 2 },
        { itemId: 2, quantity: 1 }
      ]
    });
    
    const orderDetails = await captainApi.get(`/orders/${orderId}`);
    const orderItemId = orderDetails.data.data?.items?.[0]?.id;
    test('Items added', !!orderItemId);

    // 3. SEND KOT
    section(3, 'SEND KOT (Captain → Kitchen)');
    console.log('   → Event: kot:created to kitchen:{outletId}');
    const kotRes = await captainApi.post(`/orders/${orderId}/kot`);
    test('KOT sent', kotRes.data.success);
    
    const kotsRes = await captainApi.get(`/orders/${orderId}/kots`);
    const kotId = kotsRes.data.data?.[0]?.id;
    console.log(`   KOT ID: ${kotId}`);

    // 4. ACTIVE KOTS WITH STATS (Kitchen View)
    section(4, 'ACTIVE KOTS WITH STATS (Kitchen)');
    const activeRes = await kitchenApi.get('/orders/kot/active?station=kitchen');
    test('API success', activeRes.data.success);
    test('Has kots array', Array.isArray(activeRes.data.data?.kots));
    test('Has stats', !!activeRes.data.data?.stats);
    const stats = activeRes.data.data?.stats;
    console.log(`   Stats: pending=${stats?.pending_count}, preparing=${stats?.preparing_count}`);

    // 5. ITEM CANCEL
    section(5, 'ITEM CANCEL (Captain)');
    console.log('   → Event: kot:item_cancelled to kitchen:{outletId}');
    const cancelItemRes = await captainApi.post(`/orders/items/${orderItemId}/cancel`, {
      reason: 'Customer changed mind'
    });
    test('Item cancelled', cancelItemRes.data.success);
    if (!cancelItemRes.data.success) console.log(`   Debug: ${cancelItemRes.data.message}`);

    const kotAfter = await kitchenApi.get(`/orders/kot/${kotId}`);
    const cancelled = kotAfter.data.data?.items?.find(i => i.status === 'cancelled');
    test('Kitchen sees cancelled item', !!cancelled);

    // 6. KOT REPRINT
    section(6, 'KOT REPRINT');
    console.log('   → Event: kot:reprinted to kitchen:{outletId}');
    console.log('   → Prints with "REPRINT" label');
    const reprintRes = await captainApi.post(`/orders/kot/${kotId}/reprint`);
    test('Reprint success', reprintRes.data.success);

    // 7. KITCHEN WORKFLOW
    section(7, 'KITCHEN WORKFLOW');
    const acceptRes = await kitchenApi.post(`/orders/kot/${kotId}/accept`);
    test('KOT accepted', acceptRes.data.success);
    console.log('   → Event: kot:accepted');

    const prepareRes = await kitchenApi.post(`/orders/kot/${kotId}/preparing`);
    test('KOT preparing', prepareRes.data.success);
    console.log('   → Event: kot:preparing');

    // 8. ORDER CANCEL - Captain can cancel their own orders
    section(8, 'ORDER CANCEL');
    console.log('   → Event: kot:cancelled to kitchen');
    console.log('   → Event: order:cancelled to captain');
    const cancelRes = await captainApi.post(`/orders/${orderId}/cancel`, {
      reason: 'Customer left'
    });
    test('Order cancelled', cancelRes.data.success);
    if (!cancelRes.data.success) console.log(`   Debug: ${cancelRes.data.message}`);

    const orderAfter = await captainApi.get(`/orders/${orderId}`);
    test('Order status = cancelled', orderAfter.data.data?.status === 'cancelled');

    const kotCancelled = await kitchenApi.get(`/orders/kot/${kotId}`);
    test('KOT status = cancelled', kotCancelled.data.data?.status === 'cancelled');

    // 9. ORDER CANCEL - Pending (no approval needed)
    section(9, 'ORDER CANCEL - Pending Items Only');
    const order2Res = await captainApi.post('/orders', {
      outletId: OUTLET_ID, orderType: 'takeaway', customerName: 'Test 2'
    });
    const order2Id = order2Res.data.data?.id;
    await captainApi.post(`/orders/${order2Id}/items`, { items: [{ itemId: 1, quantity: 1 }] });
    await captainApi.post(`/orders/${order2Id}/kot`);
    
    const cancelPending = await captainApi.post(`/orders/${order2Id}/cancel`, {
      reason: 'Changed mind'
    });
    test('Pending order cancelled (no approval)', cancelPending.data.success);

    // SUMMARY
    console.log('\n' + '═'.repeat(60));
    console.log('REAL-TIME EVENTS REFERENCE');
    console.log('═'.repeat(60));
    console.log(`
  Captain Actions → Kitchen Events:
  ─────────────────────────────────
  Send KOT        → kot:created
  Item Cancel     → kot:item_cancelled  
  KOT Reprint     → kot:reprinted
  Order Cancel    → kot:cancelled (per KOT)

  Kitchen Actions → Captain Events:
  ─────────────────────────────────
  Accept KOT      → kot:accepted
  Preparing       → kot:preparing
  Item Ready      → kot:item_ready, item:ready
  KOT Ready       → kot:ready, item:ready
  Served          → kot:served
`);

    console.log('═'.repeat(60));
    console.log(`RESULTS: ✓ ${testsPassed} passed, ✗ ${testsFailed} failed`);
    console.log('═'.repeat(60));
    console.log(testsFailed === 0 ? '\n✅ All tests passed!' : '\n❌ Some tests failed');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
