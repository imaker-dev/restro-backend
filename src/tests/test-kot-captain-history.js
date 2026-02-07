/**
 * Test KOT Flow and Captain Order History APIs
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

async function runTests() {
  console.log('='.repeat(70));
  console.log('KOT FLOW & CAPTAIN ORDER HISTORY - COMPREHENSIVE TEST');
  console.log('='.repeat(70));

  let token, orderId, kotId, tableId = 14;
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

  // 1. Login
  console.log('\n1. AUTHENTICATION');
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@restropos.com',
      password: 'admin123'
    });
    token = res.data.data.accessToken;
    test('Login successful', !!token);
  } catch (err) {
    console.log('   ✗ Login failed:', err.response?.data?.message || err.message);
    failed++;
    process.exit(1);
  }

  const api = axios.create({
    baseURL: BASE_URL,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // 2. Reset table
  console.log('\n2. TABLE SETUP');
  try {
    // End existing session if any
    try { await api.delete(`/tables/${tableId}/session`); } catch (e) {}
    
    // Start fresh session
    const sessionRes = await api.post(`/tables/${tableId}/session`, { guestCount: 2 });
    test('Table session started', sessionRes.data.success);
  } catch (err) {
    console.log('   Note:', err.response?.data?.message || err.message);
  }

  // 3. Create Order
  console.log('\n3. ORDER CREATION');
  try {
    const res = await api.post('/orders', {
      outletId: OUTLET_ID,
      tableId: tableId,
      orderType: 'dine_in',
      guestCount: 2
    });
    orderId = res.data.data.id;
    test('Order created', !!orderId);
    test('Order has order_number', !!res.data.data.order_number || !!res.data.data.orderNumber);
  } catch (err) {
    console.log('   ✗ Create order failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 4. Add Items
  console.log('\n4. ADD ITEMS');
  try {
    const res = await api.post(`/orders/${orderId}/items`, {
      items: [
        { itemId: 1, quantity: 2, specialInstructions: 'Extra spicy' },
        { itemId: 2, quantity: 1 },
        { itemId: 5, quantity: 2, specialInstructions: 'Less ice' }
      ]
    });
    test('Items added', res.data.success);
  } catch (err) {
    console.log('   ✗ Add items failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 5. Send KOT
  console.log('\n5. SEND KOT');
  try {
    const res = await api.post(`/orders/${orderId}/kot`);
    test('KOT sent successfully', res.data.success);
    test('KOT tickets returned', res.data.data.tickets?.length > 0);
    
    if (res.data.data.tickets?.length > 0) {
      kotId = res.data.data.tickets[0].id;
      console.log(`   Info: Created ${res.data.data.tickets.length} KOT(s)`);
      res.data.data.tickets.forEach(t => {
        console.log(`         - ${t.kotNumber} (${t.station}): ${t.items?.length || t.itemCount} items`);
      });
    }
  } catch (err) {
    console.log('   ✗ Send KOT failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 6. Get Active KOTs
  console.log('\n6. GET ACTIVE KOTS');
  try {
    const res = await api.get(`/orders/kot/active/${OUTLET_ID}`);
    test('Active KOTs retrieved', res.data.success);
    test('Returns array', Array.isArray(res.data.data));
    
    // Test with station filter
    const kitchenRes = await api.get(`/orders/kot/active/${OUTLET_ID}?station=kitchen`);
    test('Kitchen filter works', kitchenRes.data.success);
  } catch (err) {
    console.log('   ✗ Get active KOTs failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 7. KOT Status Updates
  console.log('\n7. KOT STATUS UPDATES');
  if (kotId) {
    try {
      // Accept
      const acceptRes = await api.post(`/orders/kot/${kotId}/accept`);
      test('KOT accepted', acceptRes.data.data?.status === 'accepted');

      // Preparing
      const prepRes = await api.post(`/orders/kot/${kotId}/preparing`);
      test('KOT preparing', prepRes.data.data?.status === 'preparing');

      // Ready
      const readyRes = await api.post(`/orders/kot/${kotId}/ready`);
      test('KOT ready', readyRes.data.data?.status === 'ready');

      // Served
      const servedRes = await api.post(`/orders/kot/${kotId}/served`);
      test('KOT served', servedRes.data.data?.status === 'served');
    } catch (err) {
      console.log('   ✗ KOT status update failed:', err.response?.data?.message || err.message);
      failed++;
    }
  }

  // 8. Get KOTs for Order
  console.log('\n8. GET KOTS FOR ORDER');
  try {
    const res = await api.get(`/orders/${orderId}/kots`);
    test('KOTs for order retrieved', res.data.success);
    test('Returns array of KOTs', Array.isArray(res.data.data));
  } catch (err) {
    console.log('   ✗ Failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 9. Captain Order History
  console.log('\n9. CAPTAIN ORDER HISTORY');
  try {
    // All orders
    const allRes = await api.get(`/orders/captain/history/${OUTLET_ID}`);
    test('History - All orders', allRes.data.success);
    test('History - Has pagination', !!allRes.data.data.pagination);
    test('History - Has orders array', Array.isArray(allRes.data.data.orders));

    // Running orders
    const runningRes = await api.get(`/orders/captain/history/${OUTLET_ID}?status=running`);
    test('History - Running filter', runningRes.data.success);

    // Completed orders
    const completedRes = await api.get(`/orders/captain/history/${OUTLET_ID}?status=completed`);
    test('History - Completed filter', completedRes.data.success);

    // Cancelled orders
    const cancelledRes = await api.get(`/orders/captain/history/${OUTLET_ID}?status=cancelled`);
    test('History - Cancelled filter', cancelledRes.data.success);

    // Search
    const searchRes = await api.get(`/orders/captain/history/${OUTLET_ID}?search=ORD`);
    test('History - Search filter', searchRes.data.success);

    // Date range
    const dateRes = await api.get(`/orders/captain/history/${OUTLET_ID}?startDate=2026-02-01&endDate=2026-02-28`);
    test('History - Date range filter', dateRes.data.success);

    // Pagination
    const pageRes = await api.get(`/orders/captain/history/${OUTLET_ID}?page=1&limit=5`);
    test('History - Pagination', pageRes.data.success && pageRes.data.data.pagination.limit === 5);

    // Sort
    const sortRes = await api.get(`/orders/captain/history/${OUTLET_ID}?sortBy=total_amount&sortOrder=DESC`);
    test('History - Sorting', sortRes.data.success);

  } catch (err) {
    console.log('   ✗ Captain history failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 10. Captain Order Detail
  console.log('\n10. CAPTAIN ORDER DETAIL');
  try {
    const res = await api.get(`/orders/captain/detail/${orderId}`);
    test('Order detail retrieved', res.data.success);
    test('Has items array', Array.isArray(res.data.data.items));
    test('Has kots array', Array.isArray(res.data.data.kots));
    test('Has timeLogs', !!res.data.data.timeLogs);
    test('timeLogs.orderCreated exists', !!res.data.data.timeLogs.orderCreated);
  } catch (err) {
    console.log('   ✗ Order detail failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 11. Captain Stats
  console.log('\n11. CAPTAIN ORDER STATS');
  try {
    // Today's stats
    const todayRes = await api.get(`/orders/captain/stats/${OUTLET_ID}`);
    test('Stats - Today', todayRes.data.success);
    test('Stats - Has total_orders', typeof todayRes.data.data.total_orders === 'number');
    test('Stats - Has running_orders', typeof todayRes.data.data.running_orders === 'number');
    test('Stats - Has completed_orders', typeof todayRes.data.data.completed_orders === 'number');

    // Date range stats
    const rangeRes = await api.get(`/orders/captain/stats/${OUTLET_ID}?startDate=2026-02-01&endDate=2026-02-28`);
    test('Stats - Date range', rangeRes.data.success);
  } catch (err) {
    console.log('   ✗ Captain stats failed:', err.response?.data?.message || err.message);
    failed++;
  }

  // 12. Cleanup
  console.log('\n12. CLEANUP');
  try {
    await api.post(`/orders/${orderId}/cancel`, { reason: 'Test cleanup' });
    test('Order cancelled', true);
  } catch (err) {
    console.log('   Note:', err.response?.data?.message || err.message);
  }

  try {
    await api.delete(`/tables/${tableId}/session`);
    test('Session ended', true);
  } catch (err) {
    console.log('   Note:', err.response?.data?.message || err.message);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);
  console.log('='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
