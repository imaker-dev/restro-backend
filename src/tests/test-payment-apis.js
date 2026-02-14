/**
 * Comprehensive Payment API Test
 * Tests: full payment, partial payment, UPI/card with optional fields,
 *        table release, KOT served, invoice in response, discount cap
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

async function findBilledOrder() {
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.subtotal, o.total_amount, o.table_id,
            o.table_session_id, o.order_type, o.paid_amount, o.due_amount,
            i.id as invoice_id, i.grand_total as invoice_total
     FROM orders o
     LEFT JOIN invoices i ON i.order_id = o.id AND i.is_cancelled = 0
     WHERE o.outlet_id = ? AND o.status = 'billed' AND i.id IS NOT NULL
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );
  return rows[0] || null;
}

async function findPendingOrder() {
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.subtotal, o.total_amount,
            o.table_id, o.order_type
     FROM orders o
     WHERE o.outlet_id = ? AND o.status NOT IN ('paid', 'completed', 'cancelled')
       AND o.subtotal > 100
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );
  return rows[0] || null;
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PAYMENT API — Comprehensive Test                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  pool = getPool();
  api = await login('admin@restropos.com', 'admin123');

  // ══════════════════════════════════════════════════════════════
  // A. UPI PAYMENT — all optional fields omitted
  // ══════════════════════════════════════════════════════════════
  section('A. UPI Payment — optional fields omitted');
  const pendingOrder = await findPendingOrder();
  if (!pendingOrder) {
    console.log('   ⚠ No pending order found — skipping some tests');
  } else {
    console.log(`   Order: ${pendingOrder.order_number} (id=${pendingOrder.id}, subtotal=${pendingOrder.subtotal})`);

    // Generate bill first
    try {
      await api.post(`/orders/${pendingOrder.id}/bill`);
    } catch (e) { /* may already exist */ }

    // Get invoice
    const [inv] = await pool.query(
      'SELECT id, grand_total FROM invoices WHERE order_id = ? AND is_cancelled = 0',
      [pendingOrder.id]
    );
    const invoiceId = inv[0]?.id;
    const grandTotal = parseFloat(inv[0]?.grand_total || pendingOrder.total_amount);

    // Pay partial (50%) with UPI — NO optional fields
    const partialAmount = Math.floor(grandTotal / 2);
    const upiPayload = {
      orderId: pendingOrder.id,
      invoiceId,
      paymentMode: 'upi',
      amount: partialAmount
    };
    log('Payload (no optional fields)', upiPayload);

    try {
      const r = await api.post('/orders/payment', upiPayload);
      test('UPI partial: 200', r.status === 200);
      test('success = true', r.data.success === true);
      test('paymentStatus = partial', r.data.data.paymentStatus === 'partial');
      test('message includes "Partial"', r.data.message.includes('Partial'));
      test('message includes due amount', r.data.message.includes('₹'));

      // Check detailed response structure
      const d = r.data.data;
      test('Has payment object', !!d.payment);
      test('Has invoice object', !!d.invoice);
      test('Has order object', !!d.order);
      test('Has paymentSummary', !!d.paymentSummary);
      test('paymentSummary.dueAmount > 0', d.paymentSummary.dueAmount > 0);
      test('paymentSummary.totalPaid > 0', d.paymentSummary.totalPaid > 0);
      test('order.orderNumber present', !!d.order.orderNumber);
      test('invoice.grandTotal present', d.invoice?.grandTotal > 0);

      log('Payment Summary', d.paymentSummary);
      log('Order', d.order);
    } catch (e) {
      test('UPI partial payment', false, e.response?.data?.message || e.message);
    }

    // ══════════════════════════════════════════════════════════════
    // B. CARD PAYMENT — with optional fields
    // ══════════════════════════════════════════════════════════════
    section('B. Card payment — with optional fields (complete payment)');
    const remaining = grandTotal - partialAmount;
    const cardPayload = {
      orderId: pendingOrder.id,
      invoiceId,
      paymentMode: 'card',
      amount: remaining,
      cardLastFour: '4242',
      cardType: 'visa',
      transactionId: 'TXN-CARD-001',
      referenceNumber: 'REF-001',
      bankName: 'HDFC'
    };
    log('Payload', cardPayload);

    try {
      const r = await api.post('/orders/payment', cardPayload);
      test('Card full: 200', r.status === 200);
      test('paymentStatus = completed', r.data.data.paymentStatus === 'completed');
      test('orderStatus = completed', r.data.data.orderStatus === 'completed');
      test('message includes "fully paid"', r.data.message.includes('fully paid'));
      test('message includes "Table released"', r.data.message.includes('Table released'));
      test('message includes "KOTs served"', r.data.message.includes('KOTs served'));

      const d = r.data.data;
      test('paymentSummary.dueAmount = 0', d.paymentSummary.dueAmount === 0);
      test('paymentSummary.paymentCount = 2', d.paymentSummary.paymentCount === 2);
      test('invoice present in completed response', !!d.invoice);

      // Check card fields persisted
      test('cardLastFour = 4242', d.payment.cardLastFour === '4242');
      test('cardType = visa', d.payment.cardType === 'visa');
      test('transactionId persisted', d.payment.transactionId === 'TXN-CARD-001');
      test('referenceNumber persisted', d.payment.referenceNumber === 'REF-001');

      log('Payment Summary', d.paymentSummary);
    } catch (e) {
      test('Card full payment', false, e.response?.data?.message || e.message);
    }

    // ══════════════════════════════════════════════════════════════
    // C. TABLE RELEASED + KOTs SERVED
    // ══════════════════════════════════════════════════════════════
    section('C. Verify table released + KOTs served');
    if (pendingOrder.table_id) {
      const [tbl] = await pool.query('SELECT status FROM tables WHERE id = ?', [pendingOrder.table_id]);
      test('Table status = available', tbl[0]?.status === 'available', `got ${tbl[0]?.status}`);
    } else {
      console.log('   ⚠ Order has no table — skipping table check');
    }

    // Check KOTs
    const [kots] = await pool.query(
      "SELECT id, status FROM kot_tickets WHERE order_id = ? AND status != 'cancelled'",
      [pendingOrder.id]
    );
    const allServed = kots.every(k => k.status === 'served');
    test(`All KOTs served (${kots.length} KOTs)`, kots.length === 0 || allServed,
      kots.map(k => `KOT#${k.id}=${k.status}`).join(', '));

    // Check order items
    const [items] = await pool.query(
      "SELECT id, status FROM order_items WHERE order_id = ? AND status != 'cancelled'",
      [pendingOrder.id]
    );
    const allItemsServed = items.every(i => i.status === 'served');
    test(`All items served (${items.length} items)`, items.length === 0 || allItemsServed,
      items.map(i => `#${i.id}=${i.status}`).join(', '));

    // ══════════════════════════════════════════════════════════════
    // D. ALREADY PAID — should fail
    // ══════════════════════════════════════════════════════════════
    section('D. Already paid order — should reject');
    try {
      await api.post('/orders/payment', {
        orderId: pendingOrder.id,
        paymentMode: 'cash',
        amount: 100
      });
      test('Already paid: should fail', false);
    } catch (e) {
      test('Already paid: 400', e.response?.status === 400);
      log('Error', e.response?.data?.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // E. CASH PAYMENT — minimal payload
  // ══════════════════════════════════════════════════════════════
  section('E. Cash payment — minimal payload');
  const billedOrder = await findBilledOrder();
  if (billedOrder) {
    console.log(`   Billed order: ${billedOrder.order_number} (id=${billedOrder.id}, total=${billedOrder.invoice_total})`);
    const cashPayload = {
      orderId: billedOrder.id,
      invoiceId: billedOrder.invoice_id,
      paymentMode: 'cash',
      amount: parseFloat(billedOrder.invoice_total)
    };
    log('Payload', cashPayload);
    try {
      const r = await api.post('/orders/payment', cashPayload);
      test('Cash full payment: 200', r.status === 200);
      test('paymentStatus = completed', r.data.data.paymentStatus === 'completed');
      test('Has full response structure', !!r.data.data.paymentSummary && !!r.data.data.invoice);
      log('Message', r.data.message);
    } catch (e) {
      test('Cash full payment', false, e.response?.data?.message || e.message);
    }
  } else {
    console.log('   ⚠ No billed order found — skipping cash payment test');
  }

  // ══════════════════════════════════════════════════════════════
  // F. DISCOUNT EXCEEDS SUBTOTAL — should error properly
  // ══════════════════════════════════════════════════════════════
  section('F. Discount exceeds subtotal — proper error');
  const [discOrder] = await pool.query(
    `SELECT id, order_number, subtotal FROM orders
     WHERE outlet_id = ? AND status NOT IN ('paid', 'completed', 'cancelled') AND subtotal > 0
     ORDER BY created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );
  if (discOrder[0]) {
    const o = discOrder[0];
    const st = parseFloat(o.subtotal);
    console.log(`   Order: ${o.order_number} (subtotal=${st})`);

    // Clean existing discounts
    await pool.query('DELETE FROM order_discounts WHERE order_id = ?', [o.id]);
    const orderSvc = require('../services/order.service');
    await orderSvc.recalculateTotals(o.id);

    // Apply discount = subtotal (should work)
    try {
      const r = await api.post(`/orders/${o.id}/discount`, {
        discountName: 'Full subtotal discount',
        discountType: 'flat',
        discountValue: st
      });
      test(`Flat = subtotal (₹${st}): OK`, r.status === 200);
      const discId = r.data.data.appliedDiscount.id;

      // Now try to add another discount on top — should fail (exceeds subtotal)
      try {
        await api.post(`/orders/${o.id}/discount`, {
          discountName: 'Extra',
          discountType: 'flat',
          discountValue: 1
        });
        test('Extra discount after max: should fail', false);
      } catch (e2) {
        test('Extra discount rejected: 400', e2.response?.status === 400);
        test('Error mentions "exceeds"', e2.response?.data?.message?.toLowerCase().includes('exceed'));
        log('Error', e2.response?.data?.message);
      }

      // Clean up
      await api.delete(`/orders/${o.id}/discount/${discId}`);
    } catch (e) {
      test('Discount = subtotal', false, e.response?.data?.message || e.message);
    }

    // Percentage 100% then try more
    try {
      const r = await api.post(`/orders/${o.id}/discount`, {
        discountName: '100% off',
        discountType: 'percentage',
        discountValue: 100
      });
      test('100% discount: OK', r.status === 200);
      const discId = r.data.data.appliedDiscount.id;

      try {
        await api.post(`/orders/${o.id}/discount`, {
          discountName: 'More',
          discountType: 'flat',
          discountValue: 10
        });
        test('Extra after 100%: should fail', false);
      } catch (e2) {
        test('Extra after 100%: rejected', e2.response?.status === 400);
        log('Error', e2.response?.data?.message);
      }

      await api.delete(`/orders/${o.id}/discount/${discId}`);
    } catch (e) {
      test('100% discount', false, e.response?.data?.message || e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // G. VALIDATION — payment fields optional
  // ══════════════════════════════════════════════════════════════
  section('G. Validation — all payment detail fields optional');

  // Minimal UPI — no transactionId, upiId, reference etc
  const minPayload = {
    orderId: 999999,
    paymentMode: 'upi',
    amount: 100
  };
  try {
    await api.post('/orders/payment', minPayload);
  } catch (e) {
    // Will fail with "not found" but NOT validation error
    test('Minimal UPI payload: no validation error', e.response?.status !== 422,
      `got ${e.response?.status}: ${e.response?.data?.message}`);
  }

  // Minimal card — no cardLastFour, cardType etc
  const minCard = {
    orderId: 999999,
    paymentMode: 'card',
    amount: 100
  };
  try {
    await api.post('/orders/payment', minCard);
  } catch (e) {
    test('Minimal card payload: no validation error', e.response?.status !== 422,
      `got ${e.response?.status}: ${e.response?.data?.message}`);
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
