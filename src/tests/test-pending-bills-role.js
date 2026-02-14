/**
 * Test: Pending Bills Role-Based Filtering
 * 
 * Verifies that GET /orders/bills/pending/:outletId is role-aware:
 * - Captain: sees only their own orders' bills (pending + completed)
 * - Cashier/Admin: sees all bills
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

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  PENDING BILLS — ROLE-BASED FILTERING TEST               ║');
  console.log('║  Captain=own bills, Cashier=all bills                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();

  section('0. LOGIN + SETUP');
  const cashier = await login('admin@restropos.com', 'admin123');
  console.log('   ✓ Cashier/Admin login');

  const captain = await login('captainall@gmail.com', 'Captain@123');
  const meRes = await captain.get('/auth/me');
  const captainId = meRes.data.data.id;
  console.log(`   ✓ Captain login (ID: ${captainId})`);

  // Cleanup
  await pool.query(
    `UPDATE orders SET status='cancelled', cancelled_at=NOW() 
     WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]
  );
  await pool.query(
    `UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL 
     WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]
  );
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);

  // Get tables + menu
  const tablesRes = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes.data.data.filter(t => t.status === 'available');
  const menuRes = await captain.get(`/menu/${OUTLET_ID}/captain`);
  const menuItems = [];
  for (const cat of (menuRes.data.data?.menu || [])) {
    for (const item of (cat.items || [])) {
      if (!item.variants && menuItems.length < 5) menuItems.push(item);
    }
  }

  const TABLE_A = availTables[0]?.id;
  const TABLE_B = availTables[1]?.id;

  // ─── 1. CREATE CAPTAIN ORDER + BILL ───
  section('1. Captain creates order → KOT → bill');

  const order1Res = await captain.post('/orders', {
    outletId: OUTLET_ID, tableId: TABLE_A, orderType: 'dine_in', guestCount: 2
  });
  const order1Id = order1Res.data.data.id;
  await captain.post(`/orders/${order1Id}/items`, {
    items: [{ itemId: menuItems[0].id, quantity: 2 }]
  });
  const kot1 = await captain.post(`/orders/${order1Id}/kot`);
  for (const t of (kot1.data.data?.tickets || [])) {
    await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
    await captain.post(`/orders/kot/${t.id}/served`).catch(() => {});
  }
  const bill1 = await cashier.post(`/orders/${order1Id}/bill`, { applyServiceCharge: true });
  test('Captain bill generated', bill1.data.success);
  const invoice1Id = bill1.data.data?.id;
  console.log(`   Order ${order1Id}, Invoice ${bill1.data.data?.invoiceNumber}`);

  // ─── 2. CREATE CASHIER ORDER + BILL (different creator) ───
  section('2. Cashier creates order → KOT → bill (on Table B)');

  const order2Res = await cashier.post('/orders', {
    outletId: OUTLET_ID, tableId: TABLE_B, orderType: 'dine_in', guestCount: 1
  });
  const order2Id = order2Res.data.data.id;
  await cashier.post(`/orders/${order2Id}/items`, {
    items: [{ itemId: menuItems[1].id, quantity: 1 }]
  });
  const kot2 = await cashier.post(`/orders/${order2Id}/kot`);
  for (const t of (kot2.data.data?.tickets || [])) {
    await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
    await cashier.post(`/orders/kot/${t.id}/served`).catch(() => {});
  }
  const bill2 = await cashier.post(`/orders/${order2Id}/bill`, { applyServiceCharge: true });
  test('Cashier bill generated', bill2.data.success);
  const invoice2Id = bill2.data.data?.id;
  console.log(`   Order ${order2Id}, Invoice ${bill2.data.data?.invoiceNumber}`);

  // ─── 3. CAPTAIN PENDING BILLS — sees only own ───
  section('3. Captain pending bills — only own');

  const captainPending = await captain.get(`/orders/bills/pending/${OUTLET_ID}`);
  test('Captain pending: success', captainPending.data.success);
  const captainBills = captainPending.data.data;
  console.log(`   Captain sees ${captainBills.length} pending bill(s)`);

  const seesOwn = captainBills.some(b => b.orderId === order1Id);
  test('Captain sees own bill', seesOwn);

  const seesCashierBill = captainBills.some(b => b.orderId === order2Id);
  test('Captain does NOT see cashier bill', !seesCashierBill);

  // Verify all bills belong to captain
  // Check via DB that all returned orders are created_by captain
  let allOwnBills = true;
  for (const b of captainBills) {
    const [ord] = await pool.query('SELECT created_by FROM orders WHERE id = ?', [b.orderId]);
    if (ord[0] && parseInt(ord[0].created_by) !== parseInt(captainId)) {
      allOwnBills = false;
      console.log(`   ✗ Bill orderId=${b.orderId} created_by=${ord[0].created_by} != captain=${captainId}`);
    }
  }
  test('All captain pending bills are own orders', allOwnBills);

  // ─── 4. CASHIER PENDING BILLS — sees all ───
  section('4. Cashier pending bills — sees all');

  const cashierPending = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
  test('Cashier pending: success', cashierPending.data.success);
  const cashierBills = cashierPending.data.data;
  console.log(`   Cashier sees ${cashierBills.length} pending bill(s)`);

  const cashierSeesCaptainBill = cashierBills.some(b => b.orderId === order1Id);
  test('Cashier sees captain bill', cashierSeesCaptainBill);

  const cashierSeesOwnBill = cashierBills.some(b => b.orderId === order2Id);
  test('Cashier sees own bill', cashierSeesOwnBill);

  test('Cashier sees more bills than captain', cashierBills.length >= captainBills.length);

  // ─── 5. PAY CAPTAIN ORDER → TEST COMPLETED FILTER ───
  section('5. Pay captain order → test ?status=completed');

  await cashier.post('/orders/payment', {
    orderId: order1Id, invoiceId: invoice1Id, outletId: OUTLET_ID,
    amount: bill1.data.data?.grandTotal, paymentMode: 'cash', tipAmount: 0
  });

  // Captain completed bills
  const captainCompleted = await captain.get(`/orders/bills/pending/${OUTLET_ID}?status=completed`);
  test('Captain completed: success', captainCompleted.data.success);
  const captainCompletedBills = captainCompleted.data.data;
  const paidBillInCompleted = captainCompletedBills.some(b => b.orderId === order1Id);
  test('Captain sees paid bill in ?status=completed', paidBillInCompleted);
  console.log(`   Captain completed bills: ${captainCompletedBills.length}`);

  // Captain completed does NOT include cashier's bill (which is still pending)
  const cashierBillInCaptainCompleted = captainCompletedBills.some(b => b.orderId === order2Id);
  test('Captain completed does NOT show cashier bill', !cashierBillInCaptainCompleted);

  // Captain default pending no longer shows paid bill
  const captainPending2 = await captain.get(`/orders/bills/pending/${OUTLET_ID}`);
  const paidInPending = captainPending2.data.data.some(b => b.orderId === order1Id);
  test('Paid bill NOT in captain default pending', !paidInPending);

  // ─── 6. CAPTAIN ?status=all ───
  section('6. Captain ?status=all — own bills only');

  const captainAll = await captain.get(`/orders/bills/pending/${OUTLET_ID}?status=all`);
  test('Captain all: success', captainAll.data.success);
  const captainAllBills = captainAll.data.data;
  console.log(`   Captain all bills: ${captainAllBills.length}`);

  const cashierBillInAll = captainAllBills.some(b => b.orderId === order2Id);
  test('Captain ?status=all does NOT show cashier bill', !cashierBillInAll);

  // Cashier ?status=all sees everything
  const cashierAll = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?status=all`);
  test('Cashier all: success', cashierAll.data.success);
  console.log(`   Cashier all bills: ${cashierAll.data.data.length}`);
  test('Cashier sees more in ?status=all', cashierAll.data.data.length >= captainAllBills.length);

  // ─── 7. CLEANUP ───
  section('7. CLEANUP');
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

  // ─── RESULTS ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);
  console.log('');
  console.log('  ROLE-BASED PENDING BILLS:');
  console.log('  ┌────────────────┬──────────────────────────────────┐');
  console.log('  │ Role           │ Sees                             │');
  console.log('  ├────────────────┼──────────────────────────────────┤');
  console.log('  │ Captain        │ Own orders\' bills only           │');
  console.log('  │ Cashier/Admin  │ All bills                        │');
  console.log('  │ ?status=all    │ Same role filter applies         │');
  console.log('  │ ?status=done   │ Same role filter applies         │');
  console.log('  └────────────────┴──────────────────────────────────┘');
  console.log('');

  if (failed > 0) {
    console.log(`❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('✅ All role-based pending bills tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.response?.data?.message || err.message);
  process.exit(1);
});
