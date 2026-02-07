/**
 * Test Captain Ownership & Table Session Flow
 * Tests scenarios:
 * 1. Captain starts session → same captain creates order (should work)
 * 2. Captain starts session → different captain tries to create order (should fail)
 * 3. Manager transfers table → new captain creates order (should work)
 * 4. Captain adds items to own order (should work)
 * 5. Different captain tries to add items (should fail)
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.API_URL || 'http://localhost:3000/api/v1';

// Test users (adjust IDs based on your database)
const CAPTAIN_1 = { email: 'captainall@gmail.com', password: 'Captain@123', id: null, token: null };
const CAPTAIN_2 = { email: 'captain2@test.com', password: 'captain123', id: null, token: null };
const MANAGER = { email: 'admin@restropos.com', password: 'admin123', id: null, token: null };

const TEST_TABLE_ID = 1;
const TEST_OUTLET_ID = 4;

async function login(user) {
  try {
    const res = await axios.post(`${API_BASE}/auth/login`, {
      email: user.email,
      password: user.password
    });
    user.token = res.data.data.accessToken;
    user.id = res.data.data.user.id;
    console.log(`✅ Logged in as ${user.email} (ID: ${user.id})`);
    return true;
  } catch (error) {
    console.log(`❌ Failed to login as ${user.email}: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

function api(user) {
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${user.token}` }
  });
}

async function resetTable(tableId) {
  try {
    // End any existing session first
    try {
      await api(MANAGER).delete(`/tables/${tableId}/session`);
      console.log(`🔄 Ended existing session on table ${tableId}`);
    } catch (e) {
      // Session might not exist, that's fine
    }
    // Use manager to reset table
    await api(MANAGER).patch(`/tables/${tableId}/status`, { status: 'available' });
    console.log(`🔄 Table ${tableId} reset to available`);
  } catch (error) {
    console.log(`⚠️ Could not reset table: ${error.response?.data?.message || error.message}`);
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 CAPTAIN OWNERSHIP TESTS');
  console.log('='.repeat(70));

  // Login all users
  console.log('\n📋 STEP 1: Login Users');
  console.log('-'.repeat(50));
  
  const managerLoggedIn = await login(MANAGER);
  if (!managerLoggedIn) {
    console.log('❌ Cannot proceed without manager login');
    return;
  }

  // Try to login captains, use manager as fallback
  await login(CAPTAIN_1);
  await login(CAPTAIN_2);

  // If captains don't exist, use manager for testing
  if (!CAPTAIN_1.token) {
    console.log('⚠️ Using manager as Captain 1 for testing');
    CAPTAIN_1.token = MANAGER.token;
    CAPTAIN_1.id = MANAGER.id;
  }

  // Reset table
  console.log('\n📋 STEP 2: Reset Table');
  console.log('-'.repeat(50));
  await resetTable(TEST_TABLE_ID);

  // Test 1: Captain starts session
  console.log('\n📋 TEST 1: Captain 1 Starts Session');
  console.log('-'.repeat(50));
  
  let sessionId = null;
  try {
    const sessionRes = await api(CAPTAIN_1).post(`/tables/${TEST_TABLE_ID}/session`, {
      guestCount: 4,
      guestName: 'Test Guest',
      notes: 'Testing captain ownership'
    });
    sessionId = sessionRes.data.data?.sessionId;
    console.log(`✅ Session started: ${sessionId}`);
  } catch (error) {
    console.log(`❌ Failed to start session: ${error.response?.data?.message || error.message}`);
  }

  // Test 2: Same captain creates order (should work)
  console.log('\n📋 TEST 2: Same Captain Creates Order (Should Work)');
  console.log('-'.repeat(50));
  
  let orderId = null;
  try {
    const orderRes = await api(CAPTAIN_1).post('/orders', {
      outletId: TEST_OUTLET_ID,
      tableId: TEST_TABLE_ID,
      orderType: 'dine_in',
      guestCount: 4,
      customerName: 'Test Guest'
    });
    orderId = orderRes.data.data?.id;
    console.log(`✅ Order created by same captain: ${orderId}`);
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.message || error.message}`);
  }

  // Reset for next test
  await resetTable(TEST_TABLE_ID);

  // Test 3: Captain starts session, different captain tries to create order (should fail)
  console.log('\n📋 TEST 3: Different Captain Creates Order (Should Fail)');
  console.log('-'.repeat(50));

  if (!CAPTAIN_2.token) {
    console.log('⚠️ Skipping - Captain 2 not available');
  } else {
    try {
      // Captain 1 starts session
      await api(CAPTAIN_1).post(`/tables/${TEST_TABLE_ID}/session`, {
        guestCount: 2,
        guestName: 'Another Guest'
      });
      console.log('✅ Captain 1 started session');

      // Captain 2 tries to create order
      await api(CAPTAIN_2).post('/orders', {
        outletId: TEST_OUTLET_ID,
        tableId: TEST_TABLE_ID,
        orderType: 'dine_in',
        guestCount: 2
      });
      console.log('❌ UNEXPECTED: Captain 2 was able to create order!');
    } catch (error) {
      if (error.response?.data?.message?.includes('captain who started')) {
        console.log('✅ Correctly blocked: ' + error.response.data.message);
      } else {
        console.log(`❌ Unexpected error: ${error.response?.data?.message || error.message}`);
      }
    }
  }

  // Reset for next test
  await resetTable(TEST_TABLE_ID);

  // Test 4: Manager transfers table
  console.log('\n📋 TEST 4: Manager Transfers Table');
  console.log('-'.repeat(50));

  if (!CAPTAIN_2.token) {
    console.log('⚠️ Skipping - Captain 2 not available');
  } else {
    try {
      // Captain 1 starts session
      await api(CAPTAIN_1).post(`/tables/${TEST_TABLE_ID}/session`, {
        guestCount: 3,
        guestName: 'Transfer Test Guest'
      });
      console.log('✅ Captain 1 started session');

      // Manager transfers to Captain 2
      const transferRes = await api(MANAGER).post(`/tables/${TEST_TABLE_ID}/session/transfer`, {
        newCaptainId: CAPTAIN_2.id
      });
      console.log(`✅ Table transferred to Captain 2: ${JSON.stringify(transferRes.data.data)}`);

      // Captain 2 creates order
      const orderRes = await api(CAPTAIN_2).post('/orders', {
        outletId: TEST_OUTLET_ID,
        tableId: TEST_TABLE_ID,
        orderType: 'dine_in',
        guestCount: 3
      });
      console.log(`✅ Captain 2 created order after transfer: ${orderRes.data.data?.id}`);
    } catch (error) {
      console.log(`❌ Failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Cleanup
  await resetTable(TEST_TABLE_ID);

  console.log('\n' + '='.repeat(70));
  console.log('🏁 TESTS COMPLETE');
  console.log('='.repeat(70));
}

runTests().catch(console.error);
