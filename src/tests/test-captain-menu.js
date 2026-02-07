/**
 * Test Captain Menu API directly
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

async function testCaptainMenu() {
  console.log('Testing Captain Menu API...\n');

  // 1. Login first
  console.log('1. Logging in...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'captainall@gmail.com',
      password: 'Captain@123'
    });
    const token = loginRes.data.data.accessToken;
    console.log('   Login successful, token received');

    // 2. Test captain menu without filter
    console.log('\n2. Testing GET /menu/4/captain (no filter)...');
    try {
      const menuRes = await axios.get(`${BASE_URL}/menu/4/captain`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('   Status:', menuRes.status);
      console.log('   Success:', menuRes.data.success);
      if (menuRes.data.data) {
        console.log('   Categories:', menuRes.data.data.summary?.categories || 'N/A');
        console.log('   Items:', menuRes.data.data.summary?.items || 'N/A');
      }
    } catch (err) {
      console.log('   ERROR:', err.response?.status, err.response?.data || err.message);
    }

    // 3. Test captain menu with veg filter
    console.log('\n3. Testing GET /menu/4/captain?filter=veg...');
    try {
      const vegRes = await axios.get(`${BASE_URL}/menu/4/captain?filter=veg`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('   Status:', vegRes.status);
      console.log('   Success:', vegRes.data.success);
      if (vegRes.data.data) {
        console.log('   Filter:', vegRes.data.data.filter);
        console.log('   Categories:', vegRes.data.data.summary?.categories || 'N/A');
        console.log('   Items:', vegRes.data.data.summary?.items || 'N/A');
      }
    } catch (err) {
      console.log('   ERROR:', err.response?.status, err.response?.data || err.message);
    }

    // 4. Test search API
    console.log('\n4. Testing GET /menu/4/search?q=paneer...');
    try {
      const searchRes = await axios.get(`${BASE_URL}/menu/4/search?q=paneer`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('   Status:', searchRes.status);
      console.log('   Success:', searchRes.data.success);
      if (searchRes.data.data) {
        console.log('   Total Items:', searchRes.data.data.totalItems);
      }
    } catch (err) {
      console.log('   ERROR:', err.response?.status, err.response?.data || err.message);
    }

  } catch (loginErr) {
    console.log('   Login FAILED:', loginErr.response?.data || loginErr.message);
  }

  console.log('\n--- Test Complete ---');
}

testCaptainMenu();
