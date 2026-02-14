/**
 * Test: Captain Bills, Cashier Override, Table Locking, Payment Completion
 * 
 * Scenarios:
 * 1. Captain sees only their own pending/completed bills
 * 2. Captain cannot take another captain's table (table locking)
 * 3. Cashier can operate on any table (bypasses table lock)
 * 4. Cashier add/modify/cancel items on behalf of session captain
 * 5. Payment completes: table released, session ended, order completed
 * 6. Real-time events: bill:status with captainId, table:update with floorId
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
  console.log('║  CAPTAIN/CASHIER ROLES, TABLE LOCKING, PAYMENT TEST      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();

  // ─── 0. LOGIN ───
  section('0. LOGIN + SETUP');

  const cashier = await login('cashier11@gmail.com', 'Cash@111');
  console.log('   ✓ Cashier login');

  const captain1 = await login('captainall@gmail.com', 'Captain@123');
  console.log('   ✓ Captain1 login');

  // Get captain1's userId
  const me1 = await captain1.get('/auth/me');
  const captain1Id = me1.data.data.id;
  console.log(`   Captain1 ID: ${captain1Id}`);

  // Find a second captain (or create fallback)
  const [captains] = await pool.query(
    `SELECT u.id, u.email, u.name FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE r.slug = 'captain' AND u.is_active = 1 AND u.id != ?
     LIMIT 1`,
    [captain1Id]
  );

  let captain2 = null;
  let captain2Id = null;
  if (captains[0]) {
    try {
      captain2 = await login(captains[0].email, 'captain123');
      const me2 = await captain2.get('/auth/me');
      captain2Id = me2.data.data.id;
      console.log(`   ✓ Captain2 login (${captains[0].name}, ID: ${captain2Id})`);
    } catch (e) {
      console.log(`   Captain2 login failed (${captains[0].email}): ${e.message}`);
    }
  }
  if (!captain2) {
    console.log('   ⚠ No second captain available — some table locking tests will be skipped');
  }

  // Get cashier userId
  const cashierMe = await cashier.get('/auth/me');
  const cashierId = cashierMe.data.data.id;
  console.log(`   Cashier ID: ${cashierId}`);

  // Cleanup: release all test tables
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
  const tablesRes = await captain1.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes.data.data.filter(t => t.status === 'available');
  test('Tables available', availTables.length >= 3, `Found ${availTables.length}`);

  // Get menu items
  const menuRes = await captain1.get(`/menu/${OUTLET_ID}/captain`);
  const menuItems = [];
  for (const cat of (menuRes.data.data?.menu || [])) {
    for (const item of (cat.items || [])) {
      if (!item.variants && menuItems.length < 5) menuItems.push(item);
    }
  }
  test('Menu items found', menuItems.length >= 2, `Found ${menuItems.length}`);

  const TABLE_A = availTables[0]?.id;
  const TABLE_B = availTables[1]?.id;
  const TABLE_C = availTables[2]?.id;

  // ─── 1. CAPTAIN1 CREATES ORDER → TABLE LOCKED ───
  section('1. Captain1 creates order on Table A — table locked');

  const order1Res = await captain1.post('/orders', {
    outletId: OUTLET_ID,
    tableId: TABLE_A,
    orderType: 'dine_in',
    guestCount: 2
  });
  test('Captain1 order created', order1Res.data.success);
  const order1Id = order1Res.data.data.id;
  console.log(`   Order ID: ${order1Id}, Table: ${TABLE_A}`);

  // Add items
  await captain1.post(`/orders/${order1Id}/items`, {
    items: [{ itemId: menuItems[0].id, quantity: 2 }, { itemId: menuItems[1].id, quantity: 1 }]
  });
  console.log(`   Added items: ${menuItems[0].name} x2, ${menuItems[1].name} x1`);

  // Send KOT and serve
  const kotRes = await captain1.post(`/orders/${order1Id}/kot`);
  for (const t of (kotRes.data.data?.tickets || [])) {
    await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
    await captain1.post(`/orders/kot/${t.id}/served`).catch(() => {});
  }
  console.log('   KOT sent + served');

  // ─── 2. TABLE LOCKING — Captain2 blocked from Captain1's table ───
  section('2. Table locking — Captain2 cannot take Captain1\'s table');

  if (captain2) {
    try {
      await captain2.post('/orders', {
        outletId: OUTLET_ID,
        tableId: TABLE_A,
        orderType: 'dine_in',
        guestCount: 1
      });
      test('Captain2 blocked from Table A', false, 'Should have thrown error');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      test('Captain2 blocked from Table A', msg.includes('session was started by') || msg.includes('active order'), msg);
    }

    // Captain2 blocked from adding items to captain1's order
    try {
      await captain2.post(`/orders/${order1Id}/items`, {
        items: [{ itemId: menuItems[0].id, quantity: 1 }]
      });
      test('Captain2 blocked from adding items', false, 'Should have thrown error');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      test('Captain2 blocked from adding items', msg.includes('assigned captain'), msg);
    }
  } else {
    console.log('   ⚠ Skipped — no second captain');
  }

  // ─── 3. CASHIER BYPASSES TABLE LOCK ───
  section('3. Cashier bypasses table lock — can modify any table');

  // Cashier adds item to captain1's order
  const cashierAddRes = await cashier.post(`/orders/${order1Id}/items`, {
    items: [{ itemId: menuItems[2]?.id || menuItems[0].id, quantity: 1 }]
  });
  test('Cashier adds item to Captain1 order', cashierAddRes.data.success);

  // Verify order still belongs to captain1
  const orderCheck = await cashier.get(`/orders/${order1Id}`);
  test('Order still owned by Captain1', 
    parseInt(orderCheck.data.data.created_by) === parseInt(captain1Id),
    `created_by=${orderCheck.data.data.created_by} vs captain1=${captain1Id}`
  );

  // Cashier cancels an item on captain1's order
  const orderItems = orderCheck.data.data.items || [];
  const itemToCancel = orderItems.find(i => i.status !== 'cancelled');
  if (itemToCancel) {
    const cancelRes = await cashier.post(`/orders/items/${itemToCancel.id}/cancel`, {
      reason: 'Customer changed mind'
    });
    test('Cashier cancels item on Captain1 order', cancelRes.data.success);
  }

  // ─── 4. CASHIER CREATES ORDER ON ANOTHER TABLE ───
  section('4. Cashier creates order on fresh table');

  // Cashier creates order on Table B (starts session as cashier)
  const cashierOrderRes = await cashier.post('/orders', {
    outletId: OUTLET_ID,
    tableId: TABLE_B,
    orderType: 'dine_in',
    guestCount: 3
  });
  test('Cashier creates order on Table B', cashierOrderRes.data.success);
  const order2Id = cashierOrderRes.data.data.id;
  console.log(`   Order ID: ${order2Id}, Table: ${TABLE_B}`);

  // ─── 5. GENERATE BILL + CAPTAIN BILLS VIEW ───
  section('5. Generate bill → Captain sees own bills');

  // Send KOT for order1 (remaining items)
  await captain1.post(`/orders/${order1Id}/kot`).catch(() => {});
  // Serve all KOTs
  const kots1 = await captain1.get(`/orders/${order1Id}/kots`);
  for (const t of (kots1.data.data || [])) {
    if (t.status !== 'served') {
      await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
      await captain1.post(`/orders/kot/${t.id}/served`).catch(() => {});
    }
  }

  // Generate bill for captain1's order
  const billRes = await cashier.post(`/orders/${order1Id}/bill`, { applyServiceCharge: true });
  test('Bill generated for Captain1 order', billRes.data.success);
  const invoice1 = billRes.data.data;
  console.log(`   Invoice: ${invoice1?.invoiceNumber} | GT: ₹${invoice1?.grandTotal}`);

  // Captain1 sees own pending bills
  const captain1Bills = await captain1.get(`/orders/captain/bills/${OUTLET_ID}`);
  test('Captain1 bills: success', captain1Bills.data.success);
  test('Captain1 bills: has data array', Array.isArray(captain1Bills.data.data));
  const myPendingBill = captain1Bills.data.data.find(b => b.orderId === order1Id);
  test('Captain1 sees own pending bill', !!myPendingBill, 
    myPendingBill ? `Found ${myPendingBill.invoiceNumber}` : 'Not found');

  // Captain1 pending bills don't include cashier's order2 bill (if any)
  // (order2 not billed yet, but verify filtering works)
  const captain1AllBills = await captain1.get(`/orders/captain/bills/${OUTLET_ID}?status=all`);
  const otherOrderBill = captain1AllBills.data.data.find(b => b.orderId === order2Id);
  test('Captain1 does NOT see cashier order bill', !otherOrderBill);

  // Captain2 should NOT see captain1's bills
  if (captain2) {
    const captain2Bills = await captain2.get(`/orders/captain/bills/${OUTLET_ID}`);
    test('Captain2 bills: success', captain2Bills.data.success);
    const cap2SeesOrder1 = captain2Bills.data.data.find(b => b.orderId === order1Id);
    test('Captain2 does NOT see Captain1 bill', !cap2SeesOrder1);
  }

  // ─── 6. PAYMENT → TABLE RELEASED + SESSION ENDED + COMPLETED ───
  section('6. Payment → table released, session ended, order completed');

  let payRes;
  try {
    payRes = await cashier.post('/orders/payment', {
      orderId: order1Id,
      invoiceId: invoice1?.id,
      outletId: OUTLET_ID,
      amount: invoice1?.grandTotal,
      paymentMode: 'cash',
      tipAmount: 0
    });
    test('Payment processed', payRes.data.success);
  } catch (payErr) {
    console.log('   Payment error:', payErr.response?.data?.message || payErr.message);
    test('Payment processed', false, payErr.response?.data?.message || payErr.message);
  }

  // Verify order status = completed
  const paidOrder = await cashier.get(`/orders/${order1Id}`);
  test('Order status = completed', paidOrder.data.data.status === 'completed',
    `status=${paidOrder.data.data.status}`);
  test('Payment status = completed', paidOrder.data.data.payment_status === 'completed',
    `payment_status=${paidOrder.data.data.payment_status}`);

  // Verify table released
  const tableAfterPay = await cashier.get(`/tables/${TABLE_A}`);
  test('Table A status = available', tableAfterPay.data.data.status === 'available',
    `status=${tableAfterPay.data.data.status}`);

  // Verify session ended
  const [sessionRows] = await pool.query(
    `SELECT * FROM table_sessions WHERE table_id = ? ORDER BY id DESC LIMIT 1`, [TABLE_A]
  );
  test('Table session status = completed', sessionRows[0]?.status === 'completed',
    `session_status=${sessionRows[0]?.status}`);
  test('Table session ended_at set', !!sessionRows[0]?.ended_at);

  // Captain1 sees paid bill in completed filter
  const captain1CompletedBills = await captain1.get(`/orders/captain/bills/${OUTLET_ID}?status=completed`);
  const completedBill = captain1CompletedBills.data.data.find(b => b.orderId === order1Id);
  test('Captain1 sees paid bill in ?status=completed', !!completedBill,
    completedBill ? completedBill.invoiceNumber : 'Not found');

  // Captain1 does NOT see paid bill in default pending filter
  const captain1DefaultBills = await captain1.get(`/orders/captain/bills/${OUTLET_ID}`);
  const paidInPending = captain1DefaultBills.data.data.find(b => b.orderId === order1Id);
  test('Paid bill NOT in default pending', !paidInPending);

  // ─── 7. CASHIER FULL LIFECYCLE ON ANOTHER TABLE ───
  section('7. Cashier full lifecycle: create → items → KOT → bill → pay');

  // Add items to cashier order
  await cashier.post(`/orders/${order2Id}/items`, {
    items: [{ itemId: menuItems[0].id, quantity: 1 }, { itemId: menuItems[1].id, quantity: 1 }]
  });

  // KOT + serve
  const kot2Res = await cashier.post(`/orders/${order2Id}/kot`);
  for (const t of (kot2Res.data.data?.tickets || [])) {
    await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
    await cashier.post(`/orders/kot/${t.id}/served`).catch(() => {});
  }

  // Generate bill
  const bill2Res = await cashier.post(`/orders/${order2Id}/bill`, { applyServiceCharge: true });
  test('Cashier bill generated', bill2Res.data.success);
  const invoice2 = bill2Res.data.data;

  // Pay
  const pay2Res = await cashier.post('/orders/payment', {
    orderId: order2Id,
    invoiceId: invoice2?.id,
    outletId: OUTLET_ID,
    amount: invoice2?.grandTotal,
    paymentMode: 'cash',
    tipAmount: 0
  });
  test('Cashier payment processed', pay2Res.data.success);

  // Verify Table B released
  const tableBAfter = await cashier.get(`/tables/${TABLE_B}`);
  test('Table B available after payment', tableBAfter.data.data.status === 'available',
    `status=${tableBAfter.data.data.status}`);

  // ─── 8. CAPTAIN BILL FILTERS ───
  section('8. Captain bill filters: search, pagination, sort');

  const searchRes = await captain1.get(`/orders/captain/bills/${OUTLET_ID}?status=all&search=INV`);
  test('Captain bills: search works', searchRes.data.success);

  const paginateRes = await captain1.get(`/orders/captain/bills/${OUTLET_ID}?status=all&page=1&limit=5`);
  test('Captain bills: pagination works', paginateRes.data.success && !!paginateRes.data.pagination);
  test('Captain bills: has totalPages', paginateRes.data.pagination?.totalPages >= 0);

  const sortRes = await captain1.get(`/orders/captain/bills/${OUTLET_ID}?status=all&sortBy=grand_total&sortOrder=desc`);
  test('Captain bills: sort works', sortRes.data.success);

  // ─── 9. CLEANUP ───
  section('9. CLEANUP');
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
  console.log(`${'═'.repeat(60)}\n`);

  if (failed > 0) {
    console.log(`❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('✅ All captain/cashier role tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
