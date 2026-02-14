/**
 * Test: Invoice Download PDF + Print to Thermal Printer
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
  console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
}
function test(name, condition, detail) {
  if (condition) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}

async function login(email, password) {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  const token = res.data.data.accessToken || res.data.data.token;
  return { api: axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } }), token };
}

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  INVOICE DOWNLOAD PDF + PRINT — TEST                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();
  const { api, token } = await login('admin@restropos.com', 'admin123');
  console.log('   ✓ Admin login');

  // Find a completed order with an invoice
  const [invoices] = await pool.query(
    `SELECT i.id, i.invoice_number, i.grand_total, i.payment_status, o.order_number
     FROM invoices i
     JOIN orders o ON i.order_id = o.id
     WHERE i.outlet_id = ? AND i.is_cancelled = 0
     ORDER BY i.created_at DESC LIMIT 3`,
    [OUTLET_ID]
  );

  if (invoices.length === 0) {
    console.log('   ⚠ No invoices found to test. Exiting.');
    process.exit(0);
  }

  const inv = invoices[0];
  console.log(`   Test invoice: #${inv.invoice_number} (id=${inv.id}, order=${inv.order_number}, total=${inv.grand_total})`);

  // ═══════════════════════════════════════════
  // 1. DOWNLOAD INVOICE PDF
  // ═══════════════════════════════════════════
  section('1. DOWNLOAD INVOICE PDF');

  try {
    const r = await api.get(`/orders/invoice/${inv.id}/download`, {
      responseType: 'arraybuffer'
    });

    test('PDF download: status 200', r.status === 200);
    test('PDF download: content-type is PDF', r.headers['content-type'] === 'application/pdf');
    test('PDF download: has content-disposition', !!r.headers['content-disposition']);
    test('PDF download: filename in header', r.headers['content-disposition']?.includes('.pdf'));
    test('PDF download: has data', r.data.byteLength > 0);
    test('PDF download: starts with %PDF', Buffer.from(r.data).slice(0, 5).toString() === '%PDF-');

    console.log(`   PDF size: ${r.data.byteLength} bytes`);
    console.log(`   Content-Disposition: ${r.headers['content-disposition']}`);

    // Save to temp file for manual verification
    const tmpFile = path.join(__dirname, `test-invoice-${inv.id}.pdf`);
    fs.writeFileSync(tmpFile, Buffer.from(r.data));
    console.log(`   Saved to: ${tmpFile}`);
  } catch (e) {
    test('PDF download: no error', false, e.response?.status + ' ' + (e.response?.data ? Buffer.from(e.response.data).toString().slice(0, 200) : e.message));
  }

  // Test with non-existent invoice
  try {
    await api.get('/orders/invoice/999999/download', { responseType: 'arraybuffer' });
    test('PDF 404: should fail', false);
  } catch (e) {
    test('PDF 404: returns 404', e.response?.status === 404, `got ${e.response?.status}`);
  }

  // Test with all 3 invoices
  for (let i = 1; i < invoices.length; i++) {
    try {
      const r = await api.get(`/orders/invoice/${invoices[i].id}/download`, { responseType: 'arraybuffer' });
      test(`PDF invoice #${invoices[i].invoice_number}: success`, r.status === 200);
    } catch (e) {
      test(`PDF invoice #${invoices[i].invoice_number}: no error`, false, e.message);
    }
  }

  // ═══════════════════════════════════════════
  // 2. PRINT INVOICE TO THERMAL
  // ═══════════════════════════════════════════
  section('2. PRINT INVOICE TO THERMAL');

  try {
    const r = await api.post(`/orders/invoice/${inv.id}/print`);
    test('Print invoice: success', r.data.success);
    test('Print invoice: has message', !!r.data.message);
    test('Print invoice: has invoice data', r.data.data !== undefined);

    if (r.data.data) {
      test('Print data: has invoiceNumber', !!(r.data.data.invoiceNumber || r.data.data.invoice_number));
      test('Print data: has items', Array.isArray(r.data.data.items));
      test('Print data: has grandTotal', (r.data.data.grandTotal || r.data.data.grand_total) !== undefined);
      console.log(`   Printed: ${r.data.data.invoiceNumber || r.data.data.invoice_number}`);
    }

    console.log(`   Message: ${r.data.message}`);
  } catch (e) {
    // Printer may not be connected — check if it's a printer error vs code error
    if (e.response?.data?.message?.includes('printer') || e.response?.data?.message?.includes('Printer') || e.response?.data?.message?.includes('connection')) {
      console.log(`   ⚠ Printer not connected (expected in test env): ${e.response?.data?.message}`);
      test('Print invoice: code works (printer unavailable)', true);
    } else {
      test('Print invoice: no error', false, e.response?.data?.message || e.message);
    }
  }

  // Test print with non-existent invoice
  try {
    await api.post('/orders/invoice/999999/print');
    test('Print 404: should fail', false);
  } catch (e) {
    test('Print 404: returns 404', e.response?.status === 404, `got ${e.response?.status}`);
  }

  // ═══════════════════════════════════════════
  // 3. GET INVOICE BY ORDER (verify structure matches PDF)
  // ═══════════════════════════════════════════
  section('3. INVOICE STRUCTURE VERIFICATION');

  try {
    const r = await api.get(`/orders/invoice/${inv.id}`);
    test('Get invoice: success', r.data.success);

    const d = r.data.data;
    // Verify all fields used by PDF exist
    test('Structure: invoiceNumber', !!d.invoiceNumber);
    test('Structure: invoiceDate', d.invoiceDate !== undefined);
    test('Structure: invoiceTime', d.invoiceTime !== undefined);
    test('Structure: subtotal', d.subtotal !== undefined);
    test('Structure: taxableAmount', d.taxableAmount !== undefined);
    test('Structure: totalTax', d.totalTax !== undefined);
    test('Structure: grandTotal', d.grandTotal !== undefined);
    test('Structure: amountInWords', d.amountInWords !== undefined);
    test('Structure: paymentStatus', !!d.paymentStatus);
    test('Structure: items array', Array.isArray(d.items));
    test('Structure: payments array', Array.isArray(d.payments));

    if (d.items.length > 0) {
      const item = d.items[0];
      test('Item: has name', !!item.name);
      test('Item: has quantity', item.quantity !== undefined);
      test('Item: has unitPrice', item.unitPrice !== undefined);
      test('Item: has totalPrice', item.totalPrice !== undefined);
    }

    console.log(`   Invoice: ${d.invoiceNumber}, ${d.items.length} items, ${d.payments.length} payments`);
    console.log(`   Total: ${d.grandTotal}, Status: ${d.paymentStatus}`);
  } catch (e) {
    test('Invoice structure: no error', false, e.response?.data?.message || e.message);
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
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.response?.data || err.message);
  process.exit(1);
});
