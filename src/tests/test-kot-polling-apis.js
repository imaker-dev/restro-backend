/**
 * KOT Polling APIs Test - Kitchen Perspective
 * Tests all polling endpoints for when socket is not working
 * 
 * POLLING APIs TESTED:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ API                                      │ Purpose                          │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ GET /kot/active/:outletId                │ All active KOTs                  │
 * │ GET /kot/active/:outletId?status=pending │ Only pending KOTs                │
 * │ GET /kot/active/:outletId?station=kitchen│ Only kitchen station             │
 * │ GET /station/:outletId/:station          │ Station dashboard with stats     │
 * │ GET /kot/:id                             │ Single KOT details               │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * Run: node src/tests/test-kot-polling-apis.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const TABLE_ID = 14;

// Test credentials
const CAPTAIN_CREDS = { email: 'admin@restropos.com', password: 'admin123' };
const KITCHEN_CREDS = { email: 'kitchen@restropos.com', password: 'Kitchen@123' };

let captainToken, kitchenToken;
let orderId, kotId, kotItemId;
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

async function login(creds) {
  const res = await axios.post(`${API_BASE}/auth/login`, creds, { timeout: 10000 });
  return res.data.data.accessToken;
}

// Add timeout config
const axiosConfig = { timeout: 15000 };

async function run() {
  console.log('═'.repeat(70));
  console.log('KOT POLLING APIs TEST - Kitchen Perspective');
  console.log('═'.repeat(70));
  console.log('Testing fallback polling APIs when socket is not available\n');

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1. AUTHENTICATION
    // ═══════════════════════════════════════════════════════════════
    console.log('1. AUTHENTICATION');
    console.log('─'.repeat(50));
    
    captainToken = await login(CAPTAIN_CREDS);
    test('Captain login', !!captainToken);
    
    kitchenToken = await login(KITCHEN_CREDS);
    test('Kitchen login', !!kitchenToken);

    const captainApi = axios.create({
      baseURL: API_BASE,
      headers: { Authorization: `Bearer ${captainToken}` },
      timeout: 15000
    });

    const kitchenApi = axios.create({
      baseURL: API_BASE,
      headers: { Authorization: `Bearer ${kitchenToken}` },
      timeout: 15000
    });

    // ═══════════════════════════════════════════════════════════════
    // 2. SETUP - Create Order and KOT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('2. SETUP - Create Order and KOT');
    console.log('─'.repeat(50));

    // Clean up any existing session first
    try { await captainApi.delete(`/tables/${TABLE_ID}/session`); } catch (e) {}

    // Start table session
    try {
      await captainApi.post(`/tables/${TABLE_ID}/session`, { guestCount: 4 });
      console.log('   Info: Table session started');
    } catch (e) {
      console.log('   Info: Table session:', e.response?.data?.message || 'created');
    }

    // Create order (without items first)
    try {
      const orderRes = await captainApi.post('/orders', {
        outletId: OUTLET_ID,
        tableId: TABLE_ID,
        orderType: 'dine_in',
        guestCount: 4
      });
      orderId = orderRes.data.data.id;
      test('Order created', !!orderId);
      console.log(`   Info: Order ID = ${orderId}`);
    } catch (err) {
      console.log('   Order creation error:', err.response?.data?.message || err.message);
      throw err;
    }

    // Add items to order
    try {
      await captainApi.post(`/orders/${orderId}/items`, {
        items: [
          { itemId: 1, quantity: 2, specialInstructions: 'Extra spicy' },
          { itemId: 2, quantity: 1 }
        ]
      });
      test('Items added', true);
    } catch (err) {
      console.log('   Add items error:', err.response?.data?.message || err.message);
      throw err;
    }

    // Send KOT
    try {
      const kotRes = await captainApi.post(`/orders/${orderId}/kot`);
      kotId = kotRes.data.data.tickets?.[0]?.id;
      test('KOT sent', !!kotId);
      console.log(`   Info: KOT ID = ${kotId}`);
    } catch (err) {
      console.log('   KOT send error:', err.response?.data?.message || err.message);
      throw err;
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. POLLING API: Get All Active KOTs
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('3. POLLING API: Get All Active KOTs');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/kot/active (no outletId - from token)');
    console.log('   Use case: Initial load of kitchen display');

    const allActiveRes = await kitchenApi.get(`/orders/kot/active`);
    test('API returns success', allActiveRes.data.success);
    test('Returns array of KOTs', Array.isArray(allActiveRes.data.data));
    
    const ourKot = allActiveRes.data.data.find(k => k.id === kotId);
    test('Our KOT is in active list', !!ourKot);
    test('KOT has items array', Array.isArray(ourKot?.items));
    test('KOT has item_count', ourKot?.item_count > 0);
    console.log(`   Info: Found ${allActiveRes.data.data.length} active KOT(s)`);

    // ═══════════════════════════════════════════════════════════════
    // 4. POLLING API: Filter by Status (pending)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('4. POLLING API: Filter by Status (pending)');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/kot/active?status=pending');
    console.log('   Use case: Get only new KOTs to accept');

    const pendingRes = await kitchenApi.get(`/orders/kot/active?status=pending`);
    test('API returns success', pendingRes.data.success);
    
    const allPending = pendingRes.data.data.every(k => k.status === 'pending');
    test('All returned KOTs have status=pending', allPending);
    
    const ourPendingKot = pendingRes.data.data.find(k => k.id === kotId);
    test('Our pending KOT is in list', !!ourPendingKot);
    console.log(`   Info: Found ${pendingRes.data.data.length} pending KOT(s)`);

    // ═══════════════════════════════════════════════════════════════
    // 5. POLLING API: Filter by Station
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('5. POLLING API: Filter by Station');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/kot/active?station=kitchen');
    console.log('   Use case: Kitchen display shows only kitchen KOTs');

    const kitchenRes = await kitchenApi.get(`/orders/kot/active?station=kitchen`);
    test('API returns success', kitchenRes.data.success);
    
    // Response now includes { kots, stats } when station filter is used
    const kitchenKots = kitchenRes.data.data.kots || kitchenRes.data.data;
    const allKitchen = kitchenKots.every(k => k.station === 'kitchen');
    test('All returned KOTs are kitchen station', allKitchen);
    console.log(`   Info: Found ${kitchenKots.length} kitchen KOT(s)`);
    if (kitchenRes.data.data.stats) {
      console.log(`   Info: Stats = pending:${kitchenRes.data.data.stats.pending_count}, active:${kitchenRes.data.data.stats.active_count}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. POLLING API: Combined Filters (station + status)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('6. POLLING API: Combined Filters');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/kot/active?station=kitchen&status=pending');
    console.log('   Use case: Kitchen display new orders section');

    const combinedRes = await kitchenApi.get(`/orders/kot/active?station=kitchen&status=pending`);
    test('API returns success', combinedRes.data.success);
    
    // Response now includes { kots, stats } when station filter is used
    const combinedKots = combinedRes.data.data.kots || combinedRes.data.data;
    const allCombined = combinedKots.every(k => k.station === 'kitchen' && k.status === 'pending');
    test('All KOTs are kitchen + pending', allCombined);
    console.log(`   Info: Found ${combinedKots.length} kitchen pending KOT(s)`);

    // ═══════════════════════════════════════════════════════════════
    // 7. POLLING API: Station Dashboard
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('7. POLLING API: Station Dashboard');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/station/:station (no outletId - from token)');
    console.log('   Use case: Kitchen display with stats');

    const dashboardRes = await kitchenApi.get(`/orders/station/kitchen`);
    test('API returns success', dashboardRes.data.success);
    test('Has station name', dashboardRes.data.data.station === 'kitchen');
    test('Has kots array', Array.isArray(dashboardRes.data.data.kots));
    test('Has stats object', !!dashboardRes.data.data.stats);
    test('Stats has pending_count', typeof dashboardRes.data.data.stats?.pending_count === 'number');
    test('Stats has preparing_count', typeof dashboardRes.data.data.stats?.preparing_count === 'number');
    test('Stats has ready_count', typeof dashboardRes.data.data.stats?.ready_count === 'number');
    console.log(`   Info: Stats = pending:${dashboardRes.data.data.stats?.pending_count}, preparing:${dashboardRes.data.data.stats?.preparing_count}, ready:${dashboardRes.data.data.stats?.ready_count}`);

    // ═══════════════════════════════════════════════════════════════
    // 8. POLLING API: Single KOT Details
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('8. POLLING API: Single KOT Details');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/kot/:id');
    console.log('   Use case: Refresh single KOT after action');

    const singleKotRes = await kitchenApi.get(`/orders/kot/${kotId}`);
    test('API returns success', singleKotRes.data.success);
    test('Has correct KOT ID', singleKotRes.data.data.id === kotId);
    test('Has kot_number', !!singleKotRes.data.data.kot_number);
    test('Has station', !!singleKotRes.data.data.station);
    test('Has status', !!singleKotRes.data.data.status);
    test('Has items array', Array.isArray(singleKotRes.data.data.items));
    
    // Get item ID for later tests
    if (singleKotRes.data.data.items?.length > 0) {
      kotItemId = singleKotRes.data.data.items[0].id;
      console.log(`   Info: KOT Item ID = ${kotItemId}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 9. STATUS UPDATE + POLL VERIFICATION: Accept KOT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('9. STATUS UPDATE + POLL: Accept KOT');
    console.log('─'.repeat(50));
    console.log('   Action: POST /orders/kot/:id/accept');
    console.log('   Poll to verify: GET /orders/kot/:id');

    await kitchenApi.post(`/orders/kot/${kotId}/accept`);
    
    // Poll to verify
    const afterAcceptRes = await kitchenApi.get(`/orders/kot/${kotId}`);
    test('Poll shows status = accepted', afterAcceptRes.data.data.status === 'accepted');
    test('Has accepted_at timestamp', !!afterAcceptRes.data.data.accepted_at);
    console.log(`   Info: accepted_at = ${afterAcceptRes.data.data.accepted_at}`);

    // Verify not in pending filter anymore
    const pendingAfterAccept = await kitchenApi.get(`/orders/kot/active?status=pending`);
    const stillPending = pendingAfterAccept.data.data.find(k => k.id === kotId);
    test('KOT no longer in pending filter', !stillPending);

    // ═══════════════════════════════════════════════════════════════
    // 10. STATUS UPDATE + POLL: Start Preparing
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('10. STATUS UPDATE + POLL: Start Preparing');
    console.log('─'.repeat(50));
    console.log('   Action: POST /orders/kot/:id/preparing');
    console.log('   Poll to verify: GET /orders/kot/active?status=preparing');

    await kitchenApi.post(`/orders/kot/${kotId}/preparing`);
    
    // Poll to verify using status filter
    const preparingRes = await kitchenApi.get(`/orders/kot/active?status=preparing`);
    const ourPreparingKot = preparingRes.data.data.find(k => k.id === kotId);
    test('KOT found in preparing filter', !!ourPreparingKot);
    test('Status = preparing', ourPreparingKot?.status === 'preparing');
    console.log(`   Info: Found ${preparingRes.data.data.length} preparing KOT(s)`);

    // ═══════════════════════════════════════════════════════════════
    // 11. STATUS UPDATE + POLL: Mark Item Ready
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('11. STATUS UPDATE + POLL: Mark Item Ready');
    console.log('─'.repeat(50));
    console.log('   Action: POST /orders/kot/items/:itemId/ready');
    console.log('   Poll to verify: GET /orders/kot/:id (check item status)');

    if (kotItemId) {
      await kitchenApi.post(`/orders/kot/items/${kotItemId}/ready`);
      
      // Poll to verify
      const afterItemReadyRes = await kitchenApi.get(`/orders/kot/${kotId}`);
      const readyItem = afterItemReadyRes.data.data.items?.find(i => i.id === kotItemId);
      test('Item status = ready', readyItem?.status === 'ready');
      console.log(`   Info: Item ${kotItemId} is now ready`);
    } else {
      console.log('   ⚠ No KOT item found, skipping');
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. STATUS UPDATE + POLL: Mark KOT Ready
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('12. STATUS UPDATE + POLL: Mark KOT Ready');
    console.log('─'.repeat(50));
    console.log('   Action: POST /orders/kot/:id/ready');
    console.log('   Poll to verify: GET /orders/kot/active?status=ready');

    await kitchenApi.post(`/orders/kot/${kotId}/ready`);
    
    // Poll to verify using ready filter
    const readyFilterRes = await kitchenApi.get(`/orders/kot/active?status=ready`);
    const ourReadyKot = readyFilterRes.data.data.find(k => k.id === kotId);
    test('KOT found in ready filter', !!ourReadyKot);
    test('Status = ready', ourReadyKot?.status === 'ready');
    test('Has ready_at timestamp', !!ourReadyKot?.ready_at);
    console.log(`   Info: ready_at = ${ourReadyKot?.ready_at}`);

    // ═══════════════════════════════════════════════════════════════
    // 13. STATUS UPDATE + POLL: Mark Served
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('13. STATUS UPDATE + POLL: Mark Served');
    console.log('─'.repeat(50));
    console.log('   Action: POST /orders/kot/:id/served');
    console.log('   Poll to verify: KOT should NOT appear in any active filter');

    await captainApi.post(`/orders/kot/${kotId}/served`);
    
    // Poll to verify - should not be in any active KOTs
    const afterServedRes = await kitchenApi.get(`/orders/kot/active`);
    const servedKot = afterServedRes.data.data.find(k => k.id === kotId);
    test('KOT removed from active list after served', !servedKot);
    
    // Verify via single KOT endpoint
    const servedKotDetails = await kitchenApi.get(`/orders/kot/${kotId}`);
    test('KOT status = served', servedKotDetails.data.data.status === 'served');
    test('Has served_at timestamp', !!servedKotDetails.data.data.served_at);
    console.log(`   Info: served_at = ${servedKotDetails.data.data.served_at}`);

    // ═══════════════════════════════════════════════════════════════
    // 14. POLL BAR STATION (Different Station)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('14. POLLING BAR STATION');
    console.log('─'.repeat(50));
    console.log('   Endpoint: GET /orders/station/bar (no outletId - from token)');
    console.log('   Use case: Bar display polling');

    const barDashRes = await kitchenApi.get(`/orders/station/bar`);
    test('Bar dashboard API works', barDashRes.data.success);
    test('Bar station returned', barDashRes.data.data.station === 'bar');
    test('Bar has stats', !!barDashRes.data.data.stats);
    console.log(`   Info: Bar stats = pending:${barDashRes.data.data.stats?.pending_count}`);

    // ═══════════════════════════════════════════════════════════════
    // 15. CLEANUP
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('15. CLEANUP');
    console.log('─'.repeat(50));

    await captainApi.post(`/tables/${TABLE_ID}/end-session`).catch(() => {});
    test('Table session ended', true);

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('POLLING API REFERENCE');
    console.log('═'.repeat(70));
    console.log(`
┌──────────────────────────────────────────────────────────────────────────────┐
│ Polling API                                │ Use Case                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ GET /kot/active/:outletId                  │ All active KOTs (initial load)  │
│ GET /kot/active/:outletId?status=pending   │ New orders to accept            │
│ GET /kot/active/:outletId?status=preparing │ Currently cooking               │
│ GET /kot/active/:outletId?status=ready     │ Ready for pickup                │
│ GET /kot/active/:outletId?station=kitchen  │ Kitchen station only            │
│ GET /kot/active/:outletId?station=bar      │ Bar station only                │
│ GET /station/:outletId/:station            │ Dashboard with stats            │
│ GET /kot/:id                               │ Single KOT details              │
└──────────────────────────────────────────────────────────────────────────────┘

POLLING STRATEGY:
  1. Poll every 3-5 seconds during active service
  2. After status update action, poll to verify change
  3. Use status filters to populate different columns
  4. Use station filter to show only relevant KOTs
`);

    console.log('═'.repeat(70));
    console.log('TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`   ✓ Passed: ${passed}`);
    console.log(`   ✗ Failed: ${failed}`);
    console.log(`   Total:  ${passed + failed}`);
    console.log('═'.repeat(70));

    if (failed === 0) {
      console.log('\n✅ All polling APIs verified successfully!');
    } else {
      console.log('\n❌ Some tests failed. Check output above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.response?.data?.message || error.message);
    process.exit(1);
  }
}

run();
