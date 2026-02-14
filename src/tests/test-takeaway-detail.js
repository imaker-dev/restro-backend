/**
 * Takeaway Order Detail API — Comprehensive Test
 * Tests deep detail response: items, KOTs, discounts, payments, invoice, cancelled items
 */

require('dotenv').config();
const axios = require('axios');
const { initializeDatabase, getPool } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

let passed = 0, failed = 0, api, pool;

function section(t) { console.log(`\n${'═'.repeat(70)}\n  ${t}\n${'═'.repeat(70)}`); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}
function log(label, val) { console.log(`   ${label}:`, typeof val === 'object' ? JSON.stringify(val, null, 2).split('\n').join('\n   ') : val); }

async function login(email, password) {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  const token = res.data.data.accessToken || res.data.data.token;
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  TAKEAWAY ORDER DETAIL — Comprehensive Test                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  pool = getPool();
  api = await login('admin@restropos.com', 'admin123');

  // Find a takeaway order with items
  const [orders] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.subtotal
     FROM orders o
     WHERE o.outlet_id = ? AND o.order_type = 'takeaway'
     ORDER BY o.created_at DESC LIMIT 5`,
    [OUTLET_ID]
  );

  if (orders.length === 0) {
    console.log('   ⚠ No takeaway orders found. Cannot test.');
    process.exit(0);
  }

  console.log(`\n   Found ${orders.length} takeaway orders:`);
  orders.forEach(o => console.log(`   - ${o.order_number} (id=${o.id}, status=${o.status}, subtotal=${o.subtotal})`));

  const testOrder = orders[0];

  // ══════════════════════════════════════════════════════════════
  // A. GET DETAIL — structure validation
  // ══════════════════════════════════════════════════════════════
  section('A. GET /orders/takeaway/detail/:id — full structure');
  try {
    const r = await api.get(`/orders/takeaway/detail/${testOrder.id}`);
    test('Status 200', r.status === 200);
    test('success = true', r.data.success === true);

    const d = r.data.data;

    // Order section
    test('Has order object', !!d.order);
    test('order.id matches', d.order.id === testOrder.id);
    test('order.orderNumber present', !!d.order.orderNumber);
    test('order.orderType present', !!d.order.orderType);
    test('order.status present', !!d.order.status);
    test('order.subtotal is number', typeof d.order.subtotal === 'number');
    test('order.totalAmount is number', typeof d.order.totalAmount === 'number');
    test('order.paidAmount is number', typeof d.order.paidAmount === 'number');
    test('order.dueAmount is number', typeof d.order.dueAmount === 'number');
    test('order.createdByName present', d.order.createdByName !== undefined);
    test('order.customerName field exists', 'customerName' in d.order);
    test('order.customerPhone field exists', 'customerPhone' in d.order);

    // Items section
    test('Has items object', !!d.items);
    test('items.active is array', Array.isArray(d.items.active));
    test('items.cancelled is array', Array.isArray(d.items.cancelled));
    test('items.activeCount is number', typeof d.items.activeCount === 'number');
    test('items.cancelledCount is number', typeof d.items.cancelledCount === 'number');
    test('items.totalCount = active + cancelled', d.items.totalCount === d.items.activeCount + d.items.cancelledCount);
    test('items.statusBreakdown is object', typeof d.items.statusBreakdown === 'object');

    log('Items summary', {
      active: d.items.activeCount,
      cancelled: d.items.cancelledCount,
      total: d.items.totalCount,
      statusBreakdown: d.items.statusBreakdown
    });

    // Check item detail fields
    if (d.items.active.length > 0) {
      const item = d.items.active[0];
      test('Item has id', !!item.id);
      test('Item has itemName', !!item.itemName);
      test('Item has quantity', item.quantity > 0);
      test('Item has unitPrice', typeof item.unitPrice === 'number');
      test('Item has totalPrice', typeof item.totalPrice === 'number');
      test('Item has status', !!item.status);
      test('Item has addons array', Array.isArray(item.addons));
      test('Item has stationName field', 'stationName' in item);
      test('Item has specialInstructions field', 'specialInstructions' in item);
      log('Sample item', {
        id: item.id, itemName: item.itemName, qty: item.quantity,
        price: item.unitPrice, total: item.totalPrice, status: item.status,
        station: item.stationName, addons: item.addons.length
      });
    }

    // Check cancelled item detail
    if (d.items.cancelled.length > 0) {
      const ci = d.items.cancelled[0];
      test('Cancelled item has cancelReason field', 'cancelReason' in ci);
      test('Cancelled item has cancelledByName field', 'cancelledByName' in ci);
      test('Cancelled item has cancelledAt field', 'cancelledAt' in ci);
      log('Sample cancelled item', {
        itemName: ci.itemName, status: ci.status,
        cancelReason: ci.cancelReason, cancelledBy: ci.cancelledByName
      });
    }

    // KOTs section
    test('Has kots object', !!d.kots);
    test('kots.list is array', Array.isArray(d.kots.list));
    test('kots.totalCount is number', typeof d.kots.totalCount === 'number');
    test('kots.statusBreakdown is object', typeof d.kots.statusBreakdown === 'object');

    log('KOTs summary', {
      total: d.kots.totalCount,
      statusBreakdown: d.kots.statusBreakdown
    });

    if (d.kots.list.length > 0) {
      const kot = d.kots.list[0];
      test('KOT has id', !!kot.id);
      test('KOT has kotNumber', !!kot.kotNumber);
      test('KOT has station', !!kot.station);
      test('KOT has status', !!kot.status);
      test('KOT has items array', Array.isArray(kot.items));
      test('KOT has itemCount', typeof kot.itemCount === 'number');
      test('KOT has createdByName field', 'createdByName' in kot);
      log('Sample KOT', {
        id: kot.id, number: kot.kotNumber, station: kot.station,
        status: kot.status, items: kot.itemCount, cancelled: kot.cancelledCount
      });

      if (kot.items.length > 0) {
        const ki = kot.items[0];
        test('KOT item has itemName', !!ki.itemName);
        test('KOT item has quantity', ki.quantity > 0);
        test('KOT item has status', !!ki.status);
        test('KOT item has orderItemStatus', 'orderItemStatus' in ki);
      }
    }

    // Discounts section
    test('Has discounts object', !!d.discounts);
    test('discounts.list is array', Array.isArray(d.discounts.list));
    test('discounts.totalCount is number', typeof d.discounts.totalCount === 'number');
    test('discounts.totalDiscount is number', typeof d.discounts.totalDiscount === 'number');

    log('Discounts summary', {
      count: d.discounts.totalCount,
      total: d.discounts.totalDiscount
    });

    // Payments section
    test('Has payments object', !!d.payments);
    test('payments.list is array', Array.isArray(d.payments.list));
    test('payments.totalCount is number', typeof d.payments.totalCount === 'number');
    test('payments.totalPaid is number', typeof d.payments.totalPaid === 'number');
    test('payments.dueAmount is number', typeof d.payments.dueAmount === 'number');
    test('payments.orderTotal is number', typeof d.payments.orderTotal === 'number');

    log('Payments summary', {
      count: d.payments.totalCount,
      totalPaid: d.payments.totalPaid,
      dueAmount: d.payments.dueAmount,
      orderTotal: d.payments.orderTotal
    });

    // Invoice section
    test('invoice field exists', 'invoice' in d);
    if (d.invoice) {
      test('invoice.id present', !!d.invoice.id);
      test('invoice.invoiceNumber present', !!d.invoice.invoiceNumber);
      test('invoice.grandTotal is number', typeof d.invoice.grandTotal === 'number');
      test('invoice.paymentStatus present', !!d.invoice.paymentStatus);
      log('Invoice', {
        number: d.invoice.invoiceNumber,
        subtotal: d.invoice.subtotal,
        discount: d.invoice.discountAmount,
        tax: d.invoice.totalTax,
        grand: d.invoice.grandTotal,
        paymentStatus: d.invoice.paymentStatus
      });
    } else {
      console.log('   ℹ No invoice generated yet');
    }

    // Log full order section
    log('Order', d.order);

  } catch (e) {
    test('GET takeaway detail', false, e.response?.data?.message || e.message);
    if (e.response?.data) log('Error response', e.response.data);
  }

  // ══════════════════════════════════════════════════════════════
  // B. 404 — non-existent order
  // ══════════════════════════════════════════════════════════════
  section('B. Non-existent order — 404');
  try {
    await api.get('/orders/takeaway/detail/999999');
    test('Should return 404', false);
  } catch (e) {
    test('404 for non-existent', e.response?.status === 404);
    log('Error', e.response?.data?.message);
  }

  // ══════════════════════════════════════════════════════════════
  // C. ALL TAKEAWAY ORDERS — verify each returns valid detail
  // ══════════════════════════════════════════════════════════════
  section('C. All takeaway orders — quick validation');
  for (const ord of orders) {
    try {
      const r = await api.get(`/orders/takeaway/detail/${ord.id}`);
      const d = r.data.data;
      const ok = d.order && d.items && d.kots && d.discounts && d.payments;
      test(`${ord.order_number} (${ord.status}): valid structure`, ok);
      console.log(`     items=${d.items.totalCount} kots=${d.kots.totalCount} ` +
        `discounts=${d.discounts.totalCount} payments=${d.payments.totalCount} ` +
        `invoice=${d.invoice ? d.invoice.invoiceNumber : 'none'}`);
    } catch (e) {
      test(`${ord.order_number}: detail`, false, e.response?.data?.message || e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // D. PENDING LIST — verify orders match detail endpoint
  // ══════════════════════════════════════════════════════════════
  section('D. Pending list ↔ detail consistency');
  try {
    const r = await api.get(`/orders/takeaway/pending/${OUTLET_ID}?limit=3`);
    if (r.data.data.length > 0) {
      const listOrder = r.data.data[0];
      const detail = await api.get(`/orders/takeaway/detail/${listOrder.id}`);
      const d = detail.data.data;
      test('List order_number = detail orderNumber',
        listOrder.order_number === d.order.orderNumber);
      test('List status = detail status', listOrder.status === d.order.status);
      test('List item_count ≈ detail activeCount',
        listOrder.item_count === d.items.activeCount,
        `list=${listOrder.item_count}, detail=${d.items.activeCount}`);
    }
  } catch (e) {
    test('List/detail consistency', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(70)}`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.response?.data || err.message);
  process.exit(1);
});
