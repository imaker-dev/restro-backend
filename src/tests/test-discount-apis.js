/**
 * Comprehensive Discount API Test
 * Tests: manual discount (% & flat), code-based discount, remove discount,
 *        get discounts, invoice recalculation, validation, edge cases
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

async function findActiveOrder() {
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.subtotal, o.discount_amount, o.order_type
     FROM orders o
     WHERE o.outlet_id = ? AND o.status NOT IN ('paid', 'completed', 'cancelled')
       AND o.subtotal > 0
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );
  return rows[0] || null;
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  DISCOUNT API — Comprehensive Test                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  pool = getPool();
  api = await login('admin@restropos.com', 'admin123');

  const order = await findActiveOrder();
  if (!order) { console.log('⚠ No active order with items found. Cannot test.'); process.exit(1); }
  console.log(`\n   Test order: ${order.order_number} (id=${order.id}, subtotal=${order.subtotal}, status=${order.status})`);

  // Clean up any existing discounts on test order
  await pool.query('DELETE FROM order_discounts WHERE order_id = ?', [order.id]);
  const { recalculateTotals } = require('../services/order.service');
  await recalculateTotals(order.id);

  const subtotal = parseFloat(order.subtotal);

  // ══════════════════════════════════════════════════════════════
  // A. GET DISCOUNTS — empty initially
  // ══════════════════════════════════════════════════════════════
  section('A. GET /orders/:id/discounts — empty');
  try {
    const r = await api.get(`/orders/${order.id}/discounts`);
    test('GET discounts: 200', r.status === 200);
    test('discountCount = 0', r.data.data.discountCount === 0);
    test('totalDiscount = 0', r.data.data.totalDiscount === 0);
    log('Response', r.data.data);
  } catch (e) {
    test('GET discounts', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // B. APPLY PERCENTAGE DISCOUNT (manual)
  // ══════════════════════════════════════════════════════════════
  section('B. POST /orders/:id/discount — percentage 10%');
  let percentDiscountId;
  const pctPayload = {
    discountName: 'Festival Offer 10%',
    discountType: 'percentage',
    discountValue: 10,
    appliedOn: 'subtotal'
  };
  log('Payload', pctPayload);
  try {
    const r = await api.post(`/orders/${order.id}/discount`, pctPayload);
    test('Apply 10% discount: 200', r.status === 200);
    test('success = true', r.data.success === true);
    const ad = r.data.data.appliedDiscount;
    percentDiscountId = ad.id;
    const expectedAmt = parseFloat((subtotal * 0.1).toFixed(2));
    test(`discountAmount = ${expectedAmt}`, ad.discountAmount === expectedAmt, `got ${ad.discountAmount}`);
    test('discountType = percentage', ad.discountType === 'percentage');
    test('order.discount_amount updated', parseFloat(r.data.data.order.discount_amount) === expectedAmt);
    log('Applied Discount', ad);
    log('Order totals', {
      subtotal: r.data.data.order.subtotal,
      discount_amount: r.data.data.order.discount_amount,
      total_amount: r.data.data.order.total_amount
    });
  } catch (e) {
    test('Apply 10% discount', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // C. APPLY FLAT DISCOUNT (manual)
  // ══════════════════════════════════════════════════════════════
  section('C. POST /orders/:id/discount — flat ₹50');
  let flatDiscountId;
  const flatPayload = {
    discountName: 'Manager Special ₹50',
    discountType: 'flat',
    discountValue: 50,
    appliedOn: 'subtotal'
  };
  log('Payload', flatPayload);
  try {
    const r = await api.post(`/orders/${order.id}/discount`, flatPayload);
    test('Apply ₹50 flat discount: 200', r.status === 200);
    const ad = r.data.data.appliedDiscount;
    flatDiscountId = ad.id;
    const expectedFlat = Math.min(50, subtotal);
    test(`discountAmount = ${expectedFlat}`, ad.discountAmount === expectedFlat, `got ${ad.discountAmount}`);
    test('discountType = flat', ad.discountType === 'flat');
    log('Applied Discount', ad);
  } catch (e) {
    test('Apply ₹50 flat discount', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // D. GET DISCOUNTS — should have 2 now
  // ══════════════════════════════════════════════════════════════
  section('D. GET /orders/:id/discounts — 2 discounts');
  try {
    const r = await api.get(`/orders/${order.id}/discounts`);
    test('discountCount = 2', r.data.data.discountCount === 2);
    const pctAmt = parseFloat((subtotal * 0.1).toFixed(2));
    const expectedTotal = pctAmt + Math.min(50, subtotal);
    test(`totalDiscount = ${expectedTotal}`, r.data.data.totalDiscount === expectedTotal, `got ${r.data.data.totalDiscount}`);
    log('Discounts summary', {
      count: r.data.data.discountCount,
      total: r.data.data.totalDiscount,
      discounts: r.data.data.discounts.map(d => `${d.discountName} (${d.discountType} ${d.discountValue}) = ₹${d.discountAmount}`)
    });
  } catch (e) {
    test('GET 2 discounts', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // E. GENERATE BILL — verify discount reflected in invoice
  // ══════════════════════════════════════════════════════════════
  section('E. POST /orders/:id/bill — with discounts');
  try {
    const r = await api.post(`/orders/${order.id}/bill`);
    test('Generate bill: 200', r.status === 200);
    const inv = r.data.data;
    test('Invoice has discount', inv.discountAmount > 0, `discountAmount=${inv.discountAmount}`);
    test('Service charge = 0', inv.serviceCharge === 0);
    log('Invoice', {
      invoiceNumber: inv.invoiceNumber,
      subtotal: inv.subtotal,
      discountAmount: inv.discountAmount,
      taxableAmount: inv.taxableAmount,
      totalTax: inv.totalTax,
      grandTotal: inv.grandTotal
    });
  } catch (e) {
    test('Generate bill', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // F. REMOVE FLAT DISCOUNT — invoice should recalculate
  // ══════════════════════════════════════════════════════════════
  section('F. DELETE /orders/:id/discount/:discountId — remove flat');
  if (flatDiscountId) {
    try {
      const r = await api.delete(`/orders/${order.id}/discount/${flatDiscountId}`);
      test('Remove flat discount: 200', r.status === 200);
      test('success = true', r.data.success === true);
      const rd = r.data.data.removedDiscount;
      test('removedDiscount.discountName = Manager Special ₹50', rd.discountName === 'Manager Special ₹50');
      test('removedDiscount.discountAmount = 50', rd.discountAmount === 50, `got ${rd.discountAmount}`);
      const pctAmt = parseFloat((subtotal * 0.1).toFixed(2));
      test('order.discount_amount updated to pct only', parseFloat(r.data.data.order.discount_amount) === pctAmt,
        `got ${r.data.data.order.discount_amount}`);
      log('Removed Discount', rd);
      log('Order totals after removal', {
        subtotal: r.data.data.order.subtotal,
        discount_amount: r.data.data.order.discount_amount,
        total_amount: r.data.data.order.total_amount
      });
    } catch (e) {
      test('Remove flat discount', false, e.response?.data?.message || e.message);
    }

    // Verify invoice was recalculated
    try {
      const [inv] = await pool.query(
        'SELECT discount_amount, grand_total FROM invoices WHERE order_id = ? AND is_cancelled = 0',
        [order.id]
      );
      if (inv[0]) {
        const pctAmt = parseFloat((subtotal * 0.1).toFixed(2));
        test('Invoice discount_amount recalculated', parseFloat(inv[0].discount_amount) === pctAmt,
          `got ${inv[0].discount_amount}`);
        log('Invoice after remove', inv[0]);
      }
    } catch (e) {
      test('Invoice recalc check', false, e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // G. REMOVE PERCENTAGE DISCOUNT — order back to original
  // ══════════════════════════════════════════════════════════════
  section('G. Remove percentage discount — order back to original');
  if (percentDiscountId) {
    try {
      const r = await api.delete(`/orders/${order.id}/discount/${percentDiscountId}`);
      test('Remove pct discount: 200', r.status === 200);
      test('order.discount_amount = 0', parseFloat(r.data.data.order.discount_amount) === 0,
        `got ${r.data.data.order.discount_amount}`);
      log('Order totals after all discounts removed', {
        subtotal: r.data.data.order.subtotal,
        discount_amount: r.data.data.order.discount_amount,
        total_amount: r.data.data.order.total_amount
      });
    } catch (e) {
      test('Remove pct discount', false, e.response?.data?.message || e.message);
    }

    // Verify invoice recalculated with no discount
    try {
      const [inv] = await pool.query(
        'SELECT discount_amount, grand_total FROM invoices WHERE order_id = ? AND is_cancelled = 0',
        [order.id]
      );
      if (inv[0]) {
        test('Invoice discount = 0 after all removed', parseFloat(inv[0].discount_amount) === 0,
          `got ${inv[0].discount_amount}`);
      }
    } catch (e) {
      test('Invoice recalc after all removed', false, e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // H. CODE DISCOUNT — min order validation
  // ══════════════════════════════════════════════════════════════
  section('H. Code discount — min order amount validation');
  // WELCOME10 requires min ₹500. Current order subtotal may be < 500
  if (subtotal < 500) {
    try {
      await api.post(`/orders/${order.id}/discount/code`, { discountCode: 'WELCOME10' });
      test('WELCOME10 below min: should reject', false);
    } catch (e) {
      test('WELCOME10 below min: correctly rejected', e.response?.status === 400);
      test('Error mentions minimum', e.response?.data?.message?.includes('Minimum'));
      log('Error', e.response?.data?.message);
    }
  }

  // Find an order with subtotal >= 500 for code discount tests
  const [bigOrders] = await pool.query(
    `SELECT o.id, o.order_number, o.subtotal, o.status
     FROM orders o
     WHERE o.outlet_id = ? AND o.status NOT IN ('paid', 'completed', 'cancelled')
       AND o.subtotal >= 500
     ORDER BY o.created_at DESC LIMIT 1`,
    [OUTLET_ID]
  );

  const codeOrder = bigOrders[0] || null;
  if (codeOrder) {
    console.log(`\n   Code test order: ${codeOrder.order_number} (id=${codeOrder.id}, subtotal=${codeOrder.subtotal})`);
    // Clean old code discounts on this order
    await pool.query('DELETE FROM order_discounts WHERE order_id = ? AND discount_code IS NOT NULL', [codeOrder.id]);
    await recalculateTotals(codeOrder.id);

    // Apply WELCOME10
    section('H2. Apply WELCOME10 on qualifying order');
    try {
      const r = await api.post(`/orders/${codeOrder.id}/discount/code`, { discountCode: 'WELCOME10' });
      test('Apply WELCOME10: 200', r.status === 200);
      const ad = r.data.data.appliedDiscount;
      test('discountCode = WELCOME10', ad.discountCode === 'WELCOME10');
      test('discountType = percentage', ad.discountType === 'percentage');
      test('discountValue = 10', ad.discountValue === 10);
      log('Applied Code Discount', ad);
    } catch (e) {
      test('Apply WELCOME10', false, e.response?.data?.message || e.message);
    }

    // Duplicate code — should fail
    section('I. Duplicate code — should fail');
    try {
      await api.post(`/orders/${codeOrder.id}/discount/code`, { discountCode: 'WELCOME10' });
      test('Duplicate code: should 400', false);
    } catch (e) {
      test('Duplicate code: 400', e.response?.status === 400);
      test('Error msg contains "already"', e.response?.data?.message?.includes('already'));
      log('Error', e.response?.data?.message);
    }

    // Remove code discount — usage count decrements
    section('J. Remove code discount — usage count decrements');
    const [codeDiscs] = await pool.query(
      'SELECT od.id, d.usage_count as before_count FROM order_discounts od LEFT JOIN discounts d ON od.discount_id = d.id WHERE od.order_id = ? AND od.discount_code = ?',
      [codeOrder.id, 'WELCOME10']
    );
    if (codeDiscs[0]) {
      const beforeCount = codeDiscs[0].before_count;
      try {
        const r = await api.delete(`/orders/${codeOrder.id}/discount/${codeDiscs[0].id}`);
        test('Remove code discount: 200', r.status === 200);
        test('removedDiscount.discountCode = WELCOME10', r.data.data.removedDiscount.discountCode === 'WELCOME10');
        const [d] = await pool.query('SELECT usage_count FROM discounts WHERE code = ?', ['WELCOME10']);
        test('usage_count decremented', d[0].usage_count < beforeCount,
          `before=${beforeCount}, after=${d[0].usage_count}`);
      } catch (e) {
        test('Remove code discount', false, e.response?.data?.message || e.message);
      }
    }
  } else {
    console.log('\n   ⚠ No order with subtotal >= ₹500 found — skipping code discount apply/remove tests');
  }

  // ══════════════════════════════════════════════════════════════
  // K. VALIDATION — edge cases
  // ══════════════════════════════════════════════════════════════
  section('K. Validation edge cases');

  // Percentage > 100
  try {
    await api.post(`/orders/${order.id}/discount`, {
      discountName: 'Over 100', discountType: 'percentage', discountValue: 150
    });
    test('Pct > 100: should fail', false);
  } catch (e) {
    test('Pct > 100: rejected', e.response?.status === 400 || e.response?.data?.message?.includes('100%'));
    log('Error', e.response?.data?.message);
  }

  // Flat > subtotal
  try {
    const r = await api.post(`/orders/${order.id}/discount`, {
      discountName: 'Huge Flat', discountType: 'flat', discountValue: subtotal + 1000
    });
    // Should succeed but cap at subtotal
    test('Flat > subtotal: capped', r.data.data.appliedDiscount.discountAmount <= subtotal);
    log('Capped amount', r.data.data.appliedDiscount.discountAmount);
    // Clean up
    if (r.data.data.appliedDiscount.id) {
      await api.delete(`/orders/${order.id}/discount/${r.data.data.appliedDiscount.id}`);
    }
  } catch (e) {
    // If fails due to exceeding, that's also valid
    test('Flat > subtotal: handled', e.response?.status === 400);
    log('Error', e.response?.data?.message);
  }

  // Invalid discount code
  try {
    await api.post(`/orders/${order.id}/discount/code`, { discountCode: 'NONEXISTENT999' });
    test('Invalid code: should fail', false);
  } catch (e) {
    test('Invalid code: 400', e.response?.status === 400);
    log('Error', e.response?.data?.message);
  }

  // Remove non-existent discount
  try {
    await api.delete(`/orders/${order.id}/discount/999999`);
    test('Remove non-existent: should fail', false);
  } catch (e) {
    test('Remove non-existent: 404', e.response?.status === 404);
    log('Error', e.response?.data?.message);
  }

  // Get discounts for non-existent order
  try {
    await api.get(`/orders/999999/discounts`);
    test('Get discounts 999999: should fail', false);
  } catch (e) {
    test('Get discounts 999999: 404', e.response?.status === 404);
  }

  // Apply to paid order
  const [paidOrders] = await pool.query(
    "SELECT id FROM orders WHERE outlet_id = ? AND status = 'paid' LIMIT 1",
    [OUTLET_ID]
  );
  if (paidOrders[0]) {
    try {
      await api.post(`/orders/${paidOrders[0].id}/discount`, {
        discountName: 'Test', discountType: 'flat', discountValue: 10
      });
      test('Discount on paid order: should fail', false);
    } catch (e) {
      test('Discount on paid order: 400', e.response?.status === 400);
      log('Error', e.response?.data?.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // L. FLAT100 CODE — min order validation (requires ₹1000)
  // ══════════════════════════════════════════════════════════════
  section('L. FLAT100 — min order validation');
  try {
    await api.post(`/orders/${order.id}/discount/code`, { discountCode: 'FLAT100' });
    if (subtotal >= 1000) {
      test('FLAT100 applied (subtotal >= 1000)', true);
      const [d] = await pool.query('SELECT id FROM order_discounts WHERE order_id = ? AND discount_code = ?', [order.id, 'FLAT100']);
      if (d[0]) await api.delete(`/orders/${order.id}/discount/${d[0].id}`);
    } else {
      test('FLAT100: should have been rejected', false);
    }
  } catch (e) {
    if (subtotal < 1000) {
      test('FLAT100 below min: correctly rejected', e.response?.status === 400);
      log('Error', e.response?.data?.message);
    } else {
      test('Apply FLAT100', false, e.response?.data?.message || e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // M. FULL LIFECYCLE — apply, bill, remove, verify bill restores
  // ══════════════════════════════════════════════════════════════
  section('M. Full lifecycle: apply → bill → remove → bill restores');

  // Get current invoice state (should have no discount now)
  const [invBefore] = await pool.query(
    'SELECT id, discount_amount, grand_total FROM invoices WHERE order_id = ? AND is_cancelled = 0',
    [order.id]
  );
  const gtBefore = invBefore[0] ? parseFloat(invBefore[0].grand_total) : null;
  log('Invoice before discount', invBefore[0] || 'none');

  // Apply 15% discount
  let lifecycleDiscId;
  try {
    const r = await api.post(`/orders/${order.id}/discount`, {
      discountName: 'Lifecycle Test 15%',
      discountType: 'percentage',
      discountValue: 15
    });
    lifecycleDiscId = r.data.data.appliedDiscount.id;
    test('Lifecycle: discount applied', r.data.success);
    log('Discount applied', r.data.data.appliedDiscount);
  } catch (e) {
    test('Lifecycle: apply', false, e.response?.data?.message || e.message);
  }

  // Check invoice recalculated with discount
  if (invBefore[0]) {
    const [invAfter] = await pool.query(
      'SELECT discount_amount, grand_total FROM invoices WHERE id = ?',
      [invBefore[0].id]
    );
    test('Invoice grand_total decreased', parseFloat(invAfter[0].grand_total) < gtBefore,
      `before=${gtBefore}, after=${invAfter[0].grand_total}`);
    test('Invoice discount_amount > 0', parseFloat(invAfter[0].discount_amount) > 0);
    log('Invoice with discount', invAfter[0]);
  }

  // Remove discount
  if (lifecycleDiscId) {
    try {
      const r = await api.delete(`/orders/${order.id}/discount/${lifecycleDiscId}`);
      test('Lifecycle: discount removed', r.data.success);
    } catch (e) {
      test('Lifecycle: remove', false, e.response?.data?.message || e.message);
    }

    // Verify invoice restored to original
    if (invBefore[0]) {
      const [invRestored] = await pool.query(
        'SELECT discount_amount, grand_total FROM invoices WHERE id = ?',
        [invBefore[0].id]
      );
      test('Invoice grand_total restored', parseFloat(invRestored[0].grand_total) === gtBefore,
        `expected=${gtBefore}, got=${invRestored[0].grand_total}`);
      test('Invoice discount_amount = 0', parseFloat(invRestored[0].discount_amount) === 0,
        `got ${invRestored[0].discount_amount}`);
      log('Invoice restored', invRestored[0]);
    }
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
