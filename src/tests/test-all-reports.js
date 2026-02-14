/**
 * Test: All Reports — Verify every report endpoint returns data
 * with correct structure, calculations, filters, and date ranges
 */

require('dotenv').config();
const axios = require('axios');
const { initializeDatabase, getPool } = require('../database');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;

let passed = 0, failed = 0;

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
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

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ALL REPORTS — COMPREHENSIVE TEST                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();
  const api = await login('admin@restropos.com', 'admin123');
  console.log('   ✓ Admin login');

  // Get date range of existing data
  const [dateRange] = await pool.query(
    'SELECT MIN(DATE(created_at)) as minD, MAX(DATE(created_at)) as maxD FROM orders WHERE outlet_id=?', [OUTLET_ID]
  );
  const startDate = dateRange[0].minD instanceof Date ? dateRange[0].minD.toISOString().slice(0, 10) : dateRange[0].minD;
  const endDate = dateRange[0].maxD instanceof Date ? dateRange[0].maxD.toISOString().slice(0, 10) : dateRange[0].maxD;
  console.log(`   Data range: ${startDate} to ${endDate}`);

  // ═══════════════════════════════════════════
  // 8.0 Dashboard
  // ═══════════════════════════════════════════
  section('8.0 LIVE DASHBOARD');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/dashboard`);
    test('Dashboard: success', r.data.success);
    test('Dashboard: has sales', r.data.data.sales !== undefined);
    test('Dashboard: has activeTables', r.data.data.activeTables !== undefined);
    test('Dashboard: has paymentBreakdown', r.data.data.paymentBreakdown !== undefined);
    console.log(`   Sales: ${JSON.stringify(r.data.data.sales)}`);
    console.log(`   Active tables: ${r.data.data.activeTables}`);
  } catch (e) {
    test('Dashboard: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.1 Daily Sales Report
  // ═══════════════════════════════════════════
  section('8.1 DAILY SALES REPORT');
  try {
    // No date params → should default to today
    const r1 = await api.get(`/orders/reports/${OUTLET_ID}/daily-sales`);
    test('Daily (no params): success', r1.data.success);
    test('Daily (no params): is array', Array.isArray(r1.data.data));
    console.log(`   Default (today): ${r1.data.data.length} day(s)`);

    // With date range
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/daily-sales?startDate=${startDate}&endDate=${endDate}`);
    test('Daily (range): success', r2.data.success);
    test('Daily (range): has data', r2.data.data.length > 0, `got ${r2.data.data.length}`);
    console.log(`   Range ${startDate} to ${endDate}: ${r2.data.data.length} day(s)`);

    if (r2.data.data.length > 0) {
      const day = r2.data.data[0];
      test('Daily: has report_date', day.report_date !== undefined);
      test('Daily: has total_orders', day.total_orders !== undefined);
      test('Daily: has gross_sales', day.gross_sales !== undefined);
      test('Daily: has net_sales', day.net_sales !== undefined);
      test('Daily: has dine_in_orders', day.dine_in_orders !== undefined);
      test('Daily: has discount_amount', day.discount_amount !== undefined);
      test('Daily: has tax_amount', day.tax_amount !== undefined);
      test('Daily: has cash_collection', day.cash_collection !== undefined);
      test('Daily: has average_order_value', day.average_order_value !== undefined);
      console.log(`   Sample: date=${day.report_date}, orders=${day.total_orders}, net=${day.net_sales}, cash=${day.cash_collection}`);
    }
  } catch (e) {
    test('Daily Sales: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.2 Item Sales Report
  // ═══════════════════════════════════════════
  section('8.2 ITEM SALES REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/item-sales?startDate=${startDate}&endDate=${endDate}`);
    test('Item Sales: success', r.data.success);
    test('Item Sales: is array', Array.isArray(r.data.data));
    test('Item Sales: has data', r.data.data.length > 0, `got ${r.data.data.length}`);
    console.log(`   Items: ${r.data.data.length}`);

    if (r.data.data.length > 0) {
      const item = r.data.data[0];
      test('Item: has item_name', !!item.item_name);
      test('Item: has total_quantity', item.total_quantity !== undefined);
      test('Item: has gross_revenue', item.gross_revenue !== undefined);
      test('Item: has net_revenue', item.net_revenue !== undefined);
      test('Item: has category_name', item.category_name !== undefined);
      test('Item: has order_count', item.order_count !== undefined);
      console.log(`   Top item: ${item.item_name} (qty=${item.total_quantity}, rev=${item.net_revenue})`);
    }

    // Test limit param
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/item-sales?startDate=${startDate}&endDate=${endDate}&limit=3`);
    test('Item Sales (limit=3): respects limit', r2.data.data.length <= 3);

    // No date params
    const r3 = await api.get(`/orders/reports/${OUTLET_ID}/item-sales`);
    test('Item Sales (no date): success', r3.data.success);
  } catch (e) {
    test('Item Sales: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.3 Category Sales Report
  // ═══════════════════════════════════════════
  section('8.3 CATEGORY SALES REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/category-sales?startDate=${startDate}&endDate=${endDate}`);
    test('Category Sales: success', r.data.success);
    test('Category Sales: is array', Array.isArray(r.data.data));
    test('Category Sales: has data', r.data.data.length > 0, `got ${r.data.data.length}`);
    console.log(`   Categories: ${r.data.data.length}`);

    if (r.data.data.length > 0) {
      const cat = r.data.data[0];
      test('Category: has category_name', cat.category_name !== undefined);
      test('Category: has total_quantity', cat.total_quantity !== undefined);
      test('Category: has net_revenue', cat.net_revenue !== undefined);
      test('Category: has contribution_percent', cat.contribution_percent !== undefined);
      test('Category: has item_count', cat.item_count !== undefined);
      console.log(`   Top: ${cat.category_name} (rev=${cat.net_revenue}, share=${cat.contribution_percent}%)`);

      // Verify contribution percentages sum to ~100
      const totalPercent = r.data.data.reduce((s, c) => s + parseFloat(c.contribution_percent), 0);
      test('Category: contributions sum ~100%', totalPercent > 99 && totalPercent < 101, `sum=${totalPercent.toFixed(2)}%`);
    }

    // No date params
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/category-sales`);
    test('Category Sales (no date): success', r2.data.success);
  } catch (e) {
    test('Category Sales: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.4 Payment Modes Report
  // ═══════════════════════════════════════════
  section('8.4 PAYMENT MODES REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/payment-modes?startDate=${startDate}&endDate=${endDate}`);
    test('Payment Modes: success', r.data.success);
    test('Payment Modes: has modes array', Array.isArray(r.data.data.modes));
    test('Payment Modes: has summary', r.data.data.summary !== undefined);
    test('Payment Modes: has data', r.data.data.modes.length > 0, `got ${r.data.data.modes.length}`);
    console.log(`   Modes: ${r.data.data.modes.length}`);

    if (r.data.data.modes.length > 0) {
      const mode = r.data.data.modes[0];
      test('Mode: has payment_mode', !!mode.payment_mode);
      test('Mode: has transaction_count', mode.transaction_count !== undefined);
      test('Mode: has total_amount', mode.total_amount !== undefined);
      test('Mode: has percentage_share', mode.percentage_share !== undefined);
      console.log(`   Top: ${mode.payment_mode} (amt=${mode.total_amount}, share=${mode.percentage_share}%)`);
    }

    test('Summary: has total_collected', !!r.data.data.summary.total_collected);
    test('Summary: has total_transactions', r.data.data.summary.total_transactions !== undefined);
    console.log(`   Total: ${r.data.data.summary.total_collected} from ${r.data.data.summary.total_transactions} txns`);

    // No date params
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/payment-modes`);
    test('Payment Modes (no date): success', r2.data.success);
  } catch (e) {
    test('Payment Modes: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.5 Tax Report
  // ═══════════════════════════════════════════
  section('8.5 TAX REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/tax?startDate=${startDate}&endDate=${endDate}`);
    test('Tax Report: success', r.data.success);
    test('Tax Report: has daily array', Array.isArray(r.data.data.daily));
    test('Tax Report: has summary', r.data.data.summary !== undefined);
    test('Tax Report: has data', r.data.data.daily.length > 0, `got ${r.data.data.daily.length}`);
    console.log(`   Days: ${r.data.data.daily.length}`);

    if (r.data.data.daily.length > 0) {
      const day = r.data.data.daily[0];
      test('Tax day: has report_date', day.report_date !== undefined);
      test('Tax day: has taxable_amount', day.taxable_amount !== undefined);
      test('Tax day: has cgst_amount', day.cgst_amount !== undefined);
      test('Tax day: has sgst_amount', day.sgst_amount !== undefined);
      test('Tax day: has total_tax', day.total_tax !== undefined);
      test('Tax day: has grand_total', day.grand_total !== undefined);
      test('Tax day: has invoice_count', day.invoice_count !== undefined);
    }

    const s = r.data.data.summary;
    test('Summary: has total_taxable', s.total_taxable !== undefined);
    test('Summary: has total_cgst', s.total_cgst !== undefined);
    test('Summary: has total_sgst', s.total_sgst !== undefined);
    test('Summary: has total_tax', s.total_tax !== undefined);
    test('Summary: has total_invoices', s.total_invoices !== undefined);
    console.log(`   Totals: taxable=${s.total_taxable}, cgst=${s.total_cgst}, sgst=${s.total_sgst}, tax=${s.total_tax}`);

    // No date params
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/tax`);
    test('Tax Report (no date): success', r2.data.success);
  } catch (e) {
    test('Tax Report: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.6 Hourly Sales Report
  // ═══════════════════════════════════════════
  section('8.6 HOURLY SALES REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/hourly?date=${endDate}`);
    test('Hourly: success', r.data.success);
    test('Hourly: has hourly array', Array.isArray(r.data.data.hourly));
    test('Hourly: 24 hours', r.data.data.hourly.length === 24, `got ${r.data.data.hourly.length}`);
    test('Hourly: has summary', r.data.data.summary !== undefined);
    test('Hourly: has date', !!r.data.data.date);

    const activeHours = r.data.data.hourly.filter(h => h.order_count > 0);
    console.log(`   Active hours: ${activeHours.length}/24`);

    if (activeHours.length > 0) {
      const h = activeHours[0];
      test('Hour: has hour', h.hour !== undefined);
      test('Hour: has order_count', h.order_count !== undefined);
      test('Hour: has net_sales', h.net_sales !== undefined);
    }

    test('Summary: has peak_hour', r.data.data.summary.peak_hour !== undefined);
    test('Summary: has total_sales', r.data.data.summary.total_sales !== undefined);
    console.log(`   Peak: ${r.data.data.summary.peak_hour}, Total: ${r.data.data.summary.total_sales}`);

    // No date param
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/hourly`);
    test('Hourly (no date): success', r2.data.success);
  } catch (e) {
    test('Hourly Sales: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.7 Staff Performance Report
  // ═══════════════════════════════════════════
  section('8.7 STAFF PERFORMANCE REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/staff?startDate=${startDate}&endDate=${endDate}`);
    test('Staff: success', r.data.success);
    test('Staff: is array', Array.isArray(r.data.data));
    test('Staff: has data', r.data.data.length > 0, `got ${r.data.data.length}`);
    console.log(`   Staff members: ${r.data.data.length}`);

    if (r.data.data.length > 0) {
      const s = r.data.data[0];
      test('Staff: has user_name', !!s.user_name);
      test('Staff: has total_orders', s.total_orders !== undefined);
      test('Staff: has total_sales', s.total_sales !== undefined);
      test('Staff: has total_discounts', s.total_discounts !== undefined);
      test('Staff: has cancelled_orders', s.cancelled_orders !== undefined);
      test('Staff: has avg_order_value', s.avg_order_value !== undefined);
      test('Staff: has total_tips', s.total_tips !== undefined);
      console.log(`   Top: ${s.user_name} (orders=${s.total_orders}, sales=${s.total_sales}, avg=${s.avg_order_value})`);
    }

    // No date params
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/staff`);
    test('Staff (no date): success', r2.data.success);
  } catch (e) {
    test('Staff Report: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.8 Cancellation Report
  // ═══════════════════════════════════════════
  section('8.8 CANCELLATION REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/cancellations?startDate=${startDate}&endDate=${endDate}`);
    test('Cancellations: success', r.data.success);
    test('Cancellations: has order_cancellations', Array.isArray(r.data.data.order_cancellations));
    test('Cancellations: has item_cancellations', Array.isArray(r.data.data.item_cancellations));
    test('Cancellations: has summary', r.data.data.summary !== undefined);

    const s = r.data.data.summary;
    console.log(`   Order cancellations: ${s.total_order_cancellations} (amt=${s.total_order_cancel_amount})`);
    console.log(`   Item cancellations: ${s.total_item_cancellations} (amt=${s.total_item_cancel_amount})`);

    if (r.data.data.order_cancellations.length > 0) {
      const c = r.data.data.order_cancellations[0];
      test('Order cancel: has order_number', !!c.order_number);
      test('Order cancel: has reason', c.reason !== undefined);
      test('Order cancel: has cancelled_by_name', c.cancelled_by_name !== undefined);
      test('Order cancel: has total_amount', c.total_amount !== undefined);
    }

    if (r.data.data.item_cancellations.length > 0) {
      const c = r.data.data.item_cancellations[0];
      test('Item cancel: has item_name', !!c.item_name);
      test('Item cancel: has cancelled_quantity', c.cancelled_quantity !== undefined);
      test('Item cancel: has cancelled_amount', c.cancelled_amount !== undefined);
    }

    test('Summary: has by_reason', Array.isArray(s.by_reason));
    if (s.by_reason.length > 0) {
      console.log(`   Top reason: "${s.by_reason[0].reason}" (count=${s.by_reason[0].count})`);
    }

    // No date params
    const r2 = await api.get(`/orders/reports/${OUTLET_ID}/cancellations`);
    test('Cancellations (no date): success', r2.data.success);
  } catch (e) {
    test('Cancellation Report: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.9 Floor/Section Report (bonus)
  // ═══════════════════════════════════════════
  section('8.9 FLOOR/SECTION REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/floor-section?startDate=${startDate}&endDate=${endDate}`);
    test('Floor/Section: success', r.data.success);
    test('Floor/Section: is array', Array.isArray(r.data.data));
    console.log(`   Floors: ${r.data.data.length}`);

    if (r.data.data.length > 0) {
      const f = r.data.data[0];
      test('Floor: has floor_name', f.floor_name !== undefined);
      test('Floor: has order_count', f.order_count !== undefined);
      test('Floor: has net_sales', f.net_sales !== undefined);
      test('Floor: has avg_order_value', f.avg_order_value !== undefined);
    }
  } catch (e) {
    test('Floor/Section: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // 8.10 Counter/Station Report (bonus)
  // ═══════════════════════════════════════════
  section('8.10 COUNTER/STATION REPORT');
  try {
    const r = await api.get(`/orders/reports/${OUTLET_ID}/counter?startDate=${startDate}&endDate=${endDate}`);
    test('Counter: success', r.data.success);
    test('Counter: is array', Array.isArray(r.data.data));
    console.log(`   Stations: ${r.data.data.length}`);

    if (r.data.data.length > 0) {
      const s = r.data.data[0];
      test('Station: has station', !!s.station);
      test('Station: has ticket_count', s.ticket_count !== undefined);
      test('Station: has item_count', s.item_count !== undefined);
    }
  } catch (e) {
    test('Counter Report: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // CROSS-VALIDATION
  // ═══════════════════════════════════════════
  section('CROSS-VALIDATION');
  try {
    // Verify daily sales net_sales matches payment modes total_collected for the full range
    const daily = await api.get(`/orders/reports/${OUTLET_ID}/daily-sales?startDate=${startDate}&endDate=${endDate}`);
    const pmodes = await api.get(`/orders/reports/${OUTLET_ID}/payment-modes?startDate=${startDate}&endDate=${endDate}`);

    const dailyTotalCollection = daily.data.data.reduce((s, d) => s + parseFloat(d.total_collection || 0), 0);
    const pmodeTotalCollected = parseFloat(pmodes.data.data.summary.total_collected || 0);

    console.log(`   Daily total_collection sum: ${dailyTotalCollection.toFixed(2)}`);
    console.log(`   Payment modes total_collected: ${pmodeTotalCollected.toFixed(2)}`);
    test('Cross-check: daily collection ≈ payment modes total', Math.abs(dailyTotalCollection - pmodeTotalCollected) < 1,
      `diff=${Math.abs(dailyTotalCollection - pmodeTotalCollected).toFixed(2)}`);

    // Verify category contribution adds up
    const cats = await api.get(`/orders/reports/${OUTLET_ID}/category-sales?startDate=${startDate}&endDate=${endDate}`);
    const catNetSum = cats.data.data.reduce((s, c) => s + parseFloat(c.net_revenue || 0), 0);
    const itemsR = await api.get(`/orders/reports/${OUTLET_ID}/item-sales?startDate=${startDate}&endDate=${endDate}&limit=1000`);
    const itemNetSum = itemsR.data.data.reduce((s, i) => s + parseFloat(i.net_revenue || 0), 0);
    console.log(`   Category net_revenue sum: ${catNetSum.toFixed(2)}`);
    console.log(`   Item net_revenue sum: ${itemNetSum.toFixed(2)}`);
    test('Cross-check: category revenue ≈ item revenue', Math.abs(catNetSum - itemNetSum) < 1,
      `diff=${Math.abs(catNetSum - itemNetSum).toFixed(2)}`);
  } catch (e) {
    test('Cross-validation: no error', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All report tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.response?.data?.message || err.message);
  process.exit(1);
});
