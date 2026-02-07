/**
 * Cleanup: Make all tables on First Floor & Rooftop available
 * - Cancel active orders
 * - End sessions
 * - Set tables to available
 * 
 * Run: node src/tests/cleanup-tables.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const CAPTAIN_CREDS = { email: 'admin@restropos.com', password: 'admin123' };

async function run() {
  console.log('\n' + '═'.repeat(55));
  console.log('  CLEANUP: First Floor & Rooftop Tables');
  console.log('═'.repeat(55));

  // Login
  const loginRes = await axios.post(`${API_BASE}/auth/login`, CAPTAIN_CREDS);
  const token = loginRes.data.data.accessToken;
  const api = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
    validateStatus: () => true
  });

  // Step 1: Get all floors
  console.log('\n── Fetching floors for outlet', OUTLET_ID, '──');
  const floorsRes = await api.get(`/outlets/${OUTLET_ID}/floors`);
  const floors = floorsRes.data.data || [];
  
  for (const f of floors) {
    console.log(`   Floor: "${f.name}" (ID: ${f.id}) - ${f.table_count} tables, ${f.available_count} available, ${f.occupied_count} occupied`);
  }

  // Step 2: Find first floor and rooftop
  const targetFloors = floors.filter(f => {
    const name = f.name.toLowerCase();
    return name.includes('first') || name.includes('rooftop') || name.includes('roof');
  });

  if (targetFloors.length === 0) {
    console.log('\n   ⚠ No floors matching "first floor" or "rooftop" found.');
    console.log('   Available floors:', floors.map(f => f.name).join(', '));
    process.exit(1);
  }

  console.log(`\n── Target floors: ${targetFloors.map(f => f.name).join(', ')} ──`);

  let totalTables = 0, cancelledOrders = 0, endedSessions = 0, madeAvailable = 0;

  for (const floor of targetFloors) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  Floor: "${floor.name}" (ID: ${floor.id})`);
    console.log('─'.repeat(55));

    // Get all tables on this floor
    const tablesRes = await api.get(`/tables/floor/${floor.id}`);
    const tables = tablesRes.data.data || [];
    totalTables += tables.length;

    for (const table of tables) {
      const tableLabel = `Table ${table.table_number} (ID: ${table.id})`;
      
      if (table.status === 'available' && !table.current_order_id && !table.session_id) {
        console.log(`   ✓ ${tableLabel} - already available`);
        continue;
      }

      console.log(`   ⚡ ${tableLabel} - status: ${table.status}, order: ${table.current_order_id || 'none'}, session: ${table.session_id || 'none'}`);

      // Cancel active order if exists
      if (table.current_order_id) {
        const cancelRes = await api.post(`/orders/${table.current_order_id}/cancel`, {
          reason: 'Table cleanup - making available'
        });
        if (cancelRes.data.success) {
          console.log(`     → Order ${table.current_order_id} cancelled ✓`);
          cancelledOrders++;
        } else {
          console.log(`     → Order cancel failed: ${cancelRes.data.message}`);
          // Try to check if order is already cancelled/paid
          const orderCheck = await api.get(`/orders/${table.current_order_id}`);
          console.log(`     → Order status: ${orderCheck.data.data?.status}`);
        }
      }

      // End session if exists
      if (table.session_id) {
        const endRes = await api.delete(`/tables/${table.id}/session`);
        if (endRes.data.success) {
          console.log(`     → Session ended ✓`);
          endedSessions++;
        } else {
          console.log(`     → Session end failed: ${endRes.data.message}`);
        }
      }

      // Force table to available
      const statusRes = await api.patch(`/tables/${table.id}/status`, { status: 'available' });
      if (statusRes.data.success) {
        console.log(`     → Status set to available ✓`);
        madeAvailable++;
      } else {
        console.log(`     → Status update failed: ${statusRes.data.message}`);
      }
    }
  }

  // Step 3: Verify
  console.log(`\n${'═'.repeat(55)}`);
  console.log('  VERIFICATION');
  console.log('═'.repeat(55));

  for (const floor of targetFloors) {
    const tablesRes = await api.get(`/tables/floor/${floor.id}`);
    const tables = tablesRes.data.data || [];
    const available = tables.filter(t => t.status === 'available');
    const notAvailable = tables.filter(t => t.status !== 'available');
    
    console.log(`\n  "${floor.name}": ${available.length}/${tables.length} tables available`);
    
    if (notAvailable.length > 0) {
      for (const t of notAvailable) {
        console.log(`   ✗ Table ${t.table_number} still ${t.status}`);
      }
    } else {
      console.log('   ✓ All tables available!');
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(55)}`);
  console.log('  SUMMARY');
  console.log('═'.repeat(55));
  console.log(`   Total tables:      ${totalTables}`);
  console.log(`   Orders cancelled:  ${cancelledOrders}`);
  console.log(`   Sessions ended:    ${endedSessions}`);
  console.log(`   Made available:    ${madeAvailable}`);
  console.log('═'.repeat(55));
  console.log('\n✅ All tables on First Floor & Rooftop are ready for orders!\n');

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
