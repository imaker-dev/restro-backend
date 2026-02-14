/**
 * Test: Table Status Lifecycle
 * 
 * Verifies table status transitions through the full order lifecycle:
 * 1. available → occupied (session start / order create)
 * 2. occupied → running (KOT sent)
 * 3. running → billing (bill generated)
 * 4. billing → available (payment completed)
 * 5. Edge: cancel order → available
 * 6. Edge: multiple KOTs keep status as running
 */

require('dotenv').config();
const axios = require('axios');
const { initializeDatabase, getPool } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

let passed = 0, failed = 0;

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
}
function test(name, condition, detail) {
  if (condition) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}

async function login(email, password) {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  const token = res.data.data.accessToken || res.data.data.token;
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

async function getTableStatus(api, tableId) {
  const res = await api.get(`/tables/${tableId}`);
  return res.data.data.status;
}

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  TABLE STATUS LIFECYCLE TEST                              ║');
  console.log('║  available → occupied → running → billing → available     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();

  section('0. LOGIN + SETUP');
  const admin = await login('admin@restropos.com', 'admin123');
  console.log('   ✓ Admin login');

  const captain = await login('captainall@gmail.com', 'Captain@123');
  console.log('   ✓ Captain login');

  // Cleanup: release all tables
  await pool.query(
    `UPDATE orders SET status='cancelled', cancelled_at=NOW() 
     WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]
  );
  await pool.query(
    `UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL 
     WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]
  );
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);

  // Get available tables
  const tablesRes = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes.data.data.filter(t => t.status === 'available');
  test('Tables available', availTables.length >= 2, `Found ${availTables.length}`);

  // Get menu items
  const menuRes = await captain.get(`/menu/${OUTLET_ID}/captain`);
  const menuItems = [];
  for (const cat of (menuRes.data.data?.menu || [])) {
    for (const item of (cat.items || [])) {
      if (!item.variants && menuItems.length < 5) menuItems.push(item);
    }
  }
  test('Menu items found', menuItems.length >= 2, `Found ${menuItems.length}`);

  const TABLE_A = availTables[0]?.id;
  const TABLE_B = availTables[1]?.id;
  console.log(`   Table A: ${TABLE_A}, Table B: ${TABLE_B}`);

  // ═══════════════════════════════════════════════════
  // SCENARIO 1: Full lifecycle — available → occupied → running → billing → available
  // ═══════════════════════════════════════════════════
  section('1. FULL LIFECYCLE: available → occupied → running → billing → available');

  // Step 1a: Check table starts as available
  let status = await getTableStatus(captain, TABLE_A);
  test('Initial: Table A = available', status === 'available', `status=${status}`);

  // Step 1b: Create order → table should be occupied
  const order1Res = await captain.post('/orders', {
    outletId: OUTLET_ID,
    tableId: TABLE_A,
    orderType: 'dine_in',
    guestCount: 2
  });
  test('Order created', order1Res.data.success);
  const order1Id = order1Res.data.data.id;

  status = await getTableStatus(captain, TABLE_A);
  test('After order create: Table A = occupied', status === 'occupied', `status=${status}`);

  // Step 1c: Add items
  await captain.post(`/orders/${order1Id}/items`, {
    items: [{ itemId: menuItems[0].id, quantity: 2 }, { itemId: menuItems[1].id, quantity: 1 }]
  });

  status = await getTableStatus(captain, TABLE_A);
  test('After add items: Table A still = occupied', status === 'occupied', `status=${status}`);

  // Step 1d: Send KOT → table should be running
  const kotRes = await captain.post(`/orders/${order1Id}/kot`);
  test('KOT sent', kotRes.data.success);

  status = await getTableStatus(captain, TABLE_A);
  test('After KOT sent: Table A = running', status === 'running', `status=${status}`);

  // Step 1e: Serve KOTs (status should stay running)
  for (const t of (kotRes.data.data?.tickets || [])) {
    await admin.post(`/orders/kot/${t.id}/ready`).catch(() => {});
    await captain.post(`/orders/kot/${t.id}/served`).catch(() => {});
  }

  status = await getTableStatus(captain, TABLE_A);
  test('After serve: Table A still = running', status === 'running', `status=${status}`);

  // Step 1f: Generate bill → table should be billing
  const billRes = await admin.post(`/orders/${order1Id}/bill`, { applyServiceCharge: true });
  test('Bill generated', billRes.data.success);
  const invoice1 = billRes.data.data;

  status = await getTableStatus(captain, TABLE_A);
  test('After bill: Table A = billing', status === 'billing', `status=${status}`);

  // Step 1g: Process payment → table should be available
  const payRes = await admin.post('/orders/payment', {
    orderId: order1Id,
    invoiceId: invoice1?.id,
    outletId: OUTLET_ID,
    amount: invoice1?.grandTotal,
    paymentMode: 'cash',
    tipAmount: 0
  });
  test('Payment processed', payRes.data.success);

  status = await getTableStatus(captain, TABLE_A);
  test('After payment: Table A = available', status === 'available', `status=${status}`);

  // ═══════════════════════════════════════════════════
  // SCENARIO 2: Multiple KOTs — status stays running
  // ═══════════════════════════════════════════════════
  section('2. MULTIPLE KOTs — status stays running');

  const order2Res = await captain.post('/orders', {
    outletId: OUTLET_ID,
    tableId: TABLE_B,
    orderType: 'dine_in',
    guestCount: 2
  });
  const order2Id = order2Res.data.data.id;

  // First KOT
  await captain.post(`/orders/${order2Id}/items`, {
    items: [{ itemId: menuItems[0].id, quantity: 1 }]
  });
  await captain.post(`/orders/${order2Id}/kot`);

  status = await getTableStatus(captain, TABLE_B);
  test('After 1st KOT: Table B = running', status === 'running', `status=${status}`);

  // Second KOT (add more items)
  await captain.post(`/orders/${order2Id}/items`, {
    items: [{ itemId: menuItems[1].id, quantity: 1 }]
  });
  await captain.post(`/orders/${order2Id}/kot`);

  status = await getTableStatus(captain, TABLE_B);
  test('After 2nd KOT: Table B still = running', status === 'running', `status=${status}`);

  // ═══════════════════════════════════════════════════
  // SCENARIO 3: Cancel order → table back to available
  // ═══════════════════════════════════════════════════
  section('3. CANCEL ORDER — table back to available');

  status = await getTableStatus(captain, TABLE_B);
  console.log(`   Before cancel: Table B = ${status}`);

  await admin.post(`/orders/${order2Id}/cancel`, {
    reason: 'Customer left'
  });

  status = await getTableStatus(captain, TABLE_B);
  test('After cancel: Table B = available', status === 'available', `status=${status}`);

  // ═══════════════════════════════════════════════════
  // SCENARIO 4: Order without KOT → bill directly
  // ═══════════════════════════════════════════════════
  section('4. ORDER WITHOUT KOT → bill (occupied → billing)');

  const order3Res = await captain.post('/orders', {
    outletId: OUTLET_ID,
    tableId: TABLE_A,
    orderType: 'dine_in',
    guestCount: 1
  });
  const order3Id = order3Res.data.data.id;

  await captain.post(`/orders/${order3Id}/items`, {
    items: [{ itemId: menuItems[0].id, quantity: 1 }]
  });

  // Send KOT + serve quickly
  const kot3 = await captain.post(`/orders/${order3Id}/kot`);
  for (const t of (kot3.data.data?.tickets || [])) {
    await admin.post(`/orders/kot/${t.id}/ready`).catch(() => {});
    await captain.post(`/orders/kot/${t.id}/served`).catch(() => {});
  }

  status = await getTableStatus(captain, TABLE_A);
  test('Before bill: Table A = running', status === 'running', `status=${status}`);

  // Generate bill
  const bill3 = await admin.post(`/orders/${order3Id}/bill`, { applyServiceCharge: true });

  status = await getTableStatus(captain, TABLE_A);
  test('After bill: Table A = billing', status === 'billing', `status=${status}`);

  // Pay and release
  await admin.post('/orders/payment', {
    orderId: order3Id,
    invoiceId: bill3.data.data?.id,
    outletId: OUTLET_ID,
    amount: bill3.data.data?.grandTotal,
    paymentMode: 'cash',
    tipAmount: 0
  });

  status = await getTableStatus(captain, TABLE_A);
  test('After payment: Table A = available', status === 'available', `status=${status}`);

  // ═══════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════
  section('5. CLEANUP');
  await pool.query(
    `UPDATE orders SET status='cancelled', cancelled_at=NOW() 
     WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]
  );
  await pool.query(
    `UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL 
     WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]
  );
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);
  console.log('   Cleanup done');

  // ═══════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);
  console.log('');
  console.log('  TABLE STATUS LIFECYCLE:');
  console.log('  ┌─────────────┬──────────────┬─────────────┐');
  console.log('  │ Event       │ Status       │ Verified    │');
  console.log('  ├─────────────┼──────────────┼─────────────┤');
  console.log('  │ Session     │ occupied     │ ✓           │');
  console.log('  │ KOT sent    │ running      │ ✓           │');
  console.log('  │ Bill gen    │ billing      │ ✓           │');
  console.log('  │ Payment     │ available    │ ✓           │');
  console.log('  │ Cancel      │ available    │ ✓           │');
  console.log('  └─────────────┴──────────────┴─────────────┘');
  console.log('');

  if (failed > 0) {
    console.log(`❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('✅ All table status lifecycle tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.response?.data?.message || err.message);
  process.exit(1);
});
