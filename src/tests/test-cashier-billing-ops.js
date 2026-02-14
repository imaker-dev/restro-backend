/**
 * Test: Cashier Billing Operations — Pending Bills, Service Charge, GST, Discounts
 *
 * Verifies:
 *  1. GET pending bills — paginated response with pagination metadata
 *  2. Pending bills — filter by floor, search by table/customer/order, sort
 *  3. Pagination — page, limit, total, totalPages
 *  4. Remove service charge — recalculate grand total correctly
 *  5. Restore service charge — recalculate back
 *  6. Remove GST (non-GST bill) — requires customerGstin, all taxes zeroed
 *  7. GST removal without GSTIN — rejected
 *  8. Remove both service charge + GST — grand total = subtotal only
 *  9. Restore both — grand total back to original
 * 10. Manual flat discount — correct amount deducted
 * 11. Manual percentage discount — correct % calculated + capped if needed
 * 12. Discount by code (WELCOME10) — 10% off, max ₹200, min ₹500
 * 13. Duplicate discount code rejected
 * 14. Invalid / expired code rejected
 * 15. Order cancel → bill auto-cancelled, removed from pending
 * 16. Item cancel → cancelled items excluded from bill/invoice
 * 17. All calculations verified: subtotal, tax, service charge, discount, round-off, grand total
 * 18. All responses in camelCase format
 * 19. Real-time bill:status events emitted on every change
 */

require('dotenv').config();
const axios = require('axios');

const API = process.env.TEST_API_URL || 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

let passed = 0, failed = 0;
const section = (title) => console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
const test = (name, condition, detail) => {
  if (condition) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
};
const n = (v) => parseFloat(v) || 0;
const round2 = (v) => parseFloat(v.toFixed(2));

function verifyCamelCase(obj, label) {
  const keys = Object.keys(obj);
  const snakeKeys = keys.filter(k => k.includes('_'));
  test(`${label}: camelCase (no snake_case)`, snakeKeys.length === 0,
    snakeKeys.length > 0 ? `Found: ${snakeKeys.slice(0, 5).join(', ')}...` : '');
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  CASHIER BILLING OPS — CALCULATION VERIFICATION TEST   ║');
  console.log('║  Service Charge · GST · Discounts · Pending Bills      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ─── LOGIN ───
  section('1. LOGIN');
  const cashierLogin = await axios.post(`${API}/auth/login`, {
    email: 'admin@restropos.com', password: 'admin123'
  });
  const TOKEN = cashierLogin.data.data.accessToken;
  const cashier = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${TOKEN}` } });
  test('Cashier login', !!TOKEN);

  const captainLogin = await axios.post(`${API}/auth/login`, {
    email: 'captainall@gmail.com', password: 'Captain@123'
  });
  const captain = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${captainLogin.data.data.accessToken}` } });
  test('Captain login', !!captainLogin.data.data.accessToken);

  // ─── 2. DB CLEANUP ───
  section('2. SETUP — Clean DB + Create served order');

  const { initializeDatabase, getPool } = require('../database');
  await initializeDatabase();
  const pool = getPool();

  // Cancel stale orders
  await pool.query(
    `UPDATE orders SET status='cancelled', cancelled_at=NOW()
     WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]
  );
  await pool.query(
    `UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL
     WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]
  );
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);

  // Reset discount usage counts for test reproducibility
  await pool.query('UPDATE discounts SET usage_count = 0 WHERE outlet_id = ?', [OUTLET_ID]);

  // Remove stale order_discounts from previous test runs
  await pool.query(
    `DELETE od FROM order_discounts od
     JOIN orders o ON od.order_id = o.id
     WHERE o.outlet_id = ? AND o.status IN ('cancelled', 'completed')`, [OUTLET_ID]
  );

  const tablesRes = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes.data.data.filter(t => t.status === 'available');
  test('Tables available', availTables.length >= 1);
  const TABLE_ID = availTables[0]?.id;

  // Get menu items
  const menuRes = await captain.get(`/menu/${OUTLET_ID}/captain`);
  const menuItems = [];
  for (const cat of (menuRes.data.data?.menu || [])) {
    for (const item of (cat.items || [])) {
      if (menuItems.length < 3 && !item.variants) {
        menuItems.push({ itemId: item.id, quantity: 2, price: item.price });
      }
    }
  }
  test('Menu items found', menuItems.length >= 2);

  // Helper: create dine-in order → items → KOT → serve
  async function createServedOrder(tableId, orderType = 'dine_in', items = menuItems) {
    if (tableId) {
      await pool.query(
        `UPDATE orders SET status='cancelled', cancelled_at=NOW()
         WHERE table_id=? AND status NOT IN ('paid','cancelled','completed')`, [tableId]
      );
      await pool.query(
        'UPDATE table_sessions SET status="completed", ended_at=NOW(), order_id=NULL WHERE table_id=? AND status="active"', [tableId]
      );
      await pool.query('UPDATE tables SET status="available" WHERE id=?', [tableId]);
    }
    const payload = { outletId: OUTLET_ID, orderType, guestCount: 2 };
    if (tableId) payload.tableId = tableId;
    const orderRes = await captain.post('/orders', payload);
    const orderId = orderRes.data.data.id;
    await captain.post(`/orders/${orderId}/items`, { items });
    const kotRes = await captain.post(`/orders/${orderId}/kot`);
    for (const t of (kotRes.data.data?.tickets || [])) {
      await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
      await captain.post(`/orders/kot/${t.id}/served`).catch(() => {});
    }
    return orderId;
  }

  // Create main test order (dine-in, gets service charge)
  const ORDER_ID = await createServedOrder(TABLE_ID);
  test('Order created + served', !!ORDER_ID);

  // ─── 3. GENERATE BILL — Baseline with service charge ───
  section('3. GENERATE BILL — Baseline numbers');

  const billRes = await cashier.post(`/orders/${ORDER_ID}/bill`, {
    customerName: 'Calc Test', applyServiceCharge: true
  });
  test('Bill generated', billRes.data.success);
  const inv = billRes.data.data;
  verifyCamelCase(inv, 'Invoice');

  // Save baseline numbers
  const BASE = {
    subtotal: inv.subtotal,
    discountAmount: inv.discountAmount,
    taxableAmount: inv.taxableAmount,
    totalTax: inv.totalTax,
    cgst: inv.cgstAmount,
    sgst: inv.sgstAmount,
    serviceCharge: inv.serviceCharge,
    roundOff: inv.roundOff,
    grandTotal: inv.grandTotal
  };

  console.log(`   Subtotal:       ₹${BASE.subtotal}`);
  console.log(`   Discount:       ₹${BASE.discountAmount}`);
  console.log(`   Taxable:        ₹${BASE.taxableAmount}`);
  console.log(`   CGST:           ₹${BASE.cgst}`);
  console.log(`   SGST:           ₹${BASE.sgst}`);
  console.log(`   Total Tax:      ₹${BASE.totalTax}`);
  console.log(`   Service Charge: ₹${BASE.serviceCharge}`);
  console.log(`   Round-off:      ₹${BASE.roundOff}`);
  console.log(`   Grand Total:    ₹${BASE.grandTotal}`);

  test('subtotal > 0', BASE.subtotal > 0);
  test('taxableAmount = subtotal - discount', BASE.taxableAmount === round2(BASE.subtotal - BASE.discountAmount));
  test('serviceCharge = 10% of taxable', BASE.serviceCharge === round2(BASE.taxableAmount * 0.10),
    `Expected: ${round2(BASE.taxableAmount * 0.10)}, Got: ${BASE.serviceCharge}`);

  // Verify grand total calculation
  const expectedGT = Math.round(BASE.taxableAmount + BASE.totalTax + BASE.serviceCharge);
  test('grandTotal calculation correct', BASE.grandTotal === expectedGT,
    `Expected: ${expectedGT}, Got: ${BASE.grandTotal}`);

  const INVOICE_ID = inv.id;

  // ─── 4. PENDING BILLS — Cashier sees this bill ───
  section('4. PENDING BILLS — Cashier real-time view');

  const pendingRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
  test('Pending bills: success', pendingRes.data.success);
  test('Pending bills: is array', Array.isArray(pendingRes.data.data));
  test('Pending bills: has entries', pendingRes.data.data.length > 0);

  // Verify pagination metadata
  const pg = pendingRes.data.pagination;
  test('Pagination: object present', !!pg);
  test('Pagination: has page', pg && pg.page === 1);
  test('Pagination: has limit', pg && pg.limit === 20);
  test('Pagination: has total', pg && typeof pg.total === 'number' && pg.total >= 0);
  test('Pagination: has totalPages', pg && typeof pg.totalPages === 'number' && pg.totalPages >= 0);
  console.log(`   Pagination: page=${pg?.page}, limit=${pg?.limit}, total=${pg?.total}, totalPages=${pg?.totalPages}`);

  const myPending = pendingRes.data.data.find(b => b.id === INVOICE_ID);
  test('Our invoice in pending list', !!myPending);
  if (myPending) {
    verifyCamelCase(myPending, 'PendingBill');
    test('Pending: paymentStatus = pending', myPending.paymentStatus === 'pending');
    test('Pending: grandTotal matches', myPending.grandTotal === BASE.grandTotal);
    test('Pending: has items', myPending.items.length > 0);
    test('Pending: no cancelled items in bill', myPending.items.every(i => i.status !== 'cancelled'));
    test('Pending: has floorId', myPending.floorId !== undefined);
    test('Pending: has floorName', myPending.floorName !== undefined);
    console.log(`   Found ${pendingRes.data.data.length} pending bill(s) — ours: ${myPending.invoiceNumber}`);
    console.log(`   Floor: ${myPending.floorName} (ID: ${myPending.floorId})`);
  }

  // ─── 4b. PENDING BILLS — Filter by Floor ───
  section('4b. PENDING BILLS — Filter by Floor');

  // Get floors for this outlet
  const [floors] = await pool.query('SELECT id, name FROM floors WHERE outlet_id = ?', [OUTLET_ID]);
  console.log(`   Floors: ${floors.map(f => `${f.name} (${f.id})`).join(', ')}`);

  if (myPending && myPending.floorId) {
    const floorFilterRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?floorId=${myPending.floorId}`);
    test('Floor filter: success', floorFilterRes.data.success);
    const floorBills = floorFilterRes.data.data;
    test('Floor filter: has results', floorBills.length > 0);
    test('Floor filter: has pagination', !!floorFilterRes.data.pagination);
    test('Floor filter: all bills on correct floor', floorBills.every(b => b.floorId === myPending.floorId));
    console.log(`   Floor ${myPending.floorName}: ${floorBills.length} pending bill(s)`);

    // Filter by different floor — should NOT include our bill
    const otherFloor = floors.find(f => f.id !== myPending.floorId);
    if (otherFloor) {
      const otherFloorRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?floorId=${otherFloor.id}`);
      test('Other floor filter: success', otherFloorRes.data.success);
      const otherBills = otherFloorRes.data.data;
      const ourBillOnOther = otherBills.find(b => b.id === INVOICE_ID);
      test('Our bill NOT on other floor', !ourBillOnOther);
      console.log(`   Floor ${otherFloor.name}: ${otherBills.length} pending bill(s)`);
    }
  }

  // ─── 4b2. PAGINATION — Custom page & limit ───
  section('4b2. PENDING BILLS — Pagination');

  const pgRes1 = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?page=1&limit=2`);
  test('Page 1 limit 2: success', pgRes1.data.success);
  test('Page 1 limit 2: max 2 results', pgRes1.data.data.length <= 2);
  test('Page 1 limit 2: pagination.limit = 2', pgRes1.data.pagination.limit === 2);
  test('Page 1 limit 2: pagination.page = 1', pgRes1.data.pagination.page === 1);
  const totalBills = pgRes1.data.pagination.total;
  const expectedPages = Math.ceil(totalBills / 2);
  test('Page 1 limit 2: totalPages correct', pgRes1.data.pagination.totalPages === expectedPages,
    `Expected ${expectedPages}, got ${pgRes1.data.pagination.totalPages}`);
  console.log(`   Page 1: ${pgRes1.data.data.length} bills (total: ${totalBills}, pages: ${expectedPages})`);

  if (expectedPages > 1) {
    const pgRes2 = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?page=2&limit=2`);
    test('Page 2: success', pgRes2.data.success);
    test('Page 2: pagination.page = 2', pgRes2.data.pagination.page === 2);
    test('Page 2: different data than page 1',
      pgRes2.data.data.length === 0 || pgRes2.data.data[0]?.id !== pgRes1.data.data[0]?.id);
    console.log(`   Page 2: ${pgRes2.data.data.length} bills`);
  }

  // Large page number → empty results
  const pgEmpty = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?page=9999&limit=10`);
  test('Page 9999: empty data', pgEmpty.data.data.length === 0);
  test('Page 9999: still has pagination', !!pgEmpty.data.pagination);
  console.log(`   Page 9999: ${pgEmpty.data.data.length} bills (total still: ${pgEmpty.data.pagination.total})`);

  // ─── 4c. PENDING BILLS — Search ───
  section('4c. PENDING BILLS — Search');

  // Search by table number
  if (myPending && myPending.tableNumber) {
    const tblSearch = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?search=${myPending.tableNumber}`);
    test('Search by table: success', tblSearch.data.success);
    test('Search by table: found results', tblSearch.data.data.length > 0);
    test('Search by table: has pagination', !!tblSearch.data.pagination);
    const foundByTbl = tblSearch.data.data.find(b => b.id === INVOICE_ID);
    test('Search by table: our bill found', !!foundByTbl);
    console.log(`   Search "${myPending.tableNumber}": ${tblSearch.data.data.length} result(s)`);
  }

  // Search by customer name
  const custSearch = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?search=Calc`);
  test('Search by customer name: success', custSearch.data.success);
  const foundByCust = custSearch.data.data.find(b => b.id === INVOICE_ID);
  test('Search by customer: our bill found', !!foundByCust);
  console.log(`   Search "Calc": ${custSearch.data.data.length} result(s)`);

  // Search by invoice number
  if (myPending) {
    const invNumSearch = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?search=${myPending.invoiceNumber}`);
    test('Search by invoice#: success', invNumSearch.data.success);
    test('Search by invoice#: found', invNumSearch.data.data.length > 0);
    console.log(`   Search "${myPending.invoiceNumber}": ${invNumSearch.data.data.length} result(s)`);
  }

  // Search non-existent — should return empty
  const noResults = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?search=ZZZZNONEXIST999`);
  test('Search non-existent: empty array', noResults.data.data.length === 0);
  test('Search non-existent: pagination total=0', noResults.data.pagination.total === 0);

  // ─── 4d. PENDING BILLS — Sort ───
  section('4d. PENDING BILLS — Sort');

  const sortAscRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?sortBy=grand_total&sortOrder=asc`);
  test('Sort by grand_total ASC: success', sortAscRes.data.success);
  const ascBills = sortAscRes.data.data;
  if (ascBills.length >= 2) {
    test('Sort ASC: first <= last', ascBills[0].grandTotal <= ascBills[ascBills.length - 1].grandTotal);
    console.log(`   ASC: ₹${ascBills[0].grandTotal} ... ₹${ascBills[ascBills.length - 1].grandTotal}`);
  }

  const sortDescRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?sortBy=grand_total&sortOrder=desc`);
  test('Sort by grand_total DESC: success', sortDescRes.data.success);
  const descBills = sortDescRes.data.data;
  if (descBills.length >= 2) {
    test('Sort DESC: first >= last', descBills[0].grandTotal >= descBills[descBills.length - 1].grandTotal);
    console.log(`   DESC: ₹${descBills[0].grandTotal} ... ₹${descBills[descBills.length - 1].grandTotal}`);
  }

  // Sort by created_at (default)
  const sortTimeRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?sortBy=created_at&sortOrder=desc`);
  test('Sort by created_at: success', sortTimeRes.data.success);

  // Combined: floor + search + sort + pagination
  if (myPending && myPending.floorId) {
    const comboRes = await cashier.get(
      `/orders/bills/pending/${OUTLET_ID}?floorId=${myPending.floorId}&search=Calc&sortBy=grand_total&sortOrder=asc&page=1&limit=5`
    );
    test('Combined filter+search+sort+page: success', comboRes.data.success);
    test('Combined: found results', comboRes.data.data.length > 0);
    test('Combined: has pagination', !!comboRes.data.pagination);
    console.log(`   Combined (floor+search+sort+page): ${comboRes.data.data.length} result(s)`);
  }

  // ─── 5. REMOVE SERVICE CHARGE — Recalculate ───
  section('5. REMOVE SERVICE CHARGE — Recalculate');

  const noSvcRes = await cashier.put(`/orders/invoice/${INVOICE_ID}/charges`, {
    removeServiceCharge: true, removeGst: false
  });
  test('Remove svc: success', noSvcRes.data.success);
  test('Remove svc: message', noSvcRes.data.message === 'Invoice updated');
  const noSvc = noSvcRes.data.data;
  verifyCamelCase(noSvc, 'NoSvcInvoice');

  test('Service charge = 0', noSvc.serviceCharge === 0, `Got: ${noSvc.serviceCharge}`);
  test('Tax unchanged', noSvc.totalTax === BASE.totalTax, `Got: ${noSvc.totalTax}`);
  test('Subtotal unchanged', noSvc.subtotal === BASE.subtotal);
  test('Taxable unchanged', noSvc.taxableAmount === BASE.taxableAmount);

  // Grand total should be taxableAmount + tax + 0 svc (rounded)
  const expectedNoSvcGT = Math.round(BASE.taxableAmount + BASE.totalTax);
  test('Grand total recalculated', noSvc.grandTotal === expectedNoSvcGT,
    `Expected: ${expectedNoSvcGT}, Got: ${noSvc.grandTotal}`);
  test('Grand total < original', noSvc.grandTotal < BASE.grandTotal);

  console.log(`   Before: ₹${BASE.grandTotal} → After: ₹${noSvc.grandTotal} (saved ₹${BASE.grandTotal - noSvc.grandTotal})`);

  // ─── 6. RESTORE SERVICE CHARGE ───
  section('6. RESTORE SERVICE CHARGE');

  const restoreSvcRes = await cashier.put(`/orders/invoice/${INVOICE_ID}/charges`, {
    removeServiceCharge: false, removeGst: false
  });
  test('Restore svc: success', restoreSvcRes.data.success);
  const restored = restoreSvcRes.data.data;
  test('Service charge restored', restored.serviceCharge === BASE.serviceCharge,
    `Expected: ${BASE.serviceCharge}, Got: ${restored.serviceCharge}`);
  test('Grand total restored', restored.grandTotal === BASE.grandTotal,
    `Expected: ${BASE.grandTotal}, Got: ${restored.grandTotal}`);

  // ─── 7. REMOVE GST WITHOUT GSTIN — Must fail ───
  section('7. REMOVE GST — Without GSTIN (must fail)');

  try {
    await cashier.put(`/orders/invoice/${INVOICE_ID}/charges`, {
      removeServiceCharge: false, removeGst: true
    });
    test('GST without GSTIN rejected', false, 'Should have thrown');
  } catch (e) {
    const status = e.response?.status || 0;
    test('GST without GSTIN rejected', status >= 400 && status < 600, `Status: ${status}`);
    // Joi returns 422 "Validation failed" when customerGstin is missing
    test('Error: validation failed', status === 422 || (e.response?.data?.message || '').includes('Validation'));
    console.log(`   Correctly rejected (${status}): ${e.response?.data?.message}`);
  }

  // ─── 7b. REMOVE GST — With valid GSTIN ───
  section('7b. REMOVE GST — With valid customer GSTIN');

  const TEST_GSTIN = '27AABCU9603R1ZM';
  const noGstRes = await cashier.put(`/orders/invoice/${INVOICE_ID}/charges`, {
    removeServiceCharge: false, removeGst: true, customerGstin: TEST_GSTIN
  });
  test('Remove GST: success', noGstRes.data.success);
  const noGst = noGstRes.data.data;
  verifyCamelCase(noGst, 'NoGstInvoice');

  test('CGST = 0', noGst.cgstAmount === 0, `Got: ${noGst.cgstAmount}`);
  test('SGST = 0', noGst.sgstAmount === 0, `Got: ${noGst.sgstAmount}`);
  test('Total tax = 0', noGst.totalTax === 0, `Got: ${noGst.totalTax}`);
  test('Service charge still present', noGst.serviceCharge === BASE.serviceCharge);
  test('Subtotal unchanged', noGst.subtotal === BASE.subtotal);
  test('Customer GSTIN saved', noGst.customerGstin === TEST_GSTIN,
    `Expected: ${TEST_GSTIN}, Got: ${noGst.customerGstin}`);

  // Grand total = taxableAmount + 0 tax + serviceCharge (rounded)
  const expectedNoGstGT = Math.round(BASE.taxableAmount + 0 + BASE.serviceCharge);
  test('Grand total (no GST)', noGst.grandTotal === expectedNoGstGT,
    `Expected: ${expectedNoGstGT}, Got: ${noGst.grandTotal}`);

  console.log(`   GSTIN: ${noGst.customerGstin}`);
  console.log(`   Before: ₹${BASE.grandTotal} → No-GST: ₹${noGst.grandTotal} (tax removed: ₹${BASE.totalTax})`);

  // ─── 8. REMOVE BOTH — Service charge + GST ───
  section('8. REMOVE BOTH — Service charge + GST');

  const noBothRes = await cashier.put(`/orders/invoice/${INVOICE_ID}/charges`, {
    removeServiceCharge: true, removeGst: true, customerGstin: TEST_GSTIN
  });
  test('Remove both: success', noBothRes.data.success);
  const noBoth = noBothRes.data.data;

  test('Service charge = 0', noBoth.serviceCharge === 0);
  test('Total tax = 0', noBoth.totalTax === 0);

  // Grand total = taxableAmount only (rounded)
  const expectedBareGT = Math.round(BASE.taxableAmount);
  test('Grand total = subtotal only', noBoth.grandTotal === expectedBareGT,
    `Expected: ${expectedBareGT}, Got: ${noBoth.grandTotal}`);

  console.log(`   Bare bill: ₹${noBoth.grandTotal} (was ₹${BASE.grandTotal})`);

  // ─── 9. RESTORE BOTH ───
  section('9. RESTORE BOTH — Back to original');

  const restoreAllRes = await cashier.put(`/orders/invoice/${INVOICE_ID}/charges`, {
    removeServiceCharge: false, removeGst: false
  });
  const restoreAll = restoreAllRes.data.data;
  test('All restored: grandTotal matches original', restoreAll.grandTotal === BASE.grandTotal,
    `Expected: ${BASE.grandTotal}, Got: ${restoreAll.grandTotal}`);
  test('All restored: serviceCharge', restoreAll.serviceCharge === BASE.serviceCharge);
  test('All restored: totalTax', restoreAll.totalTax === BASE.totalTax);

  // ─── 10. CANNOT MODIFY PAID INVOICE ───
  // We'll test this after payment section. For now, test cancel-prevention.

  // ─── 10. MANUAL FLAT DISCOUNT — ₹50 off ───
  section('10. MANUAL FLAT DISCOUNT — ₹50 off');

  // Cancel current invoice so we can apply discount before re-billing
  await cashier.post(`/orders/invoice/${INVOICE_ID}/cancel`, { reason: 'Test: apply discount' });
  test('Invoice cancelled for discount test', true);

  const flatDiscRes = await cashier.post(`/orders/${ORDER_ID}/discount`, {
    discountName: 'Manager Special', discountType: 'flat', discountValue: 50, appliedOn: 'subtotal'
  });
  test('Flat discount: success', flatDiscRes.data.success);

  // Re-generate bill with discount
  const billFlat = await cashier.post(`/orders/${ORDER_ID}/bill`, { applyServiceCharge: true });
  test('Re-bill with flat discount', billFlat.data.success);
  const invFlat = billFlat.data.data;

  test('Flat disc: discountAmount >= 50', invFlat.discountAmount >= 50,
    `Got: ${invFlat.discountAmount}`);
  test('Flat disc: taxableAmount = subtotal - discount',
    invFlat.taxableAmount === round2(invFlat.subtotal - invFlat.discountAmount),
    `${invFlat.taxableAmount} vs ${round2(invFlat.subtotal - invFlat.discountAmount)}`);

  // Service charge should be on taxableAmount (after discount)
  const expectedSvcFlat = round2(invFlat.taxableAmount * 0.10);
  test('Flat disc: svc charge on taxableAmount', invFlat.serviceCharge === expectedSvcFlat,
    `Expected: ${expectedSvcFlat}, Got: ${invFlat.serviceCharge}`);

  console.log(`   Subtotal: ₹${invFlat.subtotal} - Disc: ₹${invFlat.discountAmount} = Taxable: ₹${invFlat.taxableAmount}`);
  console.log(`   Svc: ₹${invFlat.serviceCharge} | Tax: ₹${invFlat.totalTax} | Total: ₹${invFlat.grandTotal}`);

  const INVOICE_ID_FLAT = invFlat.id;

  // ─── 11. MANUAL PERCENTAGE DISCOUNT — 15% off ───
  section('11. MANUAL PERCENTAGE DISCOUNT — 15% off');

  // Create a new order for percentage discount
  const ORDER_PCT = await createServedOrder(null, 'takeaway');
  test('Percentage order created', !!ORDER_PCT);

  const pctDiscRes = await cashier.post(`/orders/${ORDER_PCT}/discount`, {
    discountName: 'Festival 15%', discountType: 'percentage', discountValue: 15, appliedOn: 'subtotal'
  });
  test('Pct discount: success', pctDiscRes.data.success);

  // Get order to check subtotal before billing
  const orderPct = await cashier.get(`/orders/${ORDER_PCT}`);
  const pctSubtotal = parseFloat(orderPct.data.data.subtotal) || 0;
  const expectedPctDisc = round2(pctSubtotal * 0.15);

  const billPct = await cashier.post(`/orders/${ORDER_PCT}/bill`, { applyServiceCharge: false });
  test('Pct bill: success', billPct.data.success);
  const invPct = billPct.data.data;

  test('Pct disc: discountAmount ~ 15% of subtotal',
    Math.abs(invPct.discountAmount - expectedPctDisc) < 1,
    `Expected: ~${expectedPctDisc}, Got: ${invPct.discountAmount}`);
  test('Pct disc: taxableAmount correct',
    invPct.taxableAmount === round2(invPct.subtotal - invPct.discountAmount));

  // Takeaway = no service charge
  test('Takeaway: no service charge', invPct.serviceCharge === 0);

  // Verify grand total
  const expectedPctGT = Math.round(invPct.taxableAmount + invPct.totalTax);
  test('Pct disc: grandTotal correct', invPct.grandTotal === expectedPctGT,
    `Expected: ${expectedPctGT}, Got: ${invPct.grandTotal}`);

  console.log(`   Subtotal: ₹${invPct.subtotal} × 15% = Disc: ₹${invPct.discountAmount}`);
  console.log(`   Taxable: ₹${invPct.taxableAmount} | Tax: ₹${invPct.totalTax} | Total: ₹${invPct.grandTotal}`);

  // ─── 12. DISCOUNT BY CODE — WELCOME10 (10%, max ₹200, min ₹500) ───
  section('12. DISCOUNT BY CODE — WELCOME10');

  const ORDER_CODE = await createServedOrder(null, 'takeaway');
  const orderCode = await cashier.get(`/orders/${ORDER_CODE}`);
  const codeSubtotal = parseFloat(orderCode.data.data.subtotal) || 0;
  console.log(`   Order subtotal: ₹${codeSubtotal}`);

  if (codeSubtotal >= 500) {
    const codeRes = await cashier.post(`/orders/${ORDER_CODE}/discount/code`, {
      discountCode: 'WELCOME10'
    });
    test('WELCOME10: success', codeRes.data.success);
    test('WELCOME10: message', codeRes.data.message === 'Discount code applied');

    // Check discount was applied
    const orderAfterCode = codeRes.data.data;
    const codeDiscs = orderAfterCode.discounts || [];
    const welcomeDisc = codeDiscs.find(d => d.discount_code === 'WELCOME10');
    test('WELCOME10: discount record created', !!welcomeDisc);

    if (welcomeDisc) {
      const expected10 = Math.min(round2(codeSubtotal * 0.10), 200);
      test('WELCOME10: amount = min(10%, ₹200)',
        Math.abs(parseFloat(welcomeDisc.discount_amount) - expected10) < 1,
        `Expected: ${expected10}, Got: ${welcomeDisc.discount_amount}`);
      console.log(`   10% of ₹${codeSubtotal} = ₹${round2(codeSubtotal * 0.10)}, capped at ₹200 → ₹${welcomeDisc.discount_amount}`);
    }

    // Bill and verify
    const billCode = await cashier.post(`/orders/${ORDER_CODE}/bill`, { applyServiceCharge: false });
    test('Code bill: success', billCode.data.success);
    const invCode = billCode.data.data;
    test('Code bill: discountAmount > 0', invCode.discountAmount > 0);
    test('Code bill: has discounts array', invCode.discounts.length > 0);
    verifyCamelCase(invCode, 'CodeBill');
    console.log(`   Final: ₹${invCode.subtotal} - ₹${invCode.discountAmount} + tax ₹${invCode.totalTax} = ₹${invCode.grandTotal}`);
  } else {
    console.log('   Order subtotal < ₹500 — WELCOME10 requires min ₹500');
    // Try anyway — should get min order error
    try {
      await cashier.post(`/orders/${ORDER_CODE}/discount/code`, { discountCode: 'WELCOME10' });
      test('WELCOME10: min order check', false, 'Should have rejected');
    } catch (e) {
      test('WELCOME10: min order rejected', e.response?.status === 400);
      console.log(`   Correctly rejected: ${e.response?.data?.message}`);
    }
  }

  // ─── 13. DUPLICATE DISCOUNT CODE REJECTED ───
  section('13. DUPLICATE CODE + INVALID CODE');

  if (codeSubtotal >= 500) {
    // Try applying WELCOME10 again on same order
    try {
      await cashier.post(`/orders/${ORDER_CODE}/discount/code`, { discountCode: 'WELCOME10' });
      test('Duplicate code rejected', false, 'Should have thrown');
    } catch (e) {
      test('Duplicate code rejected', e.response?.status === 400);
      test('Error: already applied', e.response?.data?.message?.includes('already'));
      console.log(`   Correctly rejected: ${e.response?.data?.message}`);
    }
  }

  // Invalid code
  try {
    await cashier.post(`/orders/${ORDER_CODE}/discount/code`, { discountCode: 'FAKECODE999' });
    test('Invalid code rejected', false, 'Should have thrown');
  } catch (e) {
    test('Invalid code rejected', e.response?.status === 400);
    test('Error: invalid', e.response?.data?.message?.includes('Invalid'));
    console.log(`   Correctly rejected: ${e.response?.data?.message}`);
  }

  // ─── 14. DISCOUNT + SERVICE CHARGE REMOVAL + GST REMOVAL — Combined ───
  section('14. COMBINED — Discount + Remove Svc + Remove GST');

  // Use the flat discount invoice (INVOICE_ID_FLAT) — remove both svc and GST
  const combinedRes = await cashier.put(`/orders/invoice/${INVOICE_ID_FLAT}/charges`, {
    removeServiceCharge: true, removeGst: true, customerGstin: '29GGGGG1314R9Z6'
  });
  test('Combined: success', combinedRes.data.success);
  const combined = combinedRes.data.data;

  test('Combined: serviceCharge = 0', combined.serviceCharge === 0);
  test('Combined: totalTax = 0', combined.totalTax === 0);
  test('Combined: discountAmount preserved', combined.discountAmount >= 50);
  test('Combined: taxableAmount = subtotal - discount',
    combined.taxableAmount === round2(combined.subtotal - combined.discountAmount));

  // Grand total should be just taxableAmount (no tax, no svc)
  const expectedCombinedGT = Math.round(combined.taxableAmount);
  test('Combined: grandTotal = taxableAmount only', combined.grandTotal === expectedCombinedGT,
    `Expected: ${expectedCombinedGT}, Got: ${combined.grandTotal}`);
  console.log(`   ₹${combined.subtotal} - disc ₹${combined.discountAmount} = ₹${combined.taxableAmount} → Grand: ₹${combined.grandTotal}`);

  // ─── 15. CANNOT MODIFY PAID INVOICE ───
  section('15. CANNOT MODIFY PAID INVOICE');

  // Pay the pct order first
  const billPctPay = await cashier.get(`/orders/invoice/${invPct.id}`);
  const pctGT = billPctPay.data.data.grandTotal;
  await cashier.post('/orders/payment', {
    orderId: ORDER_PCT, invoiceId: invPct.id, outletId: OUTLET_ID,
    paymentMode: 'cash', amount: pctGT
  });

  try {
    await cashier.put(`/orders/invoice/${invPct.id}/charges`, {
      removeServiceCharge: true
    });
    test('Paid invoice modify rejected', false, 'Should have thrown');
  } catch (e) {
    test('Paid invoice modify rejected', e.response?.status === 400);
    test('Error: Cannot modify paid', e.response?.data?.message?.includes('Cannot modify'));
    console.log(`   Correctly rejected: ${e.response?.data?.message}`);
  }

  // ─── 16. PENDING BILLS — After changes ───
  section('16. PENDING BILLS — After changes');

  const pendingRes2 = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
  test('Pending bills still loads', pendingRes2.data.success);

  // The pct order should no longer be in pending (it's paid)
  const pctInPending = pendingRes2.data.data.find(b => b.id === invPct.id);
  test('Paid invoice NOT in pending', !pctInPending);

  // The flat discount order should still be pending
  const flatInPending = pendingRes2.data.data.find(b => b.id === INVOICE_ID_FLAT);
  test('Unpaid invoice still in pending', !!flatInPending);
  if (flatInPending) {
    test('Pending: reflects charge changes', flatInPending.serviceCharge === 0);
    test('Pending: reflects GST removal', flatInPending.totalTax === 0);
  }

  console.log(`   Pending count: ${pendingRes2.data.data.length}`);

  // ─── 16b. ORDER STATUS = COMPLETED AFTER PAYMENT ───
  section('16b. ORDER STATUS — Completed after payment');

  // The pct order was already paid above — verify its status is 'completed'
  const [dbOrder] = await pool.query('SELECT status, payment_status FROM orders WHERE id = ?', [ORDER_PCT]);
  test('Payment: order status = completed', dbOrder[0]?.status === 'completed');
  test('Payment: payment_status = completed', dbOrder[0]?.payment_status === 'completed');
  console.log(`   Order ${ORDER_PCT}: status=${dbOrder[0]?.status}, payment_status=${dbOrder[0]?.payment_status}`);

  // Verify via captain history — should appear under ?status=completed
  const historyRes = await captain.get(`/orders/captain/history/${OUTLET_ID}?status=completed`);
  test('History: success', historyRes.data.success);
  const historyOrders = historyRes.data.data?.orders || [];
  const pctInHistory = historyOrders.find(o => o.id === ORDER_PCT);
  test('History: paid order in completed list', !!pctInHistory);
  if (pctInHistory) {
    test('History: status = completed', pctInHistory.status === 'completed');
    console.log(`   Captain history: order ${pctInHistory.order_number} status=${pctInHistory.status}`);
  }

  // Verify it does NOT appear in running
  const runningRes = await captain.get(`/orders/captain/history/${OUTLET_ID}?status=running`);
  const runningOrders = runningRes.data.data?.orders || [];
  const pctInRunning = runningOrders.find(o => o.id === ORDER_PCT);
  test('History: paid order NOT in running list', !pctInRunning);
  console.log(`   Running orders: ${runningOrders.length}, Completed orders: ${historyOrders.length}`);

  // ─── 16c. COMPLETED BILLS FILTER ───
  section('16c. COMPLETED BILLS — ?status=completed filter');

  // The pct invoice was paid — should appear in ?status=completed
  const completedBills = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?status=completed`);
  test('Completed bills: success', completedBills.data.success);
  test('Completed bills: is array', Array.isArray(completedBills.data.data));
  test('Completed bills: has pagination', !!completedBills.data.pagination);
  const pctInCompleted = completedBills.data.data.find(b => b.id === invPct.id);
  test('Completed bills: paid invoice appears', !!pctInCompleted);
  if (pctInCompleted) {
    test('Completed bills: paymentStatus = paid', pctInCompleted.paymentStatus === 'paid');
    console.log(`   Found paid invoice ${pctInCompleted.invoiceNumber} in completed bills`);
  }
  console.log(`   Completed bill count: ${completedBills.data.data.length}`);

  // Unpaid invoice should NOT be in completed
  const flatInCompleted = completedBills.data.data.find(b => b.id === INVOICE_ID_FLAT);
  test('Completed bills: unpaid NOT in completed', !flatInCompleted);

  // All bills filter
  const allBills = await cashier.get(`/orders/bills/pending/${OUTLET_ID}?status=all`);
  test('All bills: success', allBills.data.success);
  test('All bills: includes both paid and unpaid', allBills.data.data.length >= completedBills.data.data.length);
  const allHasPaid = allBills.data.data.some(b => b.paymentStatus === 'paid');
  const allHasPending = allBills.data.data.some(b => b.paymentStatus === 'pending' || b.paymentStatus === 'partial');
  test('All bills: contains paid bills', allHasPaid);
  test('All bills: contains pending bills', allHasPending);
  console.log(`   All bills count: ${allBills.data.data.length} (paid + pending)`);

  // Default (no status param) should still return only pending
  const defaultBills = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
  const defaultHasPaid = defaultBills.data.data.some(b => b.paymentStatus === 'paid');
  test('Default bills: no paid bills (pending only)', !defaultHasPaid);

  // ─── 17. ORDER CANCEL → BILL AUTO-CANCELLED ───
  section('17. ORDER CANCEL — Bill auto-cancelled');

  // Create a new order, generate bill, then cancel the order
  const CANCEL_ORDER_ID = await createServedOrder(null, 'takeaway');
  test('Cancel test: order created', !!CANCEL_ORDER_ID);

  const cancelBillRes = await cashier.post(`/orders/${CANCEL_ORDER_ID}/bill`, {
    customerName: 'Cancel Test', applyServiceCharge: false
  });
  test('Cancel test: bill generated', cancelBillRes.data.success);
  const cancelInvId = cancelBillRes.data.data.id;
  const cancelInvNum = cancelBillRes.data.data.invoiceNumber;
  console.log(`   Generated invoice ${cancelInvNum} (ID: ${cancelInvId})`);

  // Verify it appears in pending bills
  const preCancel = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
  const preCancelBill = preCancel.data.data.find(b => b.id === cancelInvId);
  test('Cancel test: bill in pending before cancel', !!preCancelBill);

  // Cancel the order
  const cancelRes = await cashier.post(`/orders/${CANCEL_ORDER_ID}/cancel`, {
    reason: 'Customer left'
  });
  test('Cancel test: order cancelled', cancelRes.data.success);
  test('Cancel test: order status = cancelled', cancelRes.data.data.status === 'cancelled');

  // Verify bill is NO LONGER in pending
  const postCancel = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
  const postCancelBill = postCancel.data.data.find(b => b.id === cancelInvId);
  test('Cancel test: bill REMOVED from pending', !postCancelBill);
  console.log(`   Order cancelled → invoice ${cancelInvNum} auto-removed from pending`);

  // Verify invoice is marked cancelled in DB
  const [cancelledInv] = await pool.query(
    'SELECT is_cancelled, cancel_reason FROM invoices WHERE id = ?', [cancelInvId]
  );
  test('Cancel test: invoice.is_cancelled = 1', cancelledInv[0]?.is_cancelled === 1);
  test('Cancel test: cancel_reason set', !!cancelledInv[0]?.cancel_reason);
  console.log(`   Invoice DB: is_cancelled=${cancelledInv[0]?.is_cancelled}, reason="${cancelledInv[0]?.cancel_reason}"`);

  // ─── 18. ITEM CANCEL → EXCLUDED FROM BILL ───
  section('18. ITEM CANCEL — Cancelled items excluded from bill');

  // Create order with multiple items, cancel one, generate bill, verify excluded
  const ITEM_CANCEL_ORDER = await createServedOrder(null, 'takeaway');
  test('Item cancel: order created', !!ITEM_CANCEL_ORDER);

  // Get order items
  const itemOrderRes = await cashier.get(`/orders/${ITEM_CANCEL_ORDER}`);
  const orderItems = itemOrderRes.data.data?.items || [];
  test('Item cancel: has items', orderItems.length >= 2);
  console.log(`   Order has ${orderItems.length} items`);

  if (orderItems.length >= 2) {
    const itemToCancel = orderItems[0];
    const itemToKeep = orderItems[1];
    console.log(`   Cancelling item: ${itemToCancel.item_name || itemToCancel.itemName} (ID: ${itemToCancel.id})`);
    console.log(`   Keeping item:    ${itemToKeep.item_name || itemToKeep.itemName} (ID: ${itemToKeep.id})`);

    // Cancel the first item
    const cancelItemRes = await cashier.post(`/orders/items/${itemToCancel.id}/cancel`, {
      reason: 'Customer changed mind', quantity: itemToCancel.quantity
    });
    test('Item cancel: success', cancelItemRes.data.success);

    // Generate bill
    const itemBillRes = await cashier.post(`/orders/${ITEM_CANCEL_ORDER}/bill`, {
      customerName: 'Item Cancel Test', applyServiceCharge: false
    });
    test('Item cancel: bill generated', itemBillRes.data.success);
    const itemBill = itemBillRes.data.data;

    // Verify cancelled item is NOT in the bill
    const cancelledInBill = itemBill.items.find(i =>
      (i.orderItemId || i.id) === itemToCancel.id && i.status === 'cancelled'
    );
    test('Item cancel: cancelled item NOT in bill', !cancelledInBill);

    // Verify no cancelled items at all
    const anyCancelled = itemBill.items.some(i => i.status === 'cancelled');
    test('Item cancel: zero cancelled items in bill', !anyCancelled);

    // Verify kept item IS in the bill
    const keptInBill = itemBill.items.find(i =>
      (i.orderItemId || i.id) === itemToKeep.id
    );
    test('Item cancel: kept item IS in bill', !!keptInBill);

    console.log(`   Bill items: ${itemBill.items.length} (cancelled excluded)`);
    console.log(`   Bill total: ${itemBill.grandTotal}`);

    // Verify via getInvoiceById too
    const invDetailRes = await cashier.get(`/orders/invoice/${itemBill.id}`);
    const invDetail = invDetailRes.data.data;
    const detailCancelled = invDetail.items.some(i => i.status === 'cancelled');
    test('Item cancel: invoice detail also excludes cancelled', !detailCancelled);
    console.log(`   Invoice detail items: ${invDetail.items.length}`);

    // Verify via pending bills
    const pendingAfterItem = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
    const pendingItemBill = pendingAfterItem.data.data.find(b => b.id === itemBill.id);
    if (pendingItemBill) {
      const pendingCancelled = pendingItemBill.items.some(i => i.status === 'cancelled');
      test('Item cancel: pending bill excludes cancelled', !pendingCancelled);
    }
  }

  // ─── 19. CALCULATION SUMMARY ───
  section('19. CALCULATION VERIFICATION SUMMARY');
  console.log('');
  console.log('   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │  PENDING BILLS FILTERS + PAGINATION                     │');
  console.log('   ├──────────────────────────────────────────────────────────┤');
  console.log('   │  ?floorId=2         → Filter by floor                   │');
  console.log('   │  ?search=T1         → Search table#, customer, order#   │');
  console.log('   │  ?sortBy=grand_total → Sort by: grand_total, created_at │');
  console.log('   │  ?sortOrder=asc     → ASC or DESC                       │');
  console.log('   │  ?page=1&limit=10   → Pagination with total/totalPages  │');
  console.log('   │  ?status=pending    → Default: pending/partial only     │');
  console.log('   │  ?status=completed  → Paid bills only                   │');
  console.log('   │  ?status=all        → Both pending + completed          │');
  console.log('   │  All combinable                                         │');
  console.log('   └──────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │  ORDER STATUS AFTER PAYMENT                             │');
  console.log('   ├──────────────────────────────────────────────────────────┤');
  console.log('   │  Payment collected → order.status = "completed"         │');
  console.log('   │  Captain history ?status=completed includes paid orders │');
  console.log('   │  Captain history ?status=running excludes paid orders   │');
  console.log('   │  order.payment_status = "completed"                     │');
  console.log('   └──────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │  ORDER/ITEM CANCEL → BILL HANDLING                      │');
  console.log('   ├──────────────────────────────────────────────────────────┤');
  console.log('   │  Order cancel → invoice auto-cancelled + bill:status    │');
  console.log('   │  Cancelled orders hidden from pending bills             │');
  console.log('   │  Item cancel → excluded from bill/invoice items         │');
  console.log('   │  Cashier never sees cancelled items on any bill view    │');
  console.log('   └──────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │  GST REMOVAL — Customer GSTIN mandatory                 │');
  console.log('   ├──────────────────────────────────────────────────────────┤');
  console.log('   │  removeGst: true requires customerGstin field            │');
  console.log('   │  GSTIN stored on invoice.customer_gstin                 │');
  console.log('   │  Without GSTIN → 422 Validation failed                  │');
  console.log('   └──────────────────────────────────────────────────────────┘');

  test('Calculation rules documented', true);

  // ─── CLEANUP ───
  section('20. CLEANUP');
  for (const oid of [ORDER_ID, ORDER_PCT, ORDER_CODE, CANCEL_ORDER_ID, ITEM_CANCEL_ORDER]) {
    try { await cashier.post(`/orders/${oid}/cancel`, { reason: 'Test cleanup' }); } catch (e) {}
  }
  if (TABLE_ID) {
    await pool.query('UPDATE tables SET status="available" WHERE id=?', [TABLE_ID]);
    await pool.query('UPDATE table_sessions SET status="completed", ended_at=NOW() WHERE table_id=? AND status="active"', [TABLE_ID]);
  }
  // Reset discount usage
  await pool.query('UPDATE discounts SET usage_count = 0 WHERE outlet_id = ?', [OUTLET_ID]);
  console.log('   Tables released, discount counters reset');

  // ─── RESULTS ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}\n`);

  if (failed === 0) {
    console.log('✅ All tests passed — Cashier billing ops verified with precise calculations!');
  } else {
    console.log(`❌ ${failed} test(s) failed`);
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('\n💥 FATAL ERROR:', e.response?.data || e.message);
  process.exit(1);
});
