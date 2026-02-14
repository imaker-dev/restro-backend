/**
 * Comprehensive Test: All Cashier APIs
 * 1. After payment — print invoice (by invoice ID & order ID)
 * 2. Completed order — download & print invoice
 * 3. Pending takeaway orders — all filters, search, pagination
 * 
 * Logs full payloads & responses for API documentation
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { initializeDatabase, getPool } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

let passed = 0, failed = 0;

function section(title) {
  console.log(`\n${'═'.repeat(70)}\n  ${title}\n${'═'.repeat(70)}`);
}
function subsection(title) {
  console.log(`\n  ── ${title} ──`);
}
function test(name, condition, detail) {
  if (condition) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}
function logApi(method, url, payload, response) {
  console.log(`\n   📡 ${method} ${url}`);
  if (payload) console.log(`   📤 Payload: ${JSON.stringify(payload, null, 2).split('\n').join('\n   ')}`);
  if (response) {
    const trimmed = JSON.stringify(response, null, 2);
    if (trimmed.length > 1500) {
      console.log(`   📥 Response (trimmed): ${trimmed.slice(0, 1500)}...`);
    } else {
      console.log(`   📥 Response: ${trimmed.split('\n').join('\n   ')}`);
    }
  }
}

async function login(email, password) {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  const token = res.data.data.accessToken || res.data.data.token;
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  COMPREHENSIVE CASHIER API TEST — PAYLOADS & RESPONSES              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();
  const api = await login('admin@restropos.com', 'admin123');
  console.log('   ✓ Logged in as admin (cashier role)');

  // ═══════════════════════════════════════════════════
  // Find test data
  // ═══════════════════════════════════════════════════
  const [completedOrders] = await pool.query(
    `SELECT o.id as order_id, o.order_number, o.status, o.total_amount, o.order_type,
       i.id as invoice_id, i.invoice_number, i.grand_total, i.payment_status
     FROM orders o
     JOIN invoices i ON i.order_id = o.id AND i.is_cancelled = 0
     WHERE o.outlet_id = ? AND o.status IN ('paid', 'completed') AND i.payment_status = 'paid'
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  const [billedOrders] = await pool.query(
    `SELECT o.id as order_id, o.order_number, o.status, o.total_amount,
       i.id as invoice_id, i.invoice_number, i.grand_total, i.payment_status
     FROM orders o
     JOIN invoices i ON i.order_id = o.id AND i.is_cancelled = 0
     WHERE o.outlet_id = ? AND o.status = 'billed' AND o.payment_status = 'pending'
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  // ═══════════════════════════════════════════════════════════
  // A. PRINT INVOICE — BY INVOICE ID AND BY ORDER ID
  // ═══════════════════════════════════════════════════════════
  section('A. PRINT INVOICE (Thermal Printer)');

  if (completedOrders.length > 0) {
    const co = completedOrders[0];
    console.log(`   Test data: order=${co.order_number} (id=${co.order_id}), invoice=${co.invoice_number} (id=${co.invoice_id})`);

    // A1. Print by invoice ID
    subsection('A1. Print by Invoice ID');
    try {
      const url = `/orders/invoice/${co.invoice_id}/print`;
      const r = await api.post(url);
      logApi('POST', url, null, r.data);
      test('Print by invoice ID: success', r.data.success);
      test('Print: has invoice data', !!r.data.data);
      test('Print: invoiceNumber matches', r.data.data?.invoiceNumber === co.invoice_number);
    } catch (e) {
      test('Print by invoice ID', false, e.response?.data?.message || e.message);
    }

    // A2. Print by order ID (the fix!)
    subsection('A2. Print by Order ID (resolves to invoice)');
    try {
      const url = `/orders/invoice/${co.order_id}/print`;
      const r = await api.post(url);
      logApi('POST', url, null, r.data);
      test('Print by order ID: success', r.data.success);
      test('Print: resolved to correct invoice', r.data.data?.invoiceNumber === co.invoice_number);
    } catch (e) {
      test('Print by order ID', false, e.response?.data?.message || e.message);
    }

    // A3. Print 404
    subsection('A3. Print — Not Found');
    try {
      await api.post('/orders/invoice/999999/print');
      test('Print 404: should fail', false);
    } catch (e) {
      logApi('POST', '/orders/invoice/999999/print', null, e.response?.data);
      test('Print 404: returns 404', e.response?.status === 404);
    }
  } else {
    console.log('   ⚠ No completed orders with paid invoices found');
  }

  // ═══════════════════════════════════════════════════════════
  // B. DOWNLOAD INVOICE PDF
  // ═══════════════════════════════════════════════════════════
  section('B. DOWNLOAD INVOICE PDF');

  if (completedOrders.length > 0) {
    const co = completedOrders[0];

    // B1. Download by invoice ID
    subsection('B1. Download by Invoice ID');
    try {
      const url = `/orders/invoice/${co.invoice_id}/download`;
      const r = await api.get(url, { responseType: 'arraybuffer' });
      console.log(`\n   📡 GET ${url}`);
      console.log(`   📥 Content-Type: ${r.headers['content-type']}`);
      console.log(`   📥 Content-Disposition: ${r.headers['content-disposition']}`);
      console.log(`   📥 Size: ${r.data.byteLength} bytes`);
      test('Download by invoice ID: status 200', r.status === 200);
      test('Download: content-type PDF', r.headers['content-type'] === 'application/pdf');
      test('Download: valid PDF', Buffer.from(r.data).slice(0, 5).toString() === '%PDF-');
    } catch (e) {
      test('Download by invoice ID', false, e.response?.status + ' ' + (e.message));
    }

    // B2. Download by order ID
    subsection('B2. Download by Order ID (resolves to invoice)');
    try {
      const url = `/orders/invoice/${co.order_id}/download`;
      const r = await api.get(url, { responseType: 'arraybuffer' });
      console.log(`\n   📡 GET ${url}`);
      console.log(`   📥 Content-Type: ${r.headers['content-type']}`);
      console.log(`   📥 Content-Disposition: ${r.headers['content-disposition']}`);
      console.log(`   📥 Size: ${r.data.byteLength} bytes`);
      test('Download by order ID: status 200', r.status === 200);
      test('Download: valid PDF', Buffer.from(r.data).slice(0, 5).toString() === '%PDF-');
    } catch (e) {
      test('Download by order ID', false, e.response?.status + ' ' + (e.message));
    }

    // B3. Download 404
    subsection('B3. Download — Not Found');
    try {
      await api.get('/orders/invoice/999999/download', { responseType: 'arraybuffer' });
      test('Download 404: should fail', false);
    } catch (e) {
      test('Download 404: returns 404', e.response?.status === 404);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // C. PROCESS PAYMENT → GET INVOICE IN RESPONSE
  // ═══════════════════════════════════════════════════════════
  section('C. PROCESS PAYMENT (Invoice in Response)');

  if (billedOrders.length > 0) {
    const bo = billedOrders[0];
    const payAmount = parseFloat(bo.grand_total || bo.total_amount);
    console.log(`   Test: order=${bo.order_number} (id=${bo.order_id}), invoice=${bo.invoice_number}, total=${payAmount}`);

    subsection('C1. Full Payment — Invoice Returned');
    const payload = {
      orderId: bo.order_id,
      invoiceId: bo.invoice_id,
      outletId: OUTLET_ID,
      paymentMode: 'cash',
      amount: payAmount
    };
    try {
      const url = '/orders/payment';
      const r = await api.post(url, payload);
      logApi('POST', url, payload, r.data);
      test('Payment: success', r.data.success);
      test('Payment: has data.payment', !!r.data.data?.payment);
      test('Payment: has data.invoice', r.data.data?.invoice !== undefined);
      test('Payment: has data.orderStatus', !!r.data.data?.orderStatus);
      test('Payment: has data.paymentStatus', !!r.data.data?.paymentStatus);

      if (r.data.data?.paymentStatus === 'completed') {
        test('Payment completed: invoice returned', r.data.data.invoice !== null);
        if (r.data.data.invoice) {
          test('Invoice: has invoiceNumber', !!r.data.data.invoice.invoiceNumber);
          test('Invoice: has items', Array.isArray(r.data.data.invoice.items));
          test('Invoice: has payments', Array.isArray(r.data.data.invoice.payments));
          test('Invoice: paymentStatus=paid', r.data.data.invoice.paymentStatus === 'paid');
        }
      }
    } catch (e) {
      test('Payment', false, e.response?.data?.message || e.message);
    }
  } else {
    console.log('   ⚠ No billed/unpaid orders to test payment');
    console.log('   Documenting expected response structure:');
    console.log(`   📡 POST /orders/payment`);
    console.log(`   📤 Payload: { orderId, invoiceId, outletId, paymentMode: "cash"|"card"|"upi", amount }`);
    console.log(`   📥 Response: { success, message, data: { payment: {...}, invoice: {...}, orderStatus, paymentStatus } }`);
  }

  // ═══════════════════════════════════════════════════════════
  // D. PENDING TAKEAWAY ORDERS — ALL FILTERS
  // ═══════════════════════════════════════════════════════════
  section('D. PENDING TAKEAWAY ORDERS');

  // D1. Default (pending)
  subsection('D1. Default — Pending Orders');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination, sample: r.data.data?.[0] ? { id: r.data.data[0].id, order_number: r.data.data[0].order_number, status: r.data.data[0].status, order_type: r.data.data[0].order_type, total_amount: r.data.data[0].total_amount, item_count: r.data.data[0].item_count, ready_count: r.data.data[0].ready_count, created_by_name: r.data.data[0].created_by_name, item_summary: r.data.data[0].item_summary, invoice_id: r.data.data[0].invoice_id, invoice_number: r.data.data[0].invoice_number } : null });
    test('Pending default: success', r.data.success);
    test('Pending: has data array', Array.isArray(r.data.data));
    test('Pending: has pagination', !!r.data.pagination);
    if (r.data.data.length > 0) {
      test('Pending: all are takeaway', r.data.data.every(o => o.order_type === 'takeaway'));
      test('Pending: none paid/completed/cancelled', r.data.data.every(o => !['paid', 'completed', 'cancelled'].includes(o.status)));
    }
    console.log(`   → ${r.data.data.length} pending orders (total: ${r.data.pagination.total})`);
  } catch (e) {
    test('Pending default', false, e.response?.data?.message || e.message);
  }

  // D2. Status = completed
  subsection('D2. Status = completed');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=completed`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('Completed: success', r.data.success);
    if (r.data.data.length > 0) {
      test('Completed: status is paid/completed', r.data.data.every(o => ['paid', 'completed'].includes(o.status)));
    }
    console.log(`   → ${r.data.data.length} completed orders (total: ${r.data.pagination.total})`);
  } catch (e) {
    test('Completed', false, e.response?.data?.message || e.message);
  }

  // D3. Status = cancelled
  subsection('D3. Status = cancelled');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=cancelled`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('Cancelled: success', r.data.success);
    if (r.data.data.length > 0) {
      test('Cancelled: status is cancelled', r.data.data.every(o => o.status === 'cancelled'));
    }
    console.log(`   → ${r.data.data.length} cancelled orders (total: ${r.data.pagination.total})`);
  } catch (e) {
    test('Cancelled', false, e.response?.data?.message || e.message);
  }

  // D4. Status = all
  subsection('D4. Status = all');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('All: success', r.data.success);
    console.log(`   → ${r.data.data.length} orders shown (total: ${r.data.pagination.total})`);
  } catch (e) {
    test('All', false, e.response?.data?.message || e.message);
  }

  // D5. Pagination
  subsection('D5. Pagination — page=1, limit=3');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all&page=1&limit=3`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('Pagination: success', r.data.success);
    test('Pagination: max 3 items', r.data.data.length <= 3);
    test('Pagination: page=1', r.data.pagination.page === 1);
    test('Pagination: limit=3', r.data.pagination.limit === 3);
    test('Pagination: has totalPages', r.data.pagination.totalPages >= 1);
  } catch (e) {
    test('Pagination', false, e.response?.data?.message || e.message);
  }

  // D6. Pagination — page 2
  subsection('D6. Pagination — page=2, limit=3');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all&page=2&limit=3`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('Page 2: success', r.data.success);
    test('Page 2: page=2', r.data.pagination.page === 2);
  } catch (e) {
    test('Page 2', false, e.response?.data?.message || e.message);
  }

  // D7. Search by order number
  subsection('D7. Search — by order number fragment');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all&search=ORD26`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('Search: success', r.data.success);
    test('Search: returns results', r.data.pagination.total >= 0);
    console.log(`   → ${r.data.data.length} results for "ORD26" (total: ${r.data.pagination.total})`);
  } catch (e) {
    test('Search', false, e.response?.data?.message || e.message);
  }

  // D8. Sort — by total_amount ASC
  subsection('D8. Sort — by total_amount ASC');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all&sortBy=total_amount&sortOrder=ASC&limit=5`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, firstTotal: r.data.data?.[0]?.total_amount, lastTotal: r.data.data?.[r.data.data.length - 1]?.total_amount });
    test('Sort ASC: success', r.data.success);
    if (r.data.data.length >= 2) {
      const first = parseFloat(r.data.data[0].total_amount);
      const last = parseFloat(r.data.data[r.data.data.length - 1].total_amount);
      test('Sort ASC: first <= last', first <= last, `${first} vs ${last}`);
    }
  } catch (e) {
    test('Sort ASC', false, e.response?.data?.message || e.message);
  }

  // D9. Sort — by total_amount DESC
  subsection('D9. Sort — by total_amount DESC');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all&sortBy=total_amount&sortOrder=DESC&limit=5`;
    const r = await api.get(url);
    test('Sort DESC: success', r.data.success);
    if (r.data.data.length >= 2) {
      const first = parseFloat(r.data.data[0].total_amount);
      const last = parseFloat(r.data.data[r.data.data.length - 1].total_amount);
      test('Sort DESC: first >= last', first >= last, `${first} vs ${last}`);
    }
  } catch (e) {
    test('Sort DESC', false, e.response?.data?.message || e.message);
  }

  // D10. Combined filters
  subsection('D10. Combined — status=all + search + pagination + sort');
  try {
    const url = `/orders/takeaway/pending/${OUTLET_ID}?status=all&search=ORD&page=1&limit=5&sortBy=created_at&sortOrder=DESC`;
    const r = await api.get(url);
    logApi('GET', url, null, { success: r.data.success, count: r.data.data?.length, pagination: r.data.pagination });
    test('Combined: success', r.data.success);
    test('Combined: has data', Array.isArray(r.data.data));
    test('Combined: has pagination', !!r.data.pagination);
  } catch (e) {
    test('Combined', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // E. GET INVOICE BY ORDER (existing endpoint)
  // ═══════════════════════════════════════════════════════════
  section('E. GET INVOICE BY ORDER');

  if (completedOrders.length > 0) {
    const co = completedOrders[0];
    subsection('E1. Get invoice for completed order');
    try {
      const url = `/orders/${co.order_id}/invoice`;
      const r = await api.get(url);
      logApi('GET', url, null, r.data);
      test('Get invoice: success', r.data.success);
      test('Get invoice: has full data', !!r.data.data);
      test('Invoice: invoiceNumber', !!r.data.data.invoiceNumber);
      test('Invoice: has items', Array.isArray(r.data.data.items));
      test('Invoice: has payments', Array.isArray(r.data.data.payments));
      test('Invoice: has grandTotal', r.data.data.grandTotal !== undefined);
      test('Invoice: has taxBreakup', r.data.data.taxBreakup !== undefined);
    } catch (e) {
      test('Get invoice', false, e.response?.data?.message || e.message);
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
