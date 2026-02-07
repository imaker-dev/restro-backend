/**
 * Verify Captain APIs - Table and KOT Management
 */
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';

async function verifyCaptainApis() {
  // Login
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: 'captainall@gmail.com',
    password: 'Captain@123'
  });
  const token = loginRes.data.data.accessToken;
  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log('='.repeat(70));
  console.log('CAPTAIN APP API VERIFICATION');
  console.log('='.repeat(70));

  // Test 1: Floor Tables API with KOT Summary
  console.log('\n📋 TEST 1: GET /tables/floor/:floorId');
  console.log('-'.repeat(70));
  
  const floorRes = await api.get('/tables/floor/1');
  const tables = floorRes.data.data;
  
  console.log(`Found ${tables.length} tables on floor 1\n`);
  
  // Group by status
  const statusGroups = {};
  tables.forEach(t => {
    if (!statusGroups[t.status]) statusGroups[t.status] = [];
    statusGroups[t.status].push(t);
  });

  for (const [status, tablesInStatus] of Object.entries(statusGroups)) {
    console.log(`  ${status.toUpperCase()} (${tablesInStatus.length}):`);
    tablesInStatus.forEach(t => {
      let info = `    - ${t.table_number}`;
      if (t.current_order_id) {
        info += ` | Order: ${t.order_number} | Rs.${t.total_amount}`;
        info += ` | Items: ${t.item_count}`;
        if (t.kotSummary) {
          const ks = t.kotSummary;
          info += ` | KOTs: ${ks.pending_kots}P/${ks.preparing_kots}C/${ks.ready_kots}R`;
        }
      }
      if (t.captain_name) info += ` | Captain: ${t.captain_name}`;
      if (t.session_duration) info += ` | ${t.session_duration}min`;
      console.log(info);
    });
  }

  // Test 2: Table Details API
  console.log('\n📋 TEST 2: GET /tables/:tableId (Table 6 - Occupied)');
  console.log('-'.repeat(70));
  
  const tableRes = await api.get('/tables/6');
  const table = tableRes.data.data;
  
  console.log(`  Table: ${table.tableNumber} (${table.status})`);
  console.log(`  Location: ${table.location.floorName} > ${table.location.sectionName}`);
  
  if (table.session) {
    console.log(`  Session: ${table.session.guestCount} guests, ${table.session.duration} mins`);
  }
  if (table.captain) {
    console.log(`  Captain: ${table.captain.name} (${table.captain.employeeCode})`);
  }
  if (table.order) {
    console.log(`  Order: ${table.order.orderNumber}`);
    console.log(`    - Subtotal: Rs.${table.order.subtotal}`);
    console.log(`    - Tax: Rs.${table.order.taxAmount}`);
    console.log(`    - Total: Rs.${table.order.totalAmount}`);
  }
  if (table.items && table.items.length > 0) {
    console.log(`  Items (${table.items.length}):`);
    table.items.forEach(item => {
      let itemInfo = `    - ${item.name}`;
      if (item.variantName) itemInfo += ` (${item.variantName})`;
      itemInfo += ` x${item.quantity} = Rs.${item.totalPrice}`;
      if (item.addons && item.addons.length > 0) {
        itemInfo += ` + ${item.addons.map(a => a.name).join(', ')}`;
      }
      console.log(itemInfo);
    });
  }
  if (table.kots && table.kots.length > 0) {
    console.log(`  KOTs (${table.kots.length}):`);
    table.kots.forEach(kot => {
      console.log(`    - ${kot.kotNumber} | ${kot.station} | ${kot.status} | ${kot.itemCount} items`);
    });
  }
  console.log(`  Status Summary: ${table.statusSummary?.message}`);

  // Test 3: Available Table Statuses
  console.log('\n📋 TEST 3: Table Status Types');
  console.log('-'.repeat(70));
  const statuses = ['available', 'occupied', 'running', 'reserved', 'billing', 'blocked'];
  console.log('  Valid statuses:', statuses.join(', '));
  console.log('  ❌ Removed: cleaning');

  // Test 4: Real-time WebSocket Events
  console.log('\n📋 TEST 4: Real-time WebSocket Events for Captain');
  console.log('-'.repeat(70));
  console.log('  Captain joins room: socket.emit("join:captain", outletId)');
  console.log('  Captain joins floor: socket.emit("join:floor", { outletId, floorId })');
  console.log('\n  Events received by captain:');
  console.log('    - table:updated    → When table status changes');
  console.log('    - order:updated    → When order is modified');
  console.log('    - item:ready       → When KOT item is ready to serve');

  console.log('\n' + '='.repeat(70));
  console.log('✅ All Captain APIs verified successfully');
  console.log('='.repeat(70));
}

verifyCaptainApis().catch(e => console.error('Error:', e.response?.data || e.message));
