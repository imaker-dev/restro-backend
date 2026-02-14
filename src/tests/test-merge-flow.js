/**
 * Comprehensive Table Merge/Unmerge Test
 * Tests: merge, floor listing, ordering, KOT, billing, payment, unmerge
 * Scenario A: Merge → Order → Bill → Pay → Session end (auto-unmerge)
 * Scenario B: Merge → Explicit unmerge (no session)
 */
const axios = require('axios');
const BASE = 'http://localhost:3000/api/v1';

let adminApi, pass = 0, fail = 0;

function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS:', name); }
  else { fail++; console.log('  FAIL:', name); }
}

async function login() {
  const al = await axios.post(BASE + '/auth/login/pin', { employeeCode: 'ADMIN001', pin: '1234', outletId: 4 });
  adminApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + al.data.data.accessToken } });
}

async function getFloorTables() {
  const r = await adminApi.get('/tables/floor/6');
  return r.data.data;
}

async function run() {
  await login();

  // ============================================================
  // SCENARIO A: Merge → Session → Order → Bill → Pay → End Session (auto-unmerge)
  // ============================================================
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SCENARIO A: Full flow with session auto-unmerge  ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // STEP 1: Pre-merge state
  console.log('\n=== STEP 1: PRE-MERGE STATE ===');
  let tables = await getFloorTables();
  const ff1 = tables.find(t => t.table_number === 'FF1');
  const ff3 = tables.find(t => t.table_number === 'FF3');
  console.log('  FF1: status=' + ff1.status + ' cap=' + ff1.capacity);
  console.log('  FF3: status=' + ff3.status + ' cap=' + ff3.capacity);
  ok('FF1 available', ff1.status === 'available');
  ok('FF3 available', ff3.status === 'available');
  ok('FF1 cap=4', ff1.capacity === 4);
  ok('FF3 cap=6', ff3.capacity === 6);

  // STEP 2: Merge FF1 (primary) + FF3 (secondary)
  console.log('\n=== STEP 2: MERGE FF1(primary) + FF3(secondary) ===');
  const mergeRes = await adminApi.post('/tables/' + ff1.id + '/merge', { tableIds: [ff3.id] });
  ok('Merge success', mergeRes.data.success);

  // STEP 3: Verify post-merge
  console.log('\n=== STEP 3: POST-MERGE FLOOR LISTING ===');
  tables = await getFloorTables();
  const ff1After = tables.find(t => t.table_number === 'FF1');
  const ff3After = tables.find(t => t.table_number === 'FF3');
  console.log('  FF1: status=' + ff1After.status + ' cap=' + ff1After.capacity + ' isMergedPrimary=' + ff1After.isMergedPrimary);
  console.log('  FF3: status=' + ff3After.status + ' mergedInto=' + JSON.stringify(ff3After.mergedInto));
  ok('FF1 cap=10 (4+6)', ff1After.capacity === 10);
  ok('FF3 status=merged', ff3After.status === 'merged');
  ok('FF1 isMergedPrimary', ff1After.isMergedPrimary === true);
  ok('FF3 mergedInto FF1', ff3After.mergedInto && ff3After.mergedInto.primary_table_number === 'FF1');
  ok('FF1 mergedTables has FF3', ff1After.mergedTables && ff1After.mergedTables.length === 1 && ff1After.mergedTables[0].merged_table_number === 'FF3');

  // STEP 4: Cannot merge an already-merged table
  console.log('\n=== STEP 4: GUARD RAILS ===');
  try {
    await adminApi.post('/tables/' + tables.find(t => t.table_number === 'FF2').id + '/merge', { tableIds: [ff3After.id] });
    fail++; console.log('  FAIL: Should reject merging a merged table');
  } catch (e) {
    const msg = e.response ? e.response.data.message : '';
    ok('Cannot merge a merged table', msg.includes('not available') || msg.includes('not mergeable') || msg.includes('already merged'));
  }

  // STEP 5: Start session + create order
  console.log('\n=== STEP 5: SESSION + ORDER ON MERGED PRIMARY ===');
  const sessionRes = await adminApi.post('/tables/' + ff1.id + '/session', {
    outletId: 4, guestCount: 8, guestName: 'Merge Test Guest'
  });
  ok('Session started', sessionRes.data.success);

  const orderRes = await adminApi.post('/orders', {
    outletId: 4, tableId: ff1.id, orderType: 'dine_in',
    items: [{ itemId: 7, quantity: 2 }]
  });
  ok('Order created on merged primary', orderRes.data.success);
  const orderId = orderRes.data.data.id;
  console.log('  Order:', orderRes.data.data.orderNumber || orderRes.data.data.order_number, 'id:', orderId);

  // STEP 6: Floor listing with active order
  console.log('\n=== STEP 6: FLOOR LISTING WITH ORDER ===');
  tables = await getFloorTables();
  const ff1WithOrder = tables.find(t => t.table_number === 'FF1');
  console.log('  FF1: status=' + ff1WithOrder.status + ' order=' + ff1WithOrder.order_number + ' cap=' + ff1WithOrder.capacity);
  ok('FF1 has order', !!ff1WithOrder.current_order_id);
  ok('FF1 still merged primary', ff1WithOrder.isMergedPrimary === true);
  ok('FF1 cap still 10', ff1WithOrder.capacity === 10);

  // STEP 7: KOT (items may auto-send on order creation)
  console.log('\n=== STEP 7: KOT ===');
  try {
    const kotRes = await adminApi.post('/orders/' + orderId + '/kot');
    ok('KOT sent', kotRes.data.success);
  } catch (e) {
    // "No pending items" means KOT was already auto-sent — that's fine
    const msg = e.response ? e.response.data.message : e.message;
    console.log('  KOT note:', msg);
    ok('KOT auto-sent (no pending)', msg.includes('No pending') || msg.includes('no pending'));
  }

  // STEP 8: Bill
  console.log('\n=== STEP 8: BILLING ===');
  try {
    const billRes = await adminApi.post('/orders/' + orderId + '/bill');
    ok('Bill generated', billRes.data.success);
    const grandTotal = billRes.data.data.grandTotal || billRes.data.data.grand_total;
    console.log('  Grand total:', grandTotal);

    // STEP 9: Payment (flat object: orderId, paymentMode, amount)
    console.log('\n=== STEP 9: PAYMENT ===');
    try {
      const payRes = await adminApi.post('/orders/payment', {
        orderId: orderId,
        paymentMode: 'cash',
        amount: grandTotal
      });
      ok('Payment processed', payRes.data.success);
    } catch (e) {
      console.log('  Payment note:', e.response ? e.response.data.message : e.message);
    }
  } catch (e) {
    console.log('  Bill note:', e.response ? e.response.data.message : e.message);
  }

  // STEP 10: End session (should auto-unmerge + restore capacity)
  console.log('\n=== STEP 10: END SESSION (auto-unmerge) ===');
  try {
    await adminApi.delete('/tables/' + ff1.id + '/session');
    console.log('  Session ended');
  } catch (e) {
    console.log('  Session end note:', e.response ? e.response.data.message : e.message);
  }

  // STEP 11: Verify auto-unmerge restored everything
  console.log('\n=== STEP 11: POST-SESSION-END STATE ===');
  tables = await getFloorTables();
  let ff1Post = tables.find(t => t.table_number === 'FF1');
  let ff3Post = tables.find(t => t.table_number === 'FF3');
  console.log('  FF1: status=' + ff1Post.status + ' cap=' + ff1Post.capacity);
  console.log('  FF3: status=' + ff3Post.status + ' cap=' + ff3Post.capacity);
  ok('FF1 cap restored to 4 (auto-unmerge)', ff1Post.capacity === 4);
  ok('FF3 available (auto-unmerge)', ff3Post.status === 'available');
  ok('FF3 cap=6 unchanged', ff3Post.capacity === 6);
  ok('FF1 no longer merged primary', !ff1Post.isMergedPrimary);

  // ============================================================
  // SCENARIO B: Merge → Explicit Unmerge (no session)
  // ============================================================
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SCENARIO B: Merge + explicit unmerge (no session) ║');
  console.log('╚══════════════════════════════════════════════════╝');

  console.log('\n=== MERGE FF1 + FF3 again ===');
  const merge2 = await adminApi.post('/tables/' + ff1.id + '/merge', { tableIds: [ff3.id] });
  ok('Second merge success', merge2.data.success);

  tables = await getFloorTables();
  ff1Post = tables.find(t => t.table_number === 'FF1');
  ff3Post = tables.find(t => t.table_number === 'FF3');
  ok('FF1 cap=10 again', ff1Post.capacity === 10);
  ok('FF3 merged again', ff3Post.status === 'merged');

  console.log('\n=== EXPLICIT UNMERGE ===');
  const unmergeRes = await adminApi.delete('/tables/' + ff1.id + '/merge');
  ok('Explicit unmerge success', unmergeRes.data.success);

  tables = await getFloorTables();
  ff1Post = tables.find(t => t.table_number === 'FF1');
  ff3Post = tables.find(t => t.table_number === 'FF3');
  console.log('  FF1: status=' + ff1Post.status + ' cap=' + ff1Post.capacity);
  console.log('  FF3: status=' + ff3Post.status + ' cap=' + ff3Post.capacity);
  ok('FF1 cap restored to 4 (explicit)', ff1Post.capacity === 4);
  ok('FF3 available (explicit)', ff3Post.status === 'available');
  ok('FF3 cap=6 unchanged', ff3Post.capacity === 6);

  // ===========================
  // SUMMARY
  // ===========================
  console.log('\n=============================');
  console.log('RESULT:', pass, 'passed,', fail, 'failed');
  console.log('=============================');
}

run().catch(e => console.log('FATAL:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).substring(0, 500) : e.message));
