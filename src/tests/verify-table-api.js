/**
 * Verify table API returns correct details for each status
 */
require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

const API_URL = 'http://localhost:3000/api/v1';

async function verifyTableApi() {
  // Login
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: 'admin@restropos.com',
    password: 'admin123'
  });
  const token = loginRes.data.data.accessToken;
  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` }
  });

  // Fix captain in sessions (set started_by = 1 for active sessions)
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  await pool.query('UPDATE table_sessions SET started_by = 1 WHERE status = "active" AND started_by IS NULL');
  console.log('Fixed captain assignments\n');

  // Test each status
  const testCases = [
    { id: 1, status: 'available', description: 'Available table' },
    { id: 3, status: 'reserved', description: 'Reserved table' },
    { id: 4, status: 'running', description: 'Running table (items being served)' },
    { id: 5, status: 'billing', description: 'Billing table (awaiting payment)' },
    { id: 6, status: 'occupied', description: 'Occupied table with order' },
    { id: 7, status: 'cleaning', description: 'Table needs cleaning' },
    { id: 8, status: 'blocked', description: 'Blocked table' }
  ];

  console.log('=' .repeat(60));
  console.log('TABLE API VERIFICATION');
  console.log('=' .repeat(60));

  for (const test of testCases) {
    try {
      const res = await api.get(`/tables/${test.id}`);
      const t = res.data.data;
      
      const statusMatch = t.status === test.status;
      const icon = statusMatch ? '✅' : '❌';
      
      console.log(`\n${icon} Table ${t.tableNumber} (ID: ${test.id}) - ${test.status.toUpperCase()}`);
      console.log(`   Status: ${t.status}`);
      console.log(`   Summary: ${t.statusSummary?.message}`);
      
      if (t.session) {
        console.log(`   Session: ${t.session.guestCount} guests, ${t.session.duration} mins`);
      }
      if (t.captain) {
        console.log(`   Captain: ${t.captain.name} (${t.captain.employeeCode})`);
      }
      if (t.order) {
        console.log(`   Order: ${t.order.orderNumber} - Rs.${t.order.totalAmount}`);
        console.log(`   Items: ${t.items.length}, KOTs: ${t.kots.length}`);
      }
      if (t.billing) {
        console.log(`   Invoice: ${t.billing.invoiceNumber} - Rs.${t.billing.grandTotal}`);
      }
      
    } catch (e) {
      console.log(`\n❌ Table ${test.id} - ${test.status}: ${e.response?.data?.message || e.message}`);
    }
  }

  // Test floor API
  console.log('\n' + '='.repeat(60));
  console.log('FLOOR API VERIFICATION');
  console.log('='.repeat(60));
  
  const floorRes = await api.get('/tables/floor/1');
  console.log(`\nFloor 1 has ${floorRes.data.data.length} tables:`);
  
  const statusCounts = {};
  floorRes.data.data.forEach(t => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  });
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count} tables`);
  });

  await pool.end();
  console.log('\n✅ Verification complete');
}

verifyTableApi().catch(console.error);
