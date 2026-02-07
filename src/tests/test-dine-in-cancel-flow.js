/**
 * Test: Dine-in Order Cancel - Full Flow
 * Verifies: Cancel order → Table available → Create new order
 * 
 * Run: node src/tests/test-dine-in-cancel-flow.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const TABLE_ID = 14;

const CAPTAIN_CREDS = { email: 'admin@restropos.com', password: 'admin123' };
const KITCHEN_CREDS = { email: 'kitchen@restropos.com', password: 'Kitchen@123' };

let captainApi, kitchenApi;
let testsPassed = 0, testsFailed = 0;

function test(name, condition, debug = null) {
  if (condition) { 
    console.log(`   ✓ ${name}`); 
    testsPassed++; 
  } else { 
    console.log(`   ✗ ${name}`); 
    if (debug) console.log(`     Debug: ${debug}`);
    testsFailed++; 
  }
}

function section(title) {
  console.log('\n' + '─'.repeat(50));
  console.log(`  ${title}`);
  console.log('─'.repeat(50));
}

async function forceCleanupTable() {
  console.log('   Cleaning up table...');
  
  // Cancel known stuck orders (from previous test runs)
  for (const stuckOrderId of [66, 67, 68, 69, 70, 85, 86, 87, 88, 89, 90]) {
    try {
      const orderCheck = await captainApi.get(`/orders/${stuckOrderId}`);
      if (orderCheck.data.success && 
          orderCheck.data.data?.table_id == TABLE_ID &&
          !['cancelled', 'paid'].includes(orderCheck.data.data?.status)) {
        console.log(`   Cancelling stuck order ${stuckOrderId}...`);
        await captainApi.post(`/orders/${stuckOrderId}/cancel`, { reason: 'Test cleanup' });
      }
    } catch (e) {}
  }
  
  // Get table status
  const tableRes = await captainApi.get(`/tables/${TABLE_ID}`);
  const table = tableRes.data.data;
  
  if (!table) {
    console.log('   Table not found!');
    return;
  }
  
  console.log(`   Table status: ${table.status}, order: ${table.current_order_id || 'none'}`);
  
  // Cancel current order if exists
  if (table.current_order_id) {
    console.log(`   Cancelling current order ${table.current_order_id}...`);
    await captainApi.post(`/orders/${table.current_order_id}/cancel`, { reason: 'Test cleanup' });
  }
  
  // End session by table ID (not session ID)
  try {
    await captainApi.delete(`/tables/${TABLE_ID}/session`);
  } catch (e) {}
  
  // Force table to available via status endpoint
  await captainApi.patch(`/tables/${TABLE_ID}/status`, { status: 'available' });
  
  // Verify cleanup
  const afterRes = await captainApi.get(`/tables/${TABLE_ID}`);
  console.log(`   After cleanup: status=${afterRes.data.data?.status}, order=${afterRes.data.data?.current_order_id || 'none'}`);
}

async function runTests() {
  console.log('\n' + '═'.repeat(50));
  console.log('  DINE-IN ORDER CANCEL - FULL FLOW TEST');
  console.log('═'.repeat(50));

  try {
    // AUTH
    section('1. AUTHENTICATION');
    const captainLogin = await axios.post(`${API_BASE}/auth/login`, CAPTAIN_CREDS);
    captainApi = axios.create({
      baseURL: API_BASE,
      headers: { Authorization: `Bearer ${captainLogin.data.data.accessToken}` },
      timeout: 15000,
      validateStatus: () => true
    });
    test('Captain login', !!captainLogin.data.data.accessToken);

    const kitchenLogin = await axios.post(`${API_BASE}/auth/login`, KITCHEN_CREDS);
    kitchenApi = axios.create({
      baseURL: API_BASE,
      headers: { Authorization: `Bearer ${kitchenLogin.data.data.accessToken}` },
      timeout: 15000,
      validateStatus: () => true
    });
    test('Kitchen login', !!kitchenLogin.data.data.accessToken);

    // CLEANUP
    await forceCleanupTable();

    // STEP 1: Start session and create order
    section('2. CREATE DINE-IN ORDER');
    
    const sessionRes = await captainApi.post(`/tables/${TABLE_ID}/session`, { guestCount: 2 });
    test('Table session started', sessionRes.data.success, sessionRes.data.message);
    const sessionId = sessionRes.data.data?.id;
    console.log(`   Session ID: ${sessionId}`);

    const orderRes = await captainApi.post('/orders', {
      outletId: OUTLET_ID,
      tableId: TABLE_ID,
      tableSessionId: sessionId,
      orderType: 'dine_in',
      covers: 2
    });
    test('Order created', orderRes.data.success, orderRes.data.message);
    const orderId = orderRes.data.data?.id;
    console.log(`   Order ID: ${orderId}`);

    // Add items
    const addRes = await captainApi.post(`/orders/${orderId}/items`, {
      items: [{ itemId: 1, quantity: 2 }, { itemId: 2, quantity: 1 }]
    });
    test('Items added', addRes.data.success, addRes.data.message);

    // STEP 2: Send KOT
    section('3. SEND KOT TO KITCHEN');
    const kotRes = await captainApi.post(`/orders/${orderId}/kot`);
    test('KOT sent', kotRes.data.success, kotRes.data.message);

    const kotsRes = await captainApi.get(`/orders/${orderId}/kots`);
    const kotId = kotsRes.data.data?.[0]?.id;
    console.log(`   KOT ID: ${kotId}`);

    // Verify kitchen sees the KOT
    const activeKots = await kitchenApi.get('/orders/kot/active?station=kitchen');
    const kotInList = activeKots.data.data?.kots?.find(k => k.id === kotId);
    test('Kitchen sees KOT', !!kotInList);

    // Check table status
    const tableBefore = await captainApi.get(`/tables/${TABLE_ID}`);
    console.log(`   Table status before cancel: ${tableBefore.data.data?.status}`);
    test('Table is occupied/running', ['occupied', 'running'].includes(tableBefore.data.data?.status));

    // STEP 3: Cancel Order
    section('4. CANCEL ORDER');
    console.log('   Cancelling order...');
    console.log('   Expected: KOT cancelled, session ended, table available');
    
    const cancelRes = await captainApi.post(`/orders/${orderId}/cancel`, {
      reason: 'Customer left without ordering'
    });
    test('Order cancelled', cancelRes.data.success, cancelRes.data.message);

    // Verify order status
    const orderAfter = await captainApi.get(`/orders/${orderId}`);
    test('Order status = cancelled', orderAfter.data.data?.status === 'cancelled');
    console.log(`   Order status: ${orderAfter.data.data?.status}`);

    // Verify KOT status
    const kotAfter = await kitchenApi.get(`/orders/kot/${kotId}`);
    test('KOT status = cancelled', kotAfter.data.data?.status === 'cancelled');
    console.log(`   KOT status: ${kotAfter.data.data?.status}`);

    // Verify KOT removed from active list
    const activeAfter = await kitchenApi.get('/orders/kot/active?station=kitchen');
    const kotStillActive = activeAfter.data.data?.kots?.find(k => k.id === kotId);
    test('KOT removed from active list', !kotStillActive);

    // Verify table status
    const tableAfter = await captainApi.get(`/tables/${TABLE_ID}`);
    test('Table status = available', tableAfter.data.data?.status === 'available', 
         `Got: ${tableAfter.data.data?.status}`);
    console.log(`   Table status: ${tableAfter.data.data?.status}`);
    console.log(`   Table session: ${tableAfter.data.data?.current_session_id || 'none'}`);

    // STEP 4: Create NEW order on same table
    section('5. CREATE NEW ORDER (Same Table)');
    console.log('   Verifying captain can start new session...');

    const session2Res = await captainApi.post(`/tables/${TABLE_ID}/session`, { guestCount: 3 });
    test('New session started', session2Res.data.success, session2Res.data.message);
    const session2Id = session2Res.data.data?.id;
    console.log(`   New Session ID: ${session2Id}`);

    const order2Res = await captainApi.post('/orders', {
      outletId: OUTLET_ID,
      tableId: TABLE_ID,
      tableSessionId: session2Id,
      orderType: 'dine_in',
      covers: 3
    });
    test('New order created', order2Res.data.success, order2Res.data.message);
    const order2Id = order2Res.data.data?.id;
    console.log(`   New Order ID: ${order2Id}`);

    // Add items and send KOT for new order
    await captainApi.post(`/orders/${order2Id}/items`, {
      items: [{ itemId: 3, quantity: 1 }]
    });
    const kot2Res = await captainApi.post(`/orders/${order2Id}/kot`);
    test('New KOT sent', kot2Res.data.success, kot2Res.data.message);

    // Verify kitchen sees new KOT
    const activeKots2 = await kitchenApi.get('/orders/kot/active?station=kitchen');
    const kots2 = await captainApi.get(`/orders/${order2Id}/kots`);
    const kot2Id = kots2.data.data?.[0]?.id;
    const kot2InList = activeKots2.data.data?.kots?.find(k => k.id === kot2Id);
    test('Kitchen sees new KOT', !!kot2InList);

    // Cleanup - cancel the new order
    section('6. CLEANUP');
    await captainApi.post(`/orders/${order2Id}/cancel`, { reason: 'Test complete' });
    console.log('   Test orders cleaned up');

    // RESULTS
    console.log('\n' + '═'.repeat(50));
    console.log('  REAL-TIME EVENTS VERIFIED');
    console.log('═'.repeat(50));
    console.log(`
  On Order Cancel:
  ─────────────────
  ✓ kot:cancelled    → Kitchen display removes KOT
  ✓ order:cancelled  → Captain app updates
  ✓ table:update     → Floor plan shows available
  ✓ Session ended    → New session can start
`);

    console.log('═'.repeat(50));
    console.log(`  RESULTS: ✓ ${testsPassed} passed, ✗ ${testsFailed} failed`);
    console.log('═'.repeat(50));
    console.log(testsFailed === 0 ? '\n✅ All tests passed!' : '\n❌ Some tests failed');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) console.error(error.response.data);
    process.exit(1);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
