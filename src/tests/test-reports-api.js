/**
 * Reports API — Comprehensive Test
 * Tests: dashboard, daily-sales, daily-sales/detail, item-sales, category-sales,
 *        payment-modes, tax, cancellations — with cross-verification
 */

require('dotenv').config();
const axios = require('axios');
const { initializeDatabase, getPool } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const START = '2026-02-01';
const END = '2026-02-12';

let passed = 0, failed = 0, api, pool;

function section(t) { console.log(`\n${'═'.repeat(70)}\n  ${t}\n${'═'.repeat(70)}`); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}
function log(label, val) { console.log(`   ${label}:`, typeof val === 'object' ? JSON.stringify(val, null, 2).split('\n').join('\n   ') : val); }
function close(a, b, tol = 1) { return Math.abs(a - b) <= tol; }

async function login(email, password) {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  const token = res.data.data.accessToken || res.data.data.token;
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  REPORTS API — Comprehensive Verification                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  pool = getPool();
  api = await login('admin@restropos.com', 'admin123');

  // Get raw DB numbers for cross-verification
  const [rawOrders] = await pool.query(
    `SELECT COUNT(*) as cnt,
      SUM(CASE WHEN status != 'cancelled' THEN subtotal ELSE 0 END) as gross,
      SUM(CASE WHEN status IN ('paid','completed') THEN total_amount ELSE 0 END) as net,
      SUM(CASE WHEN status != 'cancelled' THEN tax_amount ELSE 0 END) as tax,
      SUM(CASE WHEN status != 'cancelled' THEN discount_amount ELSE 0 END) as disc,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
     FROM orders WHERE outlet_id=? AND DATE(created_at) BETWEEN ? AND ?`,
    [OUTLET_ID, START, END]
  );
  const raw = rawOrders[0];
  console.log(`\n   Raw DB: ${raw.cnt} orders, gross=${raw.gross}, net=${raw.net}, tax=${raw.tax}, disc=${raw.disc}, cancelled=${raw.cancelled}`);

  const [rawPay] = await pool.query(
    `SELECT SUM(total_amount) as total, SUM(tip_amount) as tips
     FROM payments WHERE outlet_id=? AND DATE(created_at) BETWEEN ? AND ? AND status='completed'`,
    [OUTLET_ID, START, END]
  );
  console.log(`   Raw payments: total=${rawPay[0].total}, tips=${rawPay[0].tips}`);

  const [rawInv] = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(total_tax) as tax, SUM(grand_total) as grand
     FROM invoices WHERE outlet_id=? AND DATE(created_at) BETWEEN ? AND ? AND is_cancelled=0`,
    [OUTLET_ID, START, END]
  );
  console.log(`   Raw invoices: ${rawInv[0].cnt}, tax=${rawInv[0].tax}, grand=${rawInv[0].grand}`);

  // ══════════════════════════════════════════════════════════════
  // 1. DASHBOARD
  // ══════════════════════════════════════════════════════════════
  section('1. Dashboard');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/dashboard`);
    test('Dashboard: 200', r.status === 200);
    test('Has sales', !!r.data.data.sales);
    test('Has activeTables', r.data.data.activeTables !== undefined);
    test('Has pendingKots', !!r.data.data.pendingKots);
    test('Has paymentBreakdown', !!r.data.data.paymentBreakdown);
    log('Dashboard', {
      orders: r.data.data.sales?.total_orders,
      netSales: r.data.data.sales?.net_sales,
      activeTables: r.data.data.activeTables
    });
  } catch (e) {
    test('Dashboard', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // 2. DAILY SALES
  // ══════════════════════════════════════════════════════════════
  section('2. Daily Sales Report');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START}&endDate=${END}`);
    test('Daily sales: 200', r.status === 200);
    test('Is array', Array.isArray(r.data.data));

    if (r.data.data.length > 0) {
      const d = r.data.data[0];
      test('Has report_date', !!d.report_date);
      test('Has total_orders', d.total_orders !== undefined);
      test('Has gross_sales', d.gross_sales !== undefined);
      test('Has net_sales', d.net_sales !== undefined);
      test('Has tax_amount', d.tax_amount !== undefined);
      test('Has discount_amount', d.discount_amount !== undefined);
      test('Has cash_collection', d.cash_collection !== undefined);
      test('Has average_order_value', d.average_order_value !== undefined);

      // Cross-verify sum
      const apiGross = r.data.data.reduce((s, d) => s + parseFloat(d.gross_sales || 0), 0);
      const apiNet = r.data.data.reduce((s, d) => s + parseFloat(d.net_sales || 0), 0);
      test('Gross sales matches DB', close(apiGross, parseFloat(raw.gross), 2),
        `api=${apiGross.toFixed(2)}, db=${raw.gross}`);
      test('Net sales matches DB', close(apiNet, parseFloat(raw.net), 2),
        `api=${apiNet.toFixed(2)}, db=${raw.net}`);

      log('Sample day', { date: d.report_date, orders: d.total_orders, gross: d.gross_sales, net: d.net_sales });
    }
    log('Days returned', r.data.data.length);
  } catch (e) {
    test('Daily sales', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // 3. DAILY SALES DETAIL (NEW)
  // ══════════════════════════════════════════════════════════════
  section('3. Daily Sales Detail (NEW)');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/daily-sales/detail?startDate=${START}&endDate=${END}`);
    test('Detail: 200', r.status === 200);
    const d = r.data.data;

    test('Has dateRange', !!d.dateRange);
    test('Has orders array', Array.isArray(d.orders));
    test('Has summary', !!d.summary);

    // Summary checks
    const s = d.summary;
    test('summary.totalOrders matches order count', s.totalOrders === d.orders.length);
    test('summary.totalOrders matches DB', s.totalOrders === parseInt(raw.cnt),
      `api=${s.totalOrders}, db=${raw.cnt}`);
    test('summary.grossSales matches DB', close(s.grossSales, parseFloat(raw.gross), 2),
      `api=${s.grossSales}, db=${raw.gross}`);
    test('summary.netSales matches DB', close(s.netSales, parseFloat(raw.net), 2),
      `api=${s.netSales}, db=${raw.net}`);
    test('summary.totalTax matches DB', close(s.totalTax, parseFloat(raw.tax), 2),
      `api=${s.totalTax}, db=${raw.tax}`);
    test('summary.totalDiscount matches DB', close(s.totalDiscount, parseFloat(raw.disc), 2),
      `api=${s.totalDiscount}, db=${raw.disc}`);
    test('summary.cancelledOrders matches DB', s.cancelledOrders === parseInt(raw.cancelled),
      `api=${s.cancelledOrders}, db=${raw.cancelled}`);
    test('summary.totalPaid close to raw', close(s.totalPaid, parseFloat(rawPay[0].total || 0), 2),
      `api=${s.totalPaid}, db=${rawPay[0].total}`);
    test('Has orderTypeBreakdown', !!s.orderTypeBreakdown);
    test('Has paymentModeBreakdown', !!s.paymentModeBreakdown);
    test('Has averageOrderValue', typeof s.averageOrderValue === 'number');

    log('Summary', s);

    // Check first order structure
    if (d.orders.length > 0) {
      const o = d.orders[0];
      test('Order has orderId', !!o.orderId);
      test('Order has orderNumber', !!o.orderNumber);
      test('Order has orderType', !!o.orderType);
      test('Order has status', !!o.status);
      test('Order has captainName field', 'captainName' in o);
      test('Order has cashierName field', 'cashierName' in o);
      test('Order has customerName field', 'customerName' in o);
      test('Order has subtotal', typeof o.subtotal === 'number');
      test('Order has taxAmount', typeof o.taxAmount === 'number');
      test('Order has totalAmount', typeof o.totalAmount === 'number');
      test('Order has paidAmount', typeof o.paidAmount === 'number');
      test('Order has createdAt', !!o.createdAt);
      test('Order has billedAt field', 'billedAt' in o);

      // Items
      test('Order has items object', !!o.items);
      test('items.active is array', Array.isArray(o.items.active));
      test('items.cancelled is array', Array.isArray(o.items.cancelled));
      test('items.activeCount is number', typeof o.items.activeCount === 'number');
      test('items.itemSubtotal is number', typeof o.items.itemSubtotal === 'number');
      test('items.itemTax is number', typeof o.items.itemTax === 'number');

      if (o.items.active.length > 0) {
        const it = o.items.active[0];
        test('Item has itemName', !!it.itemName);
        test('Item has quantity', it.quantity > 0);
        test('Item has unitPrice', typeof it.unitPrice === 'number');
        test('Item has totalPrice', typeof it.totalPrice === 'number');
        test('Item has taxAmount', typeof it.taxAmount === 'number');
        test('Item has status', !!it.status);
        test('Item has categoryName field', 'categoryName' in it);
        test('Item has stationName field', 'stationName' in it);
        test('Item has addons array', Array.isArray(it.addons));
        test('Item has taxDetails field', 'taxDetails' in it);
        test('Item has createdAt', !!it.createdAt);
      }

      // Payments
      test('Order has payments array', Array.isArray(o.payments));
      if (o.payments.length > 0) {
        const p = o.payments[0];
        test('Payment has paymentMode', !!p.paymentMode);
        test('Payment has amount', typeof p.amount === 'number');
        test('Payment has totalAmount', typeof p.totalAmount === 'number');
        test('Payment has receivedByName field', 'receivedByName' in p);
        test('Payment has createdAt', !!p.createdAt);
      }

      // Invoice
      test('Order has invoice field', 'invoice' in o);
      if (o.invoice) {
        test('Invoice has invoiceNumber', !!o.invoice.invoiceNumber);
        test('Invoice has grandTotal', typeof o.invoice.grandTotal === 'number');
        test('Invoice has totalTax', typeof o.invoice.totalTax === 'number');
        test('Invoice has taxBreakup', 'taxBreakup' in o.invoice);
        test('Invoice has paymentStatus', !!o.invoice.paymentStatus);
      }

      // Discounts
      test('Order has discounts array', Array.isArray(o.discounts));

      // Table info fields
      test('Order has tableNumber field', 'tableNumber' in o);
      test('Order has floorName field', 'floorName' in o);
      test('Order has guestCount field', 'guestCount' in o);

      log('Sample order', {
        number: o.orderNumber, type: o.orderType, status: o.status,
        captain: o.captainName, cashier: o.cashierName,
        subtotal: o.subtotal, tax: o.taxAmount, total: o.totalAmount,
        items: o.items.activeCount, payments: o.payments.length,
        invoice: o.invoice?.invoiceNumber || 'none'
      });
    }

    // Cross-verify: sum of all order subtotals (non-cancelled) should match DB gross
    const computedGross = d.orders
      .filter(o => o.status !== 'cancelled')
      .reduce((s, o) => s + o.subtotal, 0);
    test('Computed gross from orders matches summary', close(computedGross, s.grossSales, 1),
      `computed=${computedGross.toFixed(2)}, summary=${s.grossSales}`);

    // Verify order count breakdown
    const typeSum = s.orderTypeBreakdown.dine_in + s.orderTypeBreakdown.takeaway + s.orderTypeBreakdown.delivery;
    test('Order type breakdown sums to total', typeSum === s.totalOrders,
      `sum=${typeSum}, total=${s.totalOrders}`);
  } catch (e) {
    test('Daily sales detail', false, e.response?.data?.message || e.message);
    if (e.response?.data) log('Error', e.response.data);
  }

  // ══════════════════════════════════════════════════════════════
  // 4. ITEM SALES
  // ══════════════════════════════════════════════════════════════
  section('4. Item Sales Report');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/item-sales?startDate=${START}&endDate=${END}&limit=20`);
    test('Item sales: 200', r.status === 200);
    test('Is array', Array.isArray(r.data.data));

    if (r.data.data.length > 0) {
      const it = r.data.data[0];
      test('Has item_name', !!it.item_name);
      test('Has total_quantity', it.total_quantity !== undefined);
      test('Has gross_revenue', it.gross_revenue !== undefined);
      test('Has net_revenue', it.net_revenue !== undefined);
      test('Has category_name field', 'category_name' in it);
      test('Has order_count', it.order_count !== undefined);
      log('Top item', { name: it.item_name, qty: it.total_quantity, revenue: it.net_revenue });
    }
  } catch (e) {
    test('Item sales', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // 5. CATEGORY SALES
  // ══════════════════════════════════════════════════════════════
  section('5. Category Sales Report');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/category-sales?startDate=${START}&endDate=${END}`);
    test('Category sales: 200', r.status === 200);
    test('Is array', Array.isArray(r.data.data));

    if (r.data.data.length > 0) {
      const c = r.data.data[0];
      test('Has category_name', !!c.category_name);
      test('Has total_quantity', c.total_quantity !== undefined);
      test('Has net_revenue', c.net_revenue !== undefined);
      test('Has contribution_percent', c.contribution_percent !== undefined);
      test('Has order_count', c.order_count !== undefined);

      // Verify contribution percentages sum to ~100
      const totalPct = r.data.data.reduce((s, c) => s + parseFloat(c.contribution_percent), 0);
      test('Contribution % sums to ~100', close(totalPct, 100, 2), `sum=${totalPct.toFixed(2)}`);
    }
  } catch (e) {
    test('Category sales', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // 6. PAYMENT MODES
  // ══════════════════════════════════════════════════════════════
  section('6. Payment Modes Report');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/payment-modes?startDate=${START}&endDate=${END}`);
    test('Payment modes: 200', r.status === 200);
    test('Has modes array', Array.isArray(r.data.data.modes));
    test('Has summary', !!r.data.data.summary);

    const s = r.data.data.summary;
    test('summary.total_collected close to DB', close(parseFloat(s.total_collected), parseFloat(rawPay[0].total || 0), 2),
      `api=${s.total_collected}, db=${rawPay[0].total}`);
    test('summary.total_tips close to DB', close(parseFloat(s.total_tips), parseFloat(rawPay[0].tips || 0), 2),
      `api=${s.total_tips}, db=${rawPay[0].tips}`);

    if (r.data.data.modes.length > 0) {
      const m = r.data.data.modes[0];
      test('Mode has payment_mode', !!m.payment_mode);
      test('Mode has total_amount', m.total_amount !== undefined);
      test('Mode has percentage_share', m.percentage_share !== undefined);

      // Verify percentages sum to ~100
      const totalPct = r.data.data.modes.reduce((s, m) => s + parseFloat(m.percentage_share), 0);
      test('Mode % sums to ~100', close(totalPct, 100, 2), `sum=${totalPct.toFixed(2)}`);
    }
    log('Summary', s);
  } catch (e) {
    test('Payment modes', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // 7. TAX REPORT (FIXED)
  // ══════════════════════════════════════════════════════════════
  section('7. Tax Report');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/tax?startDate=${START}&endDate=${END}`);
    test('Tax report: 200', r.status === 200);
    test('Has daily array', Array.isArray(r.data.data.daily));
    test('Has taxComponents array', Array.isArray(r.data.data.taxComponents));
    test('Has summary', !!r.data.data.summary);

    const s = r.data.data.summary;
    test('summary.total_tax matches DB', close(parseFloat(s.total_tax), parseFloat(rawInv[0].tax || 0), 2),
      `api=${s.total_tax}, db=${rawInv[0].tax}`);
    test('summary.total_grand matches DB', close(parseFloat(s.total_grand), parseFloat(rawInv[0].grand || 0), 2),
      `api=${s.total_grand}, db=${rawInv[0].grand}`);
    test('summary.total_invoices matches DB', parseInt(s.total_invoices) === parseInt(rawInv[0].cnt),
      `api=${s.total_invoices}, db=${rawInv[0].cnt}`);

    // Tax components from JSON breakup
    if (r.data.data.taxComponents.length > 0) {
      const tc = r.data.data.taxComponents[0];
      test('TaxComponent has code', !!tc.code);
      test('TaxComponent has name', !!tc.name);
      test('TaxComponent has rate', typeof tc.rate === 'number');
      test('TaxComponent has taxableAmount', typeof tc.taxableAmount === 'number');
      test('TaxComponent has taxAmount', typeof tc.taxAmount === 'number');
      test('TaxComponent has invoiceCount', typeof tc.invoiceCount === 'number');

      // Note: taxComponents sum may exceed total_tax if older invoices stored generic "TAX"
      // key that overlaps with later proper CGST/SGST breakdown. The summary.total_tax
      // from invoice columns is the authoritative number.
      const componentSum = r.data.data.taxComponents.reduce((s, c) => s + c.taxAmount, 0);
      test('Tax components sum >= total_tax (includes legacy data)', componentSum >= parseFloat(s.total_tax) - 1,
        `components=${componentSum.toFixed(2)}, total=${s.total_tax}`);

      log('Tax components', r.data.data.taxComponents);
    }

    // Daily row checks
    if (r.data.data.daily.length > 0) {
      const d = r.data.data.daily[0];
      test('Daily has report_date', !!d.report_date);
      test('Daily has subtotal', d.subtotal !== undefined);
      test('Daily has discount_amount', d.discount_amount !== undefined);
      test('Daily has taxable_amount', d.taxable_amount !== undefined);
      test('Daily has total_tax', d.total_tax !== undefined);
      test('Daily has service_charge', d.service_charge !== undefined);
      test('Daily has grand_total', d.grand_total !== undefined);
    }

    log('Summary', s);
  } catch (e) {
    test('Tax report', false, e.response?.data?.message || e.message);
    if (e.response?.data) log('Error', e.response.data);
  }

  // ══════════════════════════════════════════════════════════════
  // 8. CANCELLATIONS
  // ══════════════════════════════════════════════════════════════
  section('8. Cancellations Report');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/cancellations?startDate=${START}&endDate=${END}`);
    test('Cancellations: 200', r.status === 200);
    test('Has order_cancellations', Array.isArray(r.data.data.order_cancellations));
    test('Has item_cancellations', Array.isArray(r.data.data.item_cancellations));
    test('Has summary', !!r.data.data.summary);

    const s = r.data.data.summary;
    test('summary has total_order_cancellations', typeof s.total_order_cancellations === 'number');
    test('summary has total_item_cancellations', typeof s.total_item_cancellations === 'number');
    test('summary has total_order_cancel_amount', s.total_order_cancel_amount !== undefined);
    test('summary has total_item_cancel_amount', s.total_item_cancel_amount !== undefined);

    log('Cancellation summary', s);
  } catch (e) {
    test('Cancellations', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // 9. CONSISTENCY — daily-sales sum vs detail summary
  // ══════════════════════════════════════════════════════════════
  section('9. Consistency — daily-sales ↔ detail summary');
  try {
    const [dailyR, detailR] = await Promise.all([
      api.get(`/orders/reports/${OUTLET_ID}/daily-sales?startDate=${START}&endDate=${END}`),
      api.get(`/orders/reports/${OUTLET_ID}/daily-sales/detail?startDate=${START}&endDate=${END}`)
    ]);

    const dailyGross = dailyR.data.data.reduce((s, d) => s + parseFloat(d.gross_sales || 0), 0);
    const dailyNet = dailyR.data.data.reduce((s, d) => s + parseFloat(d.net_sales || 0), 0);
    const dailyTax = dailyR.data.data.reduce((s, d) => s + parseFloat(d.tax_amount || 0), 0);
    const detailS = detailR.data.data.summary;

    test('Gross sales: daily ≈ detail', close(dailyGross, detailS.grossSales, 2),
      `daily=${dailyGross.toFixed(2)}, detail=${detailS.grossSales}`);
    test('Net sales: daily ≈ detail', close(dailyNet, detailS.netSales, 2),
      `daily=${dailyNet.toFixed(2)}, detail=${detailS.netSales}`);
    test('Tax: daily ≈ detail', close(dailyTax, detailS.totalTax, 2),
      `daily=${dailyTax.toFixed(2)}, detail=${detailS.totalTax}`);
    test('Order count: daily ≈ detail', 
      dailyR.data.data.reduce((s, d) => s + d.total_orders, 0) === detailS.totalOrders);
  } catch (e) {
    test('Consistency check', false, e.response?.data?.message || e.message);
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
