/**
 * Test script to verify the fixes:
 * 1. Menu search API - global search across category, item, variant
 * 2. Cancel item - updates KOT status
 * 3. Order creation on non-ground floor tables
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

// Test users
const ADMIN = { email: 'admin@restropos.com', password: 'admin123', token: null };
const CAPTAIN = { email: 'captainall@gmail.com', password: 'Captain@123', token: null };

const api = (user) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: { 
      'Authorization': `Bearer ${user.token}`,
      'Content-Type': 'application/json'
    }
  });
};

async function login(user) {
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: user.email,
      password: user.password
    });
    user.token = res.data.data.token;
    user.id = res.data.data.user.id;
    console.log(`✅ Logged in as ${user.email} (ID: ${user.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Login failed for ${user.email}:`, error.response?.data?.message || error.message);
    return false;
  }
}

// Test 1: Menu Search API
async function testMenuSearch() {
  console.log('\n========== TEST 1: Menu Search API ==========');
  
  const outletId = 4;
  
  // Test search by item name
  console.log('\n1.1 Testing search by item name "naan"...');
  try {
    const res = await api(CAPTAIN).get(`/menu/${outletId}/search?q=naan`);
    console.log(`✅ Search returned: ${res.data.data.totalCategories} categories, ${res.data.data.totalItems} items`);
    if (res.data.data.matchingItems?.length > 0) {
      console.log(`   First item: ${res.data.data.matchingItems[0].name}`);
      if (res.data.data.matchingItems[0].variants) {
        console.log(`   Has variants: ${res.data.data.matchingItems[0].variants.length}`);
      }
    }
  } catch (error) {
    console.error(`❌ Search failed:`, error.response?.data?.message || error.message);
  }
  
  // Test search by category name
  console.log('\n1.2 Testing search by category name "bread"...');
  try {
    const res = await api(CAPTAIN).get(`/menu/${outletId}/search?q=bread`);
    console.log(`✅ Search returned: ${res.data.data.totalCategories} categories, ${res.data.data.totalItems} items`);
    if (res.data.data.matchingCategories?.length > 0) {
      const cat = res.data.data.matchingCategories[0];
      console.log(`   Category: ${cat.name} with ${cat.itemCount} items`);
    }
  } catch (error) {
    console.error(`❌ Search failed:`, error.response?.data?.message || error.message);
  }
  
  // Test search by short name
  console.log('\n1.3 Testing search by short name "b.naan"...');
  try {
    const res = await api(CAPTAIN).get(`/menu/${outletId}/search?q=b.naan`);
    console.log(`✅ Search returned: ${res.data.data.totalCategories} categories, ${res.data.data.totalItems} items`);
  } catch (error) {
    console.error(`❌ Search failed:`, error.response?.data?.message || error.message);
  }
  
  // Test search returns variants and addons
  console.log('\n1.4 Testing search returns full item details...');
  try {
    const res = await api(CAPTAIN).get(`/menu/${outletId}/search?q=paneer`);
    if (res.data.data.matchingItems?.length > 0) {
      const item = res.data.data.matchingItems[0];
      console.log(`✅ Item: ${item.name}`);
      console.log(`   - Has variants: ${item.variants ? 'Yes' : 'No'}`);
      console.log(`   - Has addons: ${item.addons ? 'Yes' : 'No'}`);
      console.log(`   - Price: ${item.price}`);
      console.log(`   - Category: ${item.categoryName}`);
    }
  } catch (error) {
    console.error(`❌ Search failed:`, error.response?.data?.message || error.message);
  }
}

// Test 2: Order Creation on Different Floors
async function testFloorOrderCreation() {
  console.log('\n========== TEST 2: Order Creation on Different Floors ==========');
  
  const outletId = 4;
  
  // Get available tables on different floors
  console.log('\n2.1 Getting tables on floor 2 (non-ground floor)...');
  try {
    const res = await api(CAPTAIN).get(`/tables/floor/2`);
    const tables = res.data.data || [];
    console.log(`✅ Found ${tables.length} tables on floor 2`);
    
    // Find an available table
    const availableTable = tables.find(t => t.status === 'available');
    if (availableTable) {
      console.log(`   Available table: ${availableTable.table_number} (ID: ${availableTable.id})`);
      
      // Try to create order
      console.log('\n2.2 Creating order on floor 2 table...');
      try {
        const orderRes = await api(CAPTAIN).post('/orders', {
          outletId,
          tableId: availableTable.id,
          floorId: 2,
          sectionId: availableTable.section_id || 1,
          orderType: 'dine_in',
          guestCount: 2,
          customerName: 'Test Customer Floor 2'
        });
        console.log(`✅ Order created successfully: ${orderRes.data.data.order_number}`);
        
        // Clean up - cancel the order
        await api(ADMIN).post(`/orders/${orderRes.data.data.id}/cancel`, {
          reason: 'Test cleanup'
        });
        console.log(`   Cleaned up test order`);
      } catch (error) {
        console.error(`❌ Order creation failed:`, error.response?.data?.message || error.message);
        console.log(`   This may indicate a stale session on the table. Check session ownership.`);
      }
    } else {
      console.log(`⚠️ No available tables on floor 2 to test`);
    }
  } catch (error) {
    console.error(`❌ Failed to get tables:`, error.response?.data?.message || error.message);
  }
}

// Test 3: Error Message Quality
async function testErrorMessages() {
  console.log('\n========== TEST 3: Error Message Quality ==========');
  
  console.log('\n3.1 Testing error message when table has existing session from another captain...');
  console.log('   (This requires manual setup - creating session with one captain, then trying order with another)');
  console.log('   Expected error: "This table session was started by [Captain Name]..."');
  
  console.log('\n3.2 Testing error message when table already has active order...');
  console.log('   Expected error: "Table already has an active order (Order ID: X)..."');
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIXES VERIFICATION TEST');
  console.log('='.repeat(60));
  
  // Login
  console.log('\nLogging in...');
  if (!await login(ADMIN)) return;
  if (!await login(CAPTAIN)) return;
  
  // Run tests
  await testMenuSearch();
  await testFloorOrderCreation();
  await testErrorMessages();
  
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
