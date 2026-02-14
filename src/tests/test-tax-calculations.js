/**
 * Test Tax Calculation Fix — Verify tax amounts, service charge, grandTotal
 * Bug: componentCode/componentName fields not mapped → totalTax=0 → tax missing from grandTotal
 * Fix: Use componentCode||code||componentName||name for tax categorization
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

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  TAX CALCULATION VERIFICATION TEST                        ║');
  console.log('║  Verify: componentCode mapping, totalTax, grandTotal      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const cashierLogin = await axios.post(`${API}/auth/login`, {
    email: 'admin@restropos.com', password: 'admin123'
  });
  const TOKEN = cashierLogin.data.data.accessToken;
  const cashier = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${TOKEN}` } });

  const captainLogin = await axios.post(`${API}/auth/login`, {
    email: 'captainall@gmail.com', password: 'Captain@123'
  });
  const captain = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${captainLogin.data.data.accessToken}` } });

  const { initializeDatabase, getPool } = require('../database');
  await initializeDatabase();
  const pool = getPool();

  // Clean stale
  await pool.query(
    `UPDATE orders SET status='cancelled', cancelled_at=NOW()
     WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]
  );
  await pool.query(
    `UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL
     WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]
  );
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);

  // Get available table
  const tablesRes = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes.data.data.filter(t => t.status === 'available');
  const TABLE_ID = availTables[0]?.id;

  // Get menu items
  const menuRes = await captain.get(`/menu/${OUTLET_ID}/captain`);
  const menuItems = [];
  for (const cat of (menuRes.data.data?.menu || [])) {
    for (const item of (cat.items || [])) {
      if (!item.variants && menuItems.length < 5) menuItems.push(item);
    }
  }

  // Find items that have tax by checking recent order_items tax_details
  const [itemTaxes] = await pool.query(`
    SELECT i.id, i.name, i.base_price as price, tg.name as tax_group, tg.total_rate
    FROM items i
    LEFT JOIN tax_groups tg ON i.tax_group_id = tg.id
    WHERE i.outlet_id = ? AND i.is_active = 1 AND tg.id IS NOT NULL
    LIMIT 10
  `, [OUTLET_ID]);

  section('1. TAX CONFIGURATION');
  console.log(`   Items with tax groups: ${itemTaxes.length}`);
  for (const it of itemTaxes.slice(0, 5)) {
    console.log(`   - ${it.name}: ₹${it.price} | ${it.tax_group} (${it.total_rate}%)`);
  }

  // Service charge config
  const [scConfig] = await pool.query('SELECT * FROM service_charges WHERE outlet_id = ? AND is_active = 1', [OUTLET_ID]);
  test('Service charge configured', scConfig.length > 0);
  if (scConfig[0]) {
    console.log(`   Service charge: ${scConfig[0].rate}% ${scConfig[0].is_percentage ? '(percentage)' : '(flat)'} on ${scConfig[0].apply_on}`);
  }

  // Helper: create served order with specific items
  async function createServedOrder(tableId, itemIds) {
    if (tableId) {
      await pool.query(`UPDATE orders SET status='cancelled', cancelled_at=NOW() WHERE table_id=? AND status NOT IN ('paid','cancelled','completed')`, [tableId]);
      await pool.query('UPDATE table_sessions SET status="completed", ended_at=NOW(), order_id=NULL WHERE table_id=? AND status="active"', [tableId]);
      await pool.query('UPDATE tables SET status="available" WHERE id=?', [tableId]);
    }
    const payload = { outletId: OUTLET_ID, orderType: 'dine_in', guestCount: 2 };
    if (tableId) payload.tableId = tableId;
    const orderRes = await captain.post('/orders', payload);
    const orderId = orderRes.data.data.id;
    await captain.post(`/orders/${orderId}/items`, { items: itemIds.map(id => ({ itemId: id, quantity: 1 })) });
    const kotRes = await captain.post(`/orders/${orderId}/kot`);
    for (const t of (kotRes.data.data?.tickets || [])) {
      await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
      await captain.post(`/orders/kot/${t.id}/served`).catch(() => {});
    }
    return orderId;
  }

  // ─── 2. SCENARIO A: Single taxed item — verify tax in grandTotal ───
  section('2. SCENARIO A — Taxed item (with service charge)');

  // Pick any item with a tax group
  const taxedItem = itemTaxes[0];
  if (taxedItem) {
    console.log(`   Using: ${taxedItem.name} (₹${taxedItem.price}, ${taxedItem.tax_group} ${taxedItem.total_rate}%)`);
    const orderId = await createServedOrder(TABLE_ID, [taxedItem.id]);
    const billRes = await cashier.post(`/orders/${orderId}/bill`, { applyServiceCharge: true });
    test('Bill generated', billRes.data.success);

    if (billRes.data.success) {
      const inv = billRes.data.data;
      const itemPrice = parseFloat(taxedItem.price);
      const scRate = scConfig[0] ? parseFloat(scConfig[0].rate) : 0;
      const expectedSC = scConfig[0]?.is_percentage ? round2(itemPrice * scRate / 100) : scRate;
      // grandTotal = subtotal + totalTax + serviceCharge (rounded)
      const computedGT = Math.round(inv.subtotal + inv.totalTax + inv.serviceCharge);

      console.log(`   Subtotal: ₹${inv.subtotal}`);
      console.log(`   Tax: ₹${inv.totalTax} (components sum from tax_details)`);
      console.log(`   SC: ₹${inv.serviceCharge} (expected ₹${expectedSC})`);
      console.log(`   GT: ₹${inv.grandTotal} (expected ₹${computedGT})`);
      console.log(`   taxBreakup:`, JSON.stringify(inv.taxBreakup));

      test('Subtotal = item price', inv.subtotal === itemPrice, `${inv.subtotal} vs ${itemPrice}`);
      test('totalTax > 0 (BUG FIX — was 0 before)', inv.totalTax > 0, `totalTax=${inv.totalTax}`);
      test('Service charge correct', inv.serviceCharge === expectedSC, `${inv.serviceCharge} vs ${expectedSC}`);
      test('GrandTotal = sub + tax + SC (rounded)', inv.grandTotal === computedGT, `${inv.grandTotal} vs ${computedGT}`);

      // Verify taxBreakup has proper keys (not just "TAX")
      const tbKeys = Object.keys(inv.taxBreakup || {});
      test('taxBreakup uses componentCode keys (not TAX)', tbKeys.length > 0 && !tbKeys.includes('TAX'),
        `Keys: ${tbKeys.join(', ')}`);

      // Verify taxBreakup entry has name field
      const firstTb = inv.taxBreakup[tbKeys[0]];
      test('taxBreakup entry has name', !!firstTb?.name, firstTb?.name);
      test('taxBreakup entry has rate', firstTb?.rate > 0);
      test('taxBreakup entry has taxAmount', firstTb?.taxAmount > 0);

      // Verify individual category amounts are populated
      const hasVat = tbKeys.some(k => k.toUpperCase().includes('VAT'));
      const hasCgst = tbKeys.some(k => k.toUpperCase().includes('CGST'));
      if (hasVat) test('vatAmount populated', inv.vatAmount > 0, `vatAmount=${inv.vatAmount}`);
      if (hasCgst) test('cgstAmount populated', inv.cgstAmount > 0, `cgstAmount=${inv.cgstAmount}`);

      // Verify in pending bills too
      const pendingRes = await cashier.get(`/orders/bills/pending/${OUTLET_ID}`);
      const pendingBill = pendingRes.data.data.find(b => b.orderId === orderId);
      if (pendingBill) {
        test('Pending bill: totalTax > 0', pendingBill.totalTax > 0, `${pendingBill.totalTax}`);
        test('Pending bill: grandTotal matches', pendingBill.grandTotal === inv.grandTotal, `${pendingBill.grandTotal} vs ${inv.grandTotal}`);
      }
    }
  } else {
    console.log('   No taxed items found — skipping');
  }

  // ─── 3. SCENARIO B: Second taxed item — verify different tax group ───
  section('3. SCENARIO B — Second taxed item (different tax group if available)');

  // Try to find a second item with a different tax group
  const secondItem = itemTaxes.find(i => i.id !== taxedItem?.id && i.tax_group !== taxedItem?.tax_group) || itemTaxes[1];
  if (secondItem && secondItem.id !== taxedItem?.id) {
    const availTables2 = (await captain.get(`/tables/outlet/${OUTLET_ID}`)).data.data.filter(t => t.status === 'available');
    const TABLE_ID2 = availTables2[0]?.id;
    if (!TABLE_ID2) { console.log('   No available table'); } else {
      console.log(`   Using: ${secondItem.name} (₹${secondItem.price}, ${secondItem.tax_group} ${secondItem.total_rate}%)`);

      const orderId = await createServedOrder(TABLE_ID2, [secondItem.id]);
      const billRes = await cashier.post(`/orders/${orderId}/bill`, { applyServiceCharge: true });
      test('Second item bill generated', billRes.data.success);

      if (billRes.data.success) {
        const inv = billRes.data.data;
        const computedGT2 = Math.round(inv.subtotal + inv.totalTax + inv.serviceCharge);

        console.log(`   Subtotal: ₹${inv.subtotal}, Tax: ₹${inv.totalTax}, SC: ₹${inv.serviceCharge}`);
        console.log(`   GT: ₹${inv.grandTotal} (computed: ₹${computedGT2})`);
        console.log(`   taxBreakup:`, JSON.stringify(inv.taxBreakup));

        test('totalTax > 0', inv.totalTax > 0, `totalTax=${inv.totalTax}`);

        // Verify taxBreakup keys match actual component codes
        const tbKeys = Object.keys(inv.taxBreakup || {});
        test('taxBreakup not just TAX', !tbKeys.includes('TAX'), `Keys: ${tbKeys.join(', ')}`);

        // grandTotal = subtotal + totalTax + serviceCharge (rounded)
        test('GrandTotal = sub + tax + SC', inv.grandTotal === computedGT2, `${inv.grandTotal} vs ${computedGT2}`);
      }
    }
  } else {
    console.log('   Only one tax group found — skipping');
  }

  // ─── 4. SCENARIO C: Bill without service charge ───
  section('4. SCENARIO C — No service charge (applyServiceCharge=false)');

  if (taxedItem) {
    const availTables3 = (await captain.get(`/tables/outlet/${OUTLET_ID}`)).data.data.filter(t => t.status === 'available');
    const TABLE_ID3 = availTables3[0]?.id;
    if (!TABLE_ID3) { console.log('   No available table'); } else {
      const orderId = await createServedOrder(TABLE_ID3, [taxedItem.id]);
      const billRes = await cashier.post(`/orders/${orderId}/bill`, { applyServiceCharge: false });
      test('No-SC bill generated', billRes.data.success);

      if (billRes.data.success) {
        const inv = billRes.data.data;
        const noScGT = Math.round(inv.subtotal + inv.totalTax);

        console.log(`   Subtotal: ₹${inv.subtotal}, Tax: ₹${inv.totalTax}, SC: ₹${inv.serviceCharge}, GT: ₹${inv.grandTotal}`);

        test('Service charge = 0', inv.serviceCharge === 0);
        test('Tax still applied (> 0)', inv.totalTax > 0, `totalTax=${inv.totalTax}`);
        test('GrandTotal = sub + tax (no SC)', inv.grandTotal === noScGT, `${inv.grandTotal} vs ${noScGT}`);
      }
    }
  }

  // ─── 5. CLEANUP ───
  section('5. CLEANUP');
  await pool.query(`UPDATE orders SET status='cancelled', cancelled_at=NOW() WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]);
  await pool.query(`UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]);
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);
  console.log('   Cleanup done');

  // ─── SUMMARY ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);

  console.log(`\n  SERVICE CHARGE CALCULATION:`);
  if (scConfig[0]) {
    console.log(`     Rate: ${scConfig[0].rate}%`);
    console.log(`     Type: ${scConfig[0].is_percentage ? 'Percentage of taxableAmount' : 'Flat amount'}`);
    console.log(`     Applied on: ${scConfig[0].apply_on}`);
    console.log(`     Formula: serviceCharge = taxableAmount × ${scConfig[0].rate} / 100`);
    console.log(`     (taxableAmount = subtotal - discountAmount)`);
    console.log(`     Only for dine_in orders when applyServiceCharge=true`);
  }

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tax calculation tests passed!');
    process.exit(0);
  }
})();
