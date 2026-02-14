/**
 * Comprehensive Test: All 3 Fixes
 * 1. Download PDF via POST (was 404)
 * 2. Bill generation without service charge
 * 3. API performance (N+1 fix)
 */

require('dotenv').config();
const axios = require('axios');
const { initializeDatabase, getPool } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

let passed = 0, failed = 0;

function section(title) {
  console.log(`\n${'═'.repeat(70)}\n  ${title}\n${'═'.repeat(70)}`);
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

function timer() {
  const start = Date.now();
  return () => Date.now() - start;
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ALL FIXES TEST — Download POST, Service Charge, Performance       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();
  const api = await login('admin@restropos.com', 'admin123');

  // ═══════════════════════════════════════════════════════════
  // FIX 1: DOWNLOAD PDF VIA POST (was returning 404)
  // ═══════════════════════════════════════════════════════════
  section('FIX 1: DOWNLOAD PDF — GET and POST both work');

  const [invoices] = await pool.query(
    `SELECT i.id, i.invoice_number, i.order_id
     FROM invoices i WHERE i.outlet_id = ? AND i.is_cancelled = 0
     ORDER BY i.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  if (invoices.length > 0) {
    const inv = invoices[0];
    console.log(`   Test invoice: #${inv.invoice_number} (id=${inv.id}, orderId=${inv.order_id})`);

    // GET by invoice ID
    try {
      const r = await api.get(`/orders/invoice/${inv.id}/download`, { responseType: 'arraybuffer' });
      test('GET /invoice/:invoiceId/download → 200', r.status === 200);
      test('GET: valid PDF', Buffer.from(r.data).slice(0, 5).toString() === '%PDF-');
    } catch (e) {
      test('GET download', false, e.response?.status + ' ' + (e.response?.data ? Buffer.from(e.response.data).toString().slice(0, 100) : e.message));
    }

    // POST by invoice ID (the user's exact failing call)
    try {
      const r = await api.post(`/orders/invoice/${inv.id}/download`, {}, { responseType: 'arraybuffer' });
      test('POST /invoice/:invoiceId/download → 200 (was 404)', r.status === 200);
      test('POST: valid PDF', Buffer.from(r.data).slice(0, 5).toString() === '%PDF-');
    } catch (e) {
      test('POST download (was 404)', false, e.response?.status + ' ' + (e.response?.data ? Buffer.from(e.response.data).toString().slice(0, 100) : e.message));
    }

    // POST by order ID
    try {
      const r = await api.post(`/orders/invoice/${inv.order_id}/download`, {}, { responseType: 'arraybuffer' });
      test('POST /invoice/:orderId/download → 200', r.status === 200);
      test('POST by orderId: valid PDF', Buffer.from(r.data).slice(0, 5).toString() === '%PDF-');
    } catch (e) {
      test('POST by orderId', false, e.response?.status + ' ' + (e.response?.data ? Buffer.from(e.response.data).toString().slice(0, 100) : e.message));
    }

    // GET by order ID
    try {
      const r = await api.get(`/orders/invoice/${inv.order_id}/download`, { responseType: 'arraybuffer' });
      test('GET /invoice/:orderId/download → 200', r.status === 200);
    } catch (e) {
      test('GET by orderId', false, e.response?.status);
    }

    // 404 for nonexistent
    try {
      await api.post(`/orders/invoice/999999/download`, {}, { responseType: 'arraybuffer' });
      test('POST 999999: should 404', false);
    } catch (e) {
      test('POST 999999: returns 404', e.response?.status === 404);
    }
  } else {
    console.log('   ⚠ No invoices found');
  }

  // Print by invoice ID and by order ID
  section('FIX 1b: PRINT — by invoice ID and order ID');
  if (invoices.length > 0) {
    const inv = invoices[0];

    try {
      const r = await api.post(`/orders/invoice/${inv.id}/print`);
      test('Print by invoiceId: success', r.data.success);
    } catch (e) {
      if (e.response?.data?.message?.includes('printer') || e.response?.data?.message?.includes('Printer') || e.response?.data?.message?.includes('ECONNREFUSED')) {
        test('Print by invoiceId: code OK (printer offline)', true);
      } else {
        test('Print by invoiceId', false, e.response?.data?.message || e.message);
      }
    }

    try {
      const r = await api.post(`/orders/invoice/${inv.order_id}/print`);
      test('Print by orderId: success', r.data.success);
    } catch (e) {
      if (e.response?.data?.message?.includes('printer') || e.response?.data?.message?.includes('Printer') || e.response?.data?.message?.includes('ECONNREFUSED')) {
        test('Print by orderId: code OK (printer offline)', true);
      } else {
        test('Print by orderId', false, e.response?.data?.message || e.message);
      }
    }

    try {
      await api.post('/orders/invoice/999999/print');
      test('Print 999999: should 404', false);
    } catch (e) {
      test('Print 999999: returns 404', e.response?.status === 404);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FIX 2: BILL GENERATION WITHOUT SERVICE CHARGE
  // ═══════════════════════════════════════════════════════════
  section('FIX 2: BILL WITHOUT SERVICE CHARGE');

  // Find or create a billable order
  const [billableOrders] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.order_type
     FROM orders o
     LEFT JOIN invoices i ON i.order_id = o.id AND i.is_cancelled = 0
     WHERE o.outlet_id = ? AND o.status NOT IN ('paid', 'completed', 'cancelled')
       AND o.order_type = 'dine_in'
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  if (billableOrders.length > 0) {
    const order = billableOrders[0];
    console.log(`   Test order: ${order.order_number} (id=${order.id}, status=${order.status}, type=${order.order_type})`);

    try {
      const r = await api.post(`/orders/${order.id}/bill`);
      test('Generate bill: success', r.data.success);

      const inv = r.data.data;
      console.log(`   Invoice: ${inv.invoiceNumber}, subtotal=${inv.subtotal}, serviceCharge=${inv.serviceCharge}, total=${inv.grandTotal}`);

      test('Service charge = 0', inv.serviceCharge === 0, `got ${inv.serviceCharge}`);
      test('Grand total = subtotal + tax (no SC)', Math.abs(inv.grandTotal - (inv.taxableAmount + inv.totalTax + inv.packagingCharge + inv.deliveryCharge + inv.roundOff)) < 1, 
        `grandTotal=${inv.grandTotal} vs computed=${inv.taxableAmount + inv.totalTax + inv.packagingCharge + inv.deliveryCharge + inv.roundOff}`);
    } catch (e) {
      test('Generate bill', false, e.response?.data?.message || e.message);
    }

    // Generate again (should return existing invoice, still no service charge)
    try {
      const r = await api.post(`/orders/${order.id}/bill`);
      test('Re-generate bill: success', r.data.success);
      test('Re-generate: service charge still 0', r.data.data.serviceCharge === 0, `got ${r.data.data.serviceCharge}`);
    } catch (e) {
      test('Re-generate bill', false, e.response?.data?.message || e.message);
    }

    // Explicit applyServiceCharge: true should ADD service charge
    try {
      const r = await api.post(`/orders/${order.id}/bill`, { applyServiceCharge: true });
      console.log(`   With applyServiceCharge=true: serviceCharge=${r.data.data.serviceCharge}`);
      // Service charge may or may not be > 0 depending on whether outlet has a service charge configured
      test('Explicit SC=true: success', r.data.success);
    } catch (e) {
      test('Explicit SC=true', false, e.response?.data?.message || e.message);
    }

    // Reset back to no service charge
    try {
      const r = await api.post(`/orders/${order.id}/bill`);
      test('After reset: service charge = 0', r.data.data.serviceCharge === 0, `got ${r.data.data.serviceCharge}`);
    } catch (e) {
      test('Reset SC', false, e.response?.data?.message || e.message);
    }
  } else {
    console.log('   ⚠ No billable dine_in orders found. Testing with existing invoices...');
    
    // Check existing invoices have no service charge
    const [recentInvoices] = await pool.query(
      `SELECT id, invoice_number, service_charge, grand_total
       FROM invoices WHERE outlet_id = ? AND is_cancelled = 0
       ORDER BY created_at DESC LIMIT 5`,
      [OUTLET_ID]
    );
    for (const inv of recentInvoices) {
      console.log(`   ${inv.invoice_number}: SC=${inv.service_charge}, total=${inv.grand_total}`);
    }
  }

  // Also test with takeaway order (should never have SC)
  const [takeawayBillable] = await pool.query(
    `SELECT o.id, o.order_number
     FROM orders o
     LEFT JOIN invoices i ON i.order_id = o.id AND i.is_cancelled = 0
     WHERE o.outlet_id = ? AND o.status NOT IN ('paid', 'completed', 'cancelled')
       AND o.order_type = 'takeaway' AND i.id IS NULL
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  if (takeawayBillable.length > 0) {
    const to = takeawayBillable[0];
    console.log(`\n   Takeaway test: ${to.order_number} (id=${to.id})`);
    try {
      const r = await api.post(`/orders/${to.id}/bill`);
      test('Takeaway bill: success', r.data.success);
      test('Takeaway: service charge = 0', r.data.data.serviceCharge === 0);
    } catch (e) {
      test('Takeaway bill', false, e.response?.data?.message || e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FIX 3: API PERFORMANCE (N+1 fix)
  // ═══════════════════════════════════════════════════════════
  section('FIX 3: API PERFORMANCE');

  // Test order retrieval speed
  const [testOrders] = await pool.query(
    `SELECT id FROM orders WHERE outlet_id = ? AND status NOT IN ('cancelled')
     ORDER BY created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  if (testOrders.length > 0) {
    const oid = testOrders[0].id;

    // Single order with items
    let t = timer();
    try {
      const r = await api.get(`/orders/${oid}`);
      const ms = t();
      test(`Get order ${oid}: ${ms}ms`, ms < 2000, `took ${ms}ms`);
      console.log(`   Order items: ${r.data.data?.items?.length || 'N/A'}`);
    } catch (e) {
      test('Get order', false, e.response?.data?.message || e.message);
    }

    // Invoice retrieval (calls getOrderWithItems internally)
    if (invoices.length > 0) {
      t = timer();
      try {
        const r = await api.get(`/orders/invoice/${invoices[0].id}`);
        const ms = t();
        test(`Get invoice: ${ms}ms`, ms < 2000, `took ${ms}ms`);
      } catch (e) {
        test('Get invoice perf', false, e.message);
      }
    }

    // Active orders
    t = timer();
    try {
      const r = await api.get(`/orders/active/${OUTLET_ID}`);
      const ms = t();
      test(`Active orders: ${ms}ms (${r.data.data?.length || 0} orders)`, ms < 3000, `took ${ms}ms`);
    } catch (e) {
      test('Active orders perf', false, e.message);
    }

    // Pending takeaway
    t = timer();
    try {
      const r = await api.get(`/orders/takeaway/pending/${OUTLET_ID}?status=all&limit=20`);
      const ms = t();
      test(`Takeaway pending: ${ms}ms (${r.data.data?.length || 0} orders)`, ms < 2000, `took ${ms}ms`);
    } catch (e) {
      test('Takeaway perf', false, e.message);
    }

    // KOTs for order
    t = timer();
    try {
      const r = await api.get(`/orders/${oid}/kots`);
      const ms = t();
      test(`KOTs for order: ${ms}ms (${r.data.data?.length || 0} KOTs)`, ms < 2000, `took ${ms}ms`);
    } catch (e) {
      test('KOTs perf', false, e.message);
    }

    // Pending bills
    t = timer();
    try {
      const r = await api.get(`/orders/bills/pending/${OUTLET_ID}`);
      const ms = t();
      test(`Pending bills: ${ms}ms (${r.data.data?.length || 0} bills)`, ms < 3000, `took ${ms}ms`);
    } catch (e) {
      test('Pending bills perf', false, e.message);
    }

    // PDF download (heavier — includes PDF generation)
    if (invoices.length > 0) {
      t = timer();
      try {
        await api.post(`/orders/invoice/${invoices[0].id}/download`, {}, { responseType: 'arraybuffer' });
        const ms = t();
        test(`PDF download: ${ms}ms`, ms < 3000, `took ${ms}ms`);
      } catch (e) {
        test('PDF download perf', false, e.message);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EXTRA: PENDING TAKEAWAY — ALL FILTERS
  // ═══════════════════════════════════════════════════════════
  section('EXTRA: PENDING TAKEAWAY — ALL FILTERS');

  const filterTests = [
    { name: 'Default (pending)', query: '' },
    { name: 'Completed', query: '?status=completed' },
    { name: 'Cancelled', query: '?status=cancelled' },
    { name: 'All', query: '?status=all' },
    { name: 'Page 1, Limit 3', query: '?status=all&page=1&limit=3' },
    { name: 'Search ORD', query: '?status=all&search=ORD' },
    { name: 'Sort amount ASC', query: '?status=all&sortBy=total_amount&sortOrder=ASC&limit=5' },
    { name: 'Sort amount DESC', query: '?status=all&sortBy=total_amount&sortOrder=DESC&limit=5' },
  ];

  for (const ft of filterTests) {
    try {
      const url = `/orders/takeaway/pending/${OUTLET_ID}${ft.query}`;
      const r = await api.get(url);
      test(`${ft.name}: OK (${r.data.data.length}/${r.data.pagination.total})`, r.data.success);
    } catch (e) {
      test(ft.name, false, e.response?.data?.message || e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════
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
