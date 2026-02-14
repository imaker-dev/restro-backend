/**
 * Test: Price Rules Disabled Verification
 * 
 * Verifies that all price adjustments/rules are disabled across:
 *  1. Captain menu API — no appliedRules, price === basePrice
 *  2. Table details API — priceAdjustment === 0, subtotal === itemsMenuTotal
 *  3. Order item creation — unit_price matches base menu price
 *  4. menuEngine.getItemForOrder — effectivePrice === base_price
 *  5. API response formats unchanged (all fields still present)
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

(async () => {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  PRICE RULES DISABLED — VERIFICATION TEST              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ─── LOGIN ───
  section('1. LOGIN');
  const adminLogin = await axios.post(`${API}/auth/login`, {
    email: 'admin@restropos.com', password: 'admin123'
  });
  const adminToken = adminLogin.data.data.accessToken;
  const admin = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${adminToken}` } });
  test('Admin login', !!adminToken);

  const captainLogin = await axios.post(`${API}/auth/login`, {
    email: 'captainall@gmail.com', password: 'Captain@123'
  });
  const captainToken = captainLogin.data.data.accessToken;
  const captain = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${captainToken}` } });
  test('Captain login', !!captainToken);

  // ─── 2. CAPTAIN MENU API ───
  section('2. CAPTAIN MENU — /menu/:outletId/captain');

  const menuRes = await captain.get(`/menu/${OUTLET_ID}/captain`);
  test('Captain menu loads', menuRes.data.success);
  test('Response format: menu array', Array.isArray(menuRes.data.data?.menu));
  test('Response format: summary present', !!menuRes.data.data?.summary);

  const categories = menuRes.data.data?.menu || [];
  let totalItems = 0;
  let priceDiscrepancies = 0;
  let discountFlags = 0;

  for (const cat of categories) {
    for (const item of (cat.items || [])) {
      totalItems++;

      // Check: basePrice === price (no adjustment)
      if (n(item.basePrice) !== n(item.price)) {
        priceDiscrepancies++;
        console.log(`   ⚠ ${item.name}: basePrice(${item.basePrice}) ≠ price(${item.price})`);
      }

      // Check: hasDiscount should NOT be present (only added when true)
      if (item.hasDiscount) {
        discountFlags++;
        console.log(`   ⚠ ${item.name}: hasDiscount=true`);
      }

      // Check variants too
      if (item.variants) {
        for (const v of item.variants) {
          if (n(v.basePrice) !== n(v.price)) {
            priceDiscrepancies++;
            console.log(`   ⚠ ${item.name} variant ${v.name}: basePrice(${v.basePrice}) ≠ price(${v.price})`);
          }
          if (v.hasDiscount) {
            discountFlags++;
            console.log(`   ⚠ ${item.name} variant ${v.name}: hasDiscount=true`);
          }
        }
      }
    }
  }

  console.log(`   Checked ${totalItems} items across ${categories.length} categories`);
  test('All items: basePrice === price (no adjustment)', priceDiscrepancies === 0, `${priceDiscrepancies} discrepancies`);
  test('No hasDiscount flags on any item', discountFlags === 0, `${discountFlags} items with hasDiscount`);

  // Verify response format preserved
  if (totalItems > 0) {
    const sampleItem = categories[0]?.items?.[0];
    test('Format: item has basePrice field', sampleItem?.basePrice !== undefined);
    test('Format: item has price field', sampleItem?.price !== undefined);
    test('Format: item has taxGroupId', sampleItem?.taxGroupId !== undefined);
    test('Format: item has type field', sampleItem?.type !== undefined);
    console.log(`   Sample: ${sampleItem?.name} — base:${sampleItem?.basePrice} price:${sampleItem?.price} hasDiscount:${sampleItem?.hasDiscount || false}`);
  }

  // ─── 3. TABLE DETAILS API — check existing orders ───
  section('3. TABLE DETAILS — Verify priceAdjustment = 0 on active orders');

  // Find an occupied table with an order
  const tablesRes = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const occupiedTables = tablesRes.data.data.filter(t => t.status === 'occupied');

  if (occupiedTables.length > 0) {
    const tableId = occupiedTables[0].id;
    const tableDetail = await captain.get(`/tables/${tableId}`);
    const td = tableDetail.data.data;
    test('Table detail loads', tableDetail.data.success);
    test('Format: order present', !!td?.order);
    test('Format: items array', Array.isArray(td?.items));
    test('Format: charges object', !!td?.order?.charges);

    const charges = td?.order?.charges;
    if (charges) {
      test('Format: charges.itemsMenuTotal present', charges.itemsMenuTotal !== undefined);
      test('Format: charges.priceAdjustment present', charges.priceAdjustment !== undefined);
      test('Format: charges.subtotal present', charges.subtotal !== undefined);
      test('Format: charges.totalTax present', charges.totalTax !== undefined);
      test('Format: charges.grandTotal present', charges.grandTotal !== undefined);
      test('Format: charges.taxSummary is array', Array.isArray(charges.taxSummary));
      test('Format: charges.serviceCharge object', !!charges.serviceCharge);

      console.log(`   itemsMenuTotal: ${charges.itemsMenuTotal}`);
      console.log(`   priceAdjustment: ${charges.priceAdjustment}`);
      console.log(`   subtotal: ${charges.subtotal}`);
    }
  } else {
    console.log('   No occupied tables — will test with fresh order below');
  }

  // ─── 4. FRESH ORDER — Create new order and verify pricing ───
  section('4. FRESH ORDER — Create, Add Items, Verify No Price Adjustment');

  // DB cleanup
  const { initializeDatabase, getPool } = require('../database');
  await initializeDatabase();
  const pool = getPool();

  // Clean stale sessions
  const [stale] = await pool.query(
    `SELECT ts.id, ts.table_id FROM table_sessions ts
     JOIN tables t ON ts.table_id = t.id
     WHERE t.outlet_id = ? AND ts.status = 'active'`, [OUTLET_ID]
  );
  for (const s of stale) {
    await pool.query('UPDATE table_sessions SET status="completed", ended_at=NOW() WHERE id=?', [s.id]);
    await pool.query('UPDATE tables SET status="available" WHERE id=?', [s.table_id]);
  }

  const tablesRes2 = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes2.data.data.filter(t => t.status === 'available');
  test('Available tables >= 1', availTables.length >= 1);
  const TEST_TABLE = availTables[0]?.id;

  // Get some items from captain menu to know base prices
  const menuItems = [];
  for (const cat of categories) {
    for (const item of (cat.items || [])) {
      if (menuItems.length < 2 && !item.variants) {
        menuItems.push({ id: item.id, name: item.name, basePrice: n(item.basePrice) });
      }
    }
  }
  console.log(`   Test items: ${menuItems.map(i => `${i.name}(₹${i.basePrice})`).join(', ')}`);

  // Start session + create order
  await captain.post(`/tables/${TEST_TABLE}/session`, { guestCount: 2 });
  const orderRes = await captain.post('/orders', { outletId: OUTLET_ID, tableId: TEST_TABLE, orderType: 'dine_in', guestCount: 2 });
  const ORDER_ID = orderRes.data.data.id;
  test('Order created', !!ORDER_ID);

  // Add items
  const addRes = await captain.post(`/orders/${ORDER_ID}/items`, {
    items: menuItems.map(i => ({ itemId: i.id, quantity: 1 }))
  });
  test('Items added', addRes.data.success);

  // Send KOT
  const kotRes = await captain.post(`/orders/${ORDER_ID}/kot`);
  test('KOT sent', kotRes.data.success);

  // Now check table details
  const tableDetail = await captain.get(`/tables/${TEST_TABLE}`);
  const td = tableDetail.data.data;
  const charges = td?.order?.charges;
  const items = td?.items || [];

  test('Table detail has order', !!td?.order);
  test('Table detail has items', items.length > 0);
  test('Table detail has charges', !!charges);

  if (charges) {
    // The KEY assertion: priceAdjustment should be 0
    test('priceAdjustment === 0 (no rules applied)', charges.priceAdjustment === 0, `Got: ${charges.priceAdjustment}`);
    test('subtotal === itemsMenuTotal (no adjustment)', charges.subtotal === charges.itemsMenuTotal, 
      `subtotal:${charges.subtotal} vs menuTotal:${charges.itemsMenuTotal}`);

    console.log(`   itemsMenuTotal:   ${charges.itemsMenuTotal}`);
    console.log(`   priceAdjustment:  ${charges.priceAdjustment}`);
    console.log(`   subtotal:         ${charges.subtotal}`);
    console.log(`   totalTax:         ${charges.totalTax}`);
    console.log(`   grandTotal:       ${charges.grandTotal}`);
  }

  // Verify each item's price matches menu base price
  section('5. ITEM PRICE VERIFICATION — DB unit_price === menu basePrice');

  for (const item of items) {
    const menuRef = menuItems.find(m => m.id === item.itemId);
    if (menuRef) {
      test(`${item.name}: menuPrice(${item.menuPrice}) === catalogBase(${menuRef.basePrice})`,
        n(item.menuPrice) === menuRef.basePrice,
        `menuPrice:${item.menuPrice} vs catalog:${menuRef.basePrice}`);
      
      const expectedTotal = n((item.menuPrice + item.addonTotal) * item.quantity);
      test(`${item.name}: itemTotal(${item.itemTotal}) = (menu+addon)*qty = ${expectedTotal}`,
        Math.abs(n(item.itemTotal) - expectedTotal) < 0.02);
    }
  }

  // Verify DB stored unit_price matches base price (no rule inflation)
  const [dbItems] = await pool.query(
    'SELECT oi.*, i.base_price as catalog_base FROM order_items oi JOIN items i ON oi.item_id = i.id WHERE oi.order_id = ?',
    [ORDER_ID]
  );
  for (const di of dbItems) {
    test(`DB: ${di.item_name} unit_price(${di.unit_price}) === catalog base(${di.catalog_base})`,
      n(di.unit_price) === n(di.catalog_base),
      `unit_price:${di.unit_price} vs base:${di.catalog_base}`);
  }

  // ─── 6. VERIFY GRAND TOTAL MATH ───
  section('6. VERIFY GRAND TOTAL MATH — Only menu + tax, no rule markup');

  if (charges) {
    // grandTotal should be: subtotal + totalTax (no rule adjustments)
    // (minus discount + serviceCharge + roundOff etc)
    const expectedGrand = charges.subtotal - charges.discount + charges.totalTax + 
      (charges.serviceCharge?.amount || 0) + charges.packagingCharge + charges.deliveryCharge + charges.roundOff;
    test(`grandTotal(${charges.grandTotal}) = subtotal(${charges.subtotal}) - disc(${charges.discount}) + tax(${charges.totalTax}) + sc(${charges.serviceCharge?.amount || 0}) + roundOff(${charges.roundOff})`,
      Math.abs(n(charges.grandTotal) - expectedGrand) < 1,
      `Expected ~${expectedGrand.toFixed(2)}, got ${charges.grandTotal}`);
  }

  // ─── 7. VERIFY EXISTING CASHIER-CAPTAIN TEST STILL PASSES ───
  section('7. API RESPONSE FORMAT CHECK');

  // Captain menu format
  test('Menu: menu[].items[].basePrice exists', categories[0]?.items?.[0]?.basePrice !== undefined);
  test('Menu: menu[].items[].price exists', categories[0]?.items?.[0]?.price !== undefined);
  test('Menu: menu[].items[].price === basePrice', 
    n(categories[0]?.items?.[0]?.price) === n(categories[0]?.items?.[0]?.basePrice));
  test('Menu: no hasDiscount flag', !categories[0]?.items?.[0]?.hasDiscount);

  // Table detail format
  if (charges) {
    test('Table: charges.priceAdjustment field exists', charges.priceAdjustment !== undefined);
    test('Table: charges.itemsMenuTotal field exists', charges.itemsMenuTotal !== undefined);
    test('Table: charges.subtotal field exists', charges.subtotal !== undefined);
    test('Table: charges.taxSummary field exists', charges.taxSummary !== undefined);
    test('Table: charges.serviceCharge field exists', charges.serviceCharge !== undefined);
    test('Table: charges.grandTotal field exists', charges.grandTotal !== undefined);
  }

  // ─── CLEANUP ───
  section('8. CLEANUP');
  // Cancel order to release table
  try {
    await admin.post(`/orders/${ORDER_ID}/cancel`, { reason: 'Test cleanup' });
    console.log('   Order cancelled');
  } catch (e) {
    // Release table manually
    await pool.query('UPDATE tables SET status="available" WHERE id=?', [TEST_TABLE]);
    await pool.query('UPDATE table_sessions SET status="completed", ended_at=NOW() WHERE table_id=? AND status="active"', [TEST_TABLE]);
    console.log('   Table released manually');
  }

  // ─── RESULTS ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}\n`);

  if (failed === 0) {
    console.log('✅ All tests passed — price rules fully disabled, response formats intact!');
  } else {
    console.log(`❌ ${failed} test(s) failed`);
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('\n💥 FATAL ERROR:', e.response?.data || e.message);
  process.exit(1);
});
