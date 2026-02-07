/**
 * Full KOT Flow Test
 * Tests: Table Session → Order Creation → Add Items → Send KOT → Print
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

async function testFullFlow() {
  console.log('='.repeat(60));
  console.log('FULL KOT FLOW TEST');
  console.log('='.repeat(60));

  let token;
  let tableId = 14; // First floor table P1 (fixed earlier)
  let orderId;
  let sessionId;

  // 1. Login
  console.log('\n1. Logging in...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@restropos.com',
      password: 'admin123'
    });
    token = loginRes.data.data.accessToken;
    console.log('   ✓ Login successful');
  } catch (err) {
    console.log('   ✗ Login failed:', err.response?.data?.message || err.message);
    process.exit(1);
  }

  const api = axios.create({
    baseURL: BASE_URL,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // 2. Check table status
  console.log('\n2. Checking table status...');
  try {
    const tableRes = await api.get(`/tables/${tableId}`);
    const table = tableRes.data.data;
    console.log(`   Table: ${table.table_number} (ID: ${tableId})`);
    console.log(`   Floor: ${table.floor_id}`);
    console.log(`   Status: ${table.status}`);

    // If table has active session, end it first
    if (table.status === 'occupied') {
      console.log('   Table is occupied, ending session first...');
      try {
        // First cancel any active order
        const sessionRes = await api.get(`/tables/${tableId}/session`);
        if (sessionRes.data.data?.order_id) {
          console.log(`   Cancelling order ${sessionRes.data.data.order_id}...`);
          await api.patch(`/orders/${sessionRes.data.data.order_id}/status`, { status: 'cancelled' });
        }
        // Then end session (DELETE method)
        await api.delete(`/tables/${tableId}/session`);
        console.log('   ✓ Session ended');
      } catch (e) {
        console.log('   Could not end session:', e.response?.data?.message || e.message);
      }
    }
  } catch (err) {
    console.log('   ✗ Failed to get table:', err.response?.data?.message || err.message);
  }

  // 3. Start table session
  console.log('\n3. Starting table session...');
  try {
    const sessionRes = await api.post(`/tables/${tableId}/session`, {
      guestCount: 2,
      guestName: 'Test Guest'
    });
    sessionId = sessionRes.data.data.sessionId;
    console.log(`   ✓ Session started (ID: ${sessionId})`);
  } catch (err) {
    console.log('   ✗ Failed to start session:', err.response?.data?.message || err.message);
    // Try to continue anyway
  }

  // 4. Create order
  console.log('\n4. Creating order...');
  try {
    const orderRes = await api.post('/orders', {
      outletId: OUTLET_ID,
      tableId: tableId,
      orderType: 'dine_in',
      guestCount: 2
    });
    orderId = orderRes.data.data.id;
    console.log(`   ✓ Order created (ID: ${orderId})`);
    console.log(`   Order Number: ${orderRes.data.data.orderNumber}`);
  } catch (err) {
    console.log('   ✗ Failed to create order:', err.response?.data?.message || err.message);
    process.exit(1);
  }

  // 5. Get menu items to add
  console.log('\n5. Getting menu items...');
  let items = [];
  try {
    const menuRes = await api.get(`/menu/${OUTLET_ID}/captain`);
    const categories = menuRes.data.data.menu;
    
    // Pick first 3 items from different categories
    for (const cat of categories.slice(0, 3)) {
      if (cat.items && cat.items.length > 0) {
        const item = cat.items[0];
        items.push({
          itemId: item.id,
          quantity: 2,
          variantId: item.variants?.[0]?.id || null,
          specialInstructions: 'Test item'
        });
        console.log(`   - ${item.name} (${cat.name})`);
      }
    }
  } catch (err) {
    console.log('   ✗ Failed to get menu:', err.response?.data?.message || err.message);
  }

  // 6. Add items to order
  console.log('\n6. Adding items to order...');
  try {
    const addRes = await api.post(`/orders/${orderId}/items`, { items });
    console.log(`   ✓ Added ${addRes.data.data.addedItems?.length || items.length} items`);
  } catch (err) {
    console.log('   ✗ Failed to add items:', err.response?.data?.message || err.message);
  }

  // 7. Send KOT (this should trigger print)
  console.log('\n7. Sending KOT (should print to thermal printer)...');
  try {
    const kotRes = await api.post(`/orders/${orderId}/kot`);
    const kotData = kotRes.data.data;
    console.log(`   ✓ KOT sent successfully!`);
    console.log(`   Order: ${kotData.orderNumber}`);
    console.log(`   Table: ${kotData.tableNumber}`);
    if (kotData.tickets) {
      for (const ticket of kotData.tickets) {
        console.log(`   - ${ticket.kotNumber} (${ticket.station}): ${ticket.itemCount} items`);
      }
    }
    console.log('\n   📄 Check your thermal printer for the KOT printout!');
  } catch (err) {
    console.log('   ✗ Failed to send KOT:', err.response?.data?.message || err.message);
    if (err.response?.data) {
      console.log('   Response:', JSON.stringify(err.response.data, null, 2));
    }
  }

  // 8. Cleanup - end session
  console.log('\n8. Cleaning up...');
  try {
    // Cancel order first
    await api.patch(`/orders/${orderId}/status`, { status: 'cancelled' });
    console.log('   ✓ Order cancelled');
    
    // End session (DELETE method)
    await api.delete(`/tables/${tableId}/session`);
    console.log('   ✓ Session ended');
  } catch (err) {
    console.log('   Cleanup note:', err.response?.data?.message || err.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

testFullFlow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
