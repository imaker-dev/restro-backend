/**
 * Test: GET /tables/:id comprehensive pricing details
 * 
 * Scenarios:
 *   1. Create order with items (including addons, special instructions)
 *   2. Verify GET /tables/:id returns full pricing breakdown per item
 *   3. Verify tax details (taxGroupName, taxRate, taxBreakdown CGST/SGST)
 *   4. Verify addon totals, menu price vs unit price
 *   5. Verify order-level: roundOff, packagingCharge, computedTaxBreakup
 *   6. Cancel item → verify cancel details in response
 *   7. Verify statusSummary uses active items only
 *   8. Verify price math: subtotal = sum of active item totalPrices
 * 
 * Run: node src/tests/test-table-details-pricing.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const TABLE_ID = 16; // R1 as shown in user's response

const CAPTAIN_CREDS = { email: 'admin@restropos.com', password: 'admin123' };

let api;
let passed = 0, failed = 0;

function test(name, condition, debug = '') {
  if (condition) { console.log(`   ✓ ${name}`); passed++; }
  else { console.log(`   ✗ ${name}${debug ? ' → ' + debug : ''}`); failed++; }
}

function section(title) {
  console.log('\n' + '─'.repeat(62));
  console.log(`  ${title}`);
  console.log('─'.repeat(62));
}

async function cleanup() {
  for (let id = 100; id <= 150; id++) {
    try {
      const r = await api.get(`/orders/${id}`);
      if (r.data.success && r.data.data?.table_id == TABLE_ID &&
          !['cancelled', 'paid'].includes(r.data.data?.status)) {
        await api.post(`/orders/${id}/cancel`, { reason: 'cleanup' });
      }
    } catch (e) {}
  }
  try { await api.delete(`/tables/${TABLE_ID}/session`); } catch (e) {}
  await api.patch(`/tables/${TABLE_ID}/status`, { status: 'available' });
}

async function run() {
  console.log('\n' + '═'.repeat(62));
  console.log('  TABLE DETAILS: COMPREHENSIVE PRICING TEST');
  console.log('═'.repeat(62));

  // AUTH
  section('1. AUTH + CLEANUP');
  const login = await axios.post(`${API_BASE}/auth/login`, CAPTAIN_CREDS);
  api = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${login.data.data.accessToken}` },
    timeout: 15000, validateStatus: () => true
  });
  test('Login', !!login.data.data.accessToken);
  await cleanup();

  // CHECK TABLE AVAILABLE
  section('2. TABLE STATUS = AVAILABLE');
  const t0 = await api.get(`/tables/${TABLE_ID}`);
  test('Table available', t0.data.data?.status === 'available', `Got: ${t0.data.data?.status}`);

  // CREATE ORDER WITH ITEMS + ADDONS
  section('3. CREATE ORDER WITH ITEMS & ADDONS');
  const sess = await api.post(`/tables/${TABLE_ID}/session`, { guestCount: 3 });
  test('Session started', sess.data.success, sess.data.message);

  const ord = await api.post('/orders', {
    outletId: OUTLET_ID, tableId: TABLE_ID,
    tableSessionId: sess.data.data?.sessionId || sess.data.data?.id,
    orderType: 'dine_in', covers: 3
  });
  test('Order created', ord.data.success, ord.data.message);
  const orderId = ord.data.data?.id;

  // Get menu to find items with addons
  const menuRes = await api.get(`/menu/outlets/${OUTLET_ID}/items`);
  const menuItems = menuRes.data.data || [];

  // Find items with addons
  let itemWithAddon = null;
  let addonId = null;
  for (const mi of menuItems) {
    if (mi.addon_groups && mi.addon_groups.length > 0) {
      for (const ag of mi.addon_groups) {
        if (ag.addons && ag.addons.length > 0) {
          itemWithAddon = mi;
          addonId = ag.addons[0].id;
          break;
        }
      }
      if (addonId) break;
    }
  }

  const itemsToAdd = [
    { itemId: 1, quantity: 2, specialInstructions: 'Extra spicy' }
  ];

  if (itemWithAddon && addonId) {
    itemsToAdd.push({ itemId: itemWithAddon.id, quantity: 1, addons: [addonId] });
    console.log(`   Item with addon: ${itemWithAddon.name} + addon ${addonId}`);
  }
  itemsToAdd.push({ itemId: 3, quantity: 1 });

  const addRes = await api.post(`/orders/${orderId}/items`, { items: itemsToAdd });
  test('Items added', addRes.data.success, addRes.data.message);

  // SEND KOT
  const kotRes = await api.post(`/orders/${orderId}/kot`);
  test('KOT sent', kotRes.data.success, kotRes.data.message);

  // GET TABLE DETAILS
  section('4. GET /tables/:id → FULL PRICING DETAILS');
  const t1 = await api.get(`/tables/${TABLE_ID}`);
  const data = t1.data.data;
  test('Table response success', t1.data.success);
  test('Table status = occupied', data?.status === 'occupied', `Got: ${data?.status}`);

  // ORDER SECTION
  section('5. ORDER & CHARGES DETAILS');
  const order = data?.order;
  const charges = order?.charges;
  test('order.totalAmount present', order?.totalAmount !== undefined);
  test('order.paidAmount present', order?.paidAmount !== undefined);
  test('order.dueAmount present', order?.dueAmount !== undefined);
  test('order.guestCount present', order?.guestCount !== undefined, `guests: ${order?.guestCount}`);
  test('order.activeItemCount present', order?.activeItemCount !== undefined);
  test('order.cancelledItemCount = 0', order?.cancelledItemCount === 0);
  test('order.createdBy present', !!order?.createdBy, `createdBy: ${order?.createdBy}`);

  // Charges block
  test('charges present', !!charges);
  test('charges.subtotal present', charges?.subtotal !== undefined);
  test('charges.discount present', charges?.discount !== undefined);
  test('charges.taxSummary is array', Array.isArray(charges?.taxSummary));
  test('charges.totalTax present', charges?.totalTax !== undefined);
  test('charges.serviceCharge present', !!charges?.serviceCharge);
  test('charges.serviceCharge has rate', charges?.serviceCharge?.rate !== undefined);
  test('charges.serviceCharge has isPercentage', charges?.serviceCharge?.isPercentage !== undefined);
  test('charges.packagingCharge present', charges?.packagingCharge !== undefined);
  test('charges.deliveryCharge present', charges?.deliveryCharge !== undefined);
  test('charges.roundOff present', charges?.roundOff !== undefined);
  test('charges.grandTotal present', charges?.grandTotal !== undefined);

  test('charges.itemsMenuTotal present', charges?.itemsMenuTotal !== undefined);
  test('charges.priceAdjustment present', charges?.priceAdjustment !== undefined);

  console.log(`\n   Charges Breakdown:`);
  console.log(`   itemsMenuTotal: ${charges?.itemsMenuTotal}`);
  console.log(`   priceAdjust:    ${charges?.priceAdjustment}`);
  console.log(`   subtotal:       ${charges?.subtotal}  (menuTotal + priceAdjustment)`);
  console.log(`   discount:       ${charges?.discount}`);
  if (charges?.taxSummary) {
    for (const tg of charges.taxSummary) {
      console.log(`   ${tg.taxGroup} (${tg.taxRate}%) on ₹${tg.taxableAmount} → ${tg.itemCount} items:`);
      for (const c of tg.components) {
        console.log(`     ${c.name} @${c.rate}% = ₹${c.amount}`);
      }
      console.log(`     Total tax: ₹${tg.totalTax}`);
    }
  }
  console.log(`   totalTax:       ${charges?.totalTax}`);
  console.log(`   serviceCharge:  ${charges?.serviceCharge?.name} @${charges?.serviceCharge?.rate}${charges?.serviceCharge?.isPercentage ? '%' : ' flat'} = ₹${charges?.serviceCharge?.amount}`);
  console.log(`   packaging:      ${charges?.packagingCharge}`);
  console.log(`   delivery:       ${charges?.deliveryCharge}`);
  console.log(`   roundOff:       ${charges?.roundOff}`);
  console.log(`   grandTotal:     ${charges?.grandTotal}`);

  // ITEM PRICING DETAILS
  section('6. ITEM PRICING BREAKDOWN');
  const items = data?.items || [];
  console.log(`   Total items: ${items.length}`);

  for (const item of items) {
    console.log(`\n   📦 ${item.name}${item.variantName ? ' (' + item.variantName + ')' : ''} x${item.quantity}`);
    console.log(`     menuPrice:   ${item.menuPrice}`);
    console.log(`     addonTotal:  ${item.addonTotal}`);
    console.log(`     itemTotal:   ${item.itemTotal}  = (menu + addon) × qty`);
    console.log(`     status:      ${item.status}  kotId: ${item.kotId}`);
    if (item.addons.length > 0) {
      console.log(`     addons: ${item.addons.map(a => `${a.name}(₹${a.price}×${a.quantity})`).join(', ')}`);
    }
  }

  // VERIFY EACH ITEM HAS CLEAN PRICING FIELDS
  section('7. VERIFY ITEM FIELDS PRESENT');
  for (const item of items) {
    test(`${item.name}: menuPrice defined`, item.menuPrice !== undefined, `menuPrice: ${item.menuPrice}`);
    test(`${item.name}: addonTotal defined`, item.addonTotal !== undefined, `addonTotal: ${item.addonTotal}`);
    test(`${item.name}: itemTotal defined`, item.itemTotal !== undefined, `itemTotal: ${item.itemTotal}`);
    test(`${item.name}: createdAt defined`, item.createdAt !== undefined);
    test(`${item.name}: kotId defined`, item.kotId !== undefined);
    // These should NOT be at item level
    test(`${item.name}: no unitPrice at item`, item.unitPrice === undefined);
    test(`${item.name}: no taxBreakdown at item`, item.taxBreakdown === undefined);
    test(`${item.name}: no taxGroupId at item`, item.taxGroupId === undefined);
  }

  // VERIFY PRICE MATH
  section('8. VERIFY PRICE MATH');
  for (const item of items) {
    // itemTotal = (menuPrice + addonTotal) * quantity
    const expected = parseFloat(((item.menuPrice + item.addonTotal) * item.quantity).toFixed(2));
    test(`${item.name}: itemTotal(${item.itemTotal}) = (menu ${item.menuPrice} + addon ${item.addonTotal}) × ${item.quantity} = ${expected}`,
      Math.abs(item.itemTotal - expected) < 0.02,
      `Expected ${expected}, got ${item.itemTotal}`);
  }

  // charges.itemsMenuTotal should match sum of active item itemTotals
  const activeItems = items.filter(i => i.status !== 'cancelled');
  const computedMenuTotal = parseFloat(activeItems.reduce((s, i) => s + i.itemTotal, 0).toFixed(2));
  test(`charges.itemsMenuTotal (${charges.itemsMenuTotal}) = sum of active item totals (${computedMenuTotal})`,
    Math.abs(charges.itemsMenuTotal - computedMenuTotal) < 0.02,
    `Diff: ${Math.abs(charges.itemsMenuTotal - computedMenuTotal)}`);

  // subtotal = itemsMenuTotal + priceAdjustment
  test(`charges.subtotal (${charges.subtotal}) = menuTotal (${charges.itemsMenuTotal}) + priceAdj (${charges.priceAdjustment})`,
    Math.abs(charges.subtotal - (charges.itemsMenuTotal + charges.priceAdjustment)) < 0.02);

  // taxSummary totals should match charges.totalTax
  const taxSumFromGroups = charges.taxSummary.reduce((s, g) => s + g.totalTax, 0);
  test(`taxSummary sum (${taxSumFromGroups.toFixed(2)}) = charges.totalTax (${charges.totalTax})`,
    Math.abs(taxSumFromGroups - charges.totalTax) < 0.02);

  // grandTotal = subtotal - discount + totalTax + serviceCharge + packaging + delivery + roundOff
  const computedTotal = charges.subtotal - charges.discount + charges.totalTax
    + charges.serviceCharge.amount + charges.packagingCharge + charges.deliveryCharge + charges.roundOff;
  test(`Grand total math: ${charges.subtotal} - ${charges.discount} + ${charges.totalTax} + ${charges.serviceCharge.amount} + ${charges.roundOff} = ~${Math.round(computedTotal)}`,
    Math.abs(charges.grandTotal - Math.round(computedTotal)) <= 1,
    `Expected ~${Math.round(computedTotal)}, got ${charges.grandTotal}`);

  // CANCEL AN ITEM
  section('9. CANCEL ITEM → VERIFY CANCEL DETAILS');
  const cancelItemId = items[items.length - 1]?.id; // cancel last item
  const cancelItemName = items[items.length - 1]?.name;
  console.log(`   Cancelling: ${cancelItemName} (id: ${cancelItemId})`);

  await api.post(`/orders/items/${cancelItemId}/cancel`, { reason: 'Customer changed mind' });

  const t2 = await api.get(`/tables/${TABLE_ID}`);
  const d2 = t2.data.data;
  const cancelledItem = d2?.items?.find(i => i.id === cancelItemId);

  test('Cancelled item has status=cancelled', cancelledItem?.status === 'cancelled');
  test('Cancelled item has cancelReason', !!cancelledItem?.cancelReason, `reason: ${cancelledItem?.cancelReason}`);
  test('Cancelled item has cancelledAt', !!cancelledItem?.cancelledAt, `at: ${cancelledItem?.cancelledAt}`);
  test('Cancelled item has cancelledBy', !!cancelledItem?.cancelledBy, `by: ${cancelledItem?.cancelledBy}`);

  // Verify charges updated (should exclude cancelled item)
  const order2 = d2?.order;
  const charges2 = order2?.charges;
  const activeAfter = d2?.items?.filter(i => i.status !== 'cancelled') || [];
  const menuTotalAfter = parseFloat(activeAfter.reduce((s, i) => s + i.itemTotal, 0).toFixed(2));
  test(`charges.itemsMenuTotal updated to ${charges2.itemsMenuTotal} (active items: ${menuTotalAfter})`,
    Math.abs(charges2.itemsMenuTotal - menuTotalAfter) < 0.02);
  test(`Order cancelledItemCount = 1`, order2.cancelledItemCount === 1, `Got: ${order2.cancelledItemCount}`);
  test(`Order activeItemCount = ${items.length - 1}`, order2.activeItemCount === items.length - 1);

  // STATUS SUMMARY
  section('10. STATUS SUMMARY');
  const summary = d2?.statusSummary;
  test('Summary has activeItemCount', summary?.activeItemCount !== undefined, `active: ${summary?.activeItemCount}`);
  test('Summary has cancelledItemCount', summary?.cancelledItemCount !== undefined, `cancelled: ${summary?.cancelledItemCount}`);
  test('Summary activeItemCount correct', summary?.activeItemCount === items.length - 1,
    `Expected ${items.length - 1}, got ${summary?.activeItemCount}`);
  console.log(`   Summary: ${summary?.message}`);
  console.log(`   Total items: ${summary?.totalItems}, Active: ${summary?.activeItemCount}, Cancelled: ${summary?.cancelledItemCount}`);

  // KOT DETAILS
  section('11. KOT DETAILS');
  const kots = d2?.kots || [];
  for (const k of kots) {
    console.log(`   KOT ${k.kotNumber}: status=${k.status}, items=${k.itemCount}, cancelled=${k.cancelledItemCount}`);
  }
  test('KOTs present', kots.length > 0);

  // TIMELINE
  section('12. TIMELINE');
  const timeline = d2?.timeline || [];
  for (const t of timeline.slice(0, 3)) {
    console.log(`   ${t.action || '(no action)'}: ${t.timestamp}`);
  }

  // CLEANUP
  section('13. CLEANUP');
  await api.post(`/orders/${orderId}/cancel`, { reason: 'test complete' });
  console.log('   Done');

  // RESULTS
  console.log('\n' + '═'.repeat(62));
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log('═'.repeat(62));
  console.log(failed === 0 ? '\n✅ All tests passed!' : '\n❌ Some tests failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  if (err.response?.data) console.error(err.response.data);
  process.exit(1);
});
