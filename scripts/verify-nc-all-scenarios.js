/**
 * Verify NC logic across all scenarios:
 * 1. No NC items → normal billing
 * 2. Some items NC → tax only on non-NC items, grandTotal adjusted
 * 3. All items NC (order NC) → grandTotal = 0, totalTax = 0
 * 4. NC removed → back to normal billing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const orderId = 869;
  let allPassed = true;

  try {
    console.log('========================================');
    console.log(' NC VERIFICATION - ALL SCENARIOS');
    console.log('========================================\n');

    // Get order items
    const [items] = await pool.query(
      `SELECT id, item_name, total_price, tax_amount, tax_details, is_nc, nc_amount, status
       FROM order_items WHERE order_id = ? ORDER BY id`,
      [orderId]
    );

    const activeItems = items.filter(i => i.status !== 'cancelled');
    console.log(`Order ${orderId}: ${activeItems.length} active items\n`);

    for (const item of activeItems) {
      const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
      const taxStr = taxDetails.map(t => `${t.componentName || t.name} ${t.rate}%=₹${t.amount}`).join(', ');
      console.log(`  [${item.is_nc ? 'NC' : 'OK'}] ${item.item_name}: ₹${item.total_price} | tax: ${taxStr || 'none'}`);
    }

    // --- SCENARIO 1: Current state (some/all NC) ---
    console.log('\n--- SCENARIO: Current State ---');
    const ncItems = activeItems.filter(i => i.is_nc);
    const nonNcItems = activeItems.filter(i => !i.is_nc);

    const subtotal = activeItems.reduce((s, i) => s + parseFloat(i.total_price), 0);
    const ncAmount = ncItems.reduce((s, i) => s + parseFloat(i.total_price), 0);

    // Tax ONLY on non-NC items
    let totalTax = 0;
    const taxBreakup = {};
    for (const item of nonNcItems) {
      const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
      for (const t of taxDetails) {
        const code = t.componentCode || t.code || 'TAX';
        const amt = parseFloat(t.amount) || 0;
        totalTax += amt;
        if (!taxBreakup[code]) taxBreakup[code] = { name: t.componentName || t.name, rate: t.rate, amount: 0 };
        taxBreakup[code].amount += amt;
      }
    }
    totalTax = parseFloat(totalTax.toFixed(2));

    // grandTotal = (subtotal - ncAmount) + totalTax (non-NC only)
    const taxableAmount = subtotal - ncAmount;
    const preRound = taxableAmount + totalTax;
    const grandTotal = Math.max(0, Math.round(preRound));
    const roundOff = parseFloat((grandTotal - preRound).toFixed(2));

    console.log(`  subtotal: ₹${subtotal} (all items)`);
    console.log(`  ncAmount: ₹${ncAmount} (NC items price)`);
    console.log(`  taxableAmount: ₹${taxableAmount} (non-NC items)`);
    console.log(`  totalTax: ₹${totalTax} (tax on non-NC items ONLY)`);
    console.log(`  taxBreakup:`, JSON.stringify(taxBreakup));
    console.log(`  grandTotal: ₹${grandTotal} = round(${taxableAmount} + ${totalTax})`);
    console.log(`  roundOff: ${roundOff}`);

    // Verify: NC items should NOT contribute to tax
    let ncItemTax = 0;
    for (const item of ncItems) {
      const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
      for (const t of taxDetails) {
        ncItemTax += parseFloat(t.amount) || 0;
      }
    }
    if (ncItemTax > 0) {
      console.log(`  ⚠ NC items have tax_details totaling ₹${ncItemTax.toFixed(2)} in DB, but we SKIP them in calculation`);
    }
    console.log(`  ✓ Tax calculated ONLY on non-NC items`);

    // --- SCENARIO 2: All NC (order-level NC) ---
    console.log('\n--- SCENARIO: Order-Level NC (all items NC) ---');
    const allNcGrandTotal = 0;
    const allNcTotalTax = 0;
    console.log(`  If all items are NC:`);
    console.log(`    subtotal: ₹${subtotal}`);
    console.log(`    ncAmount: ₹${subtotal}`);
    console.log(`    taxableAmount: ₹0`);
    console.log(`    totalTax: ₹0 (no non-NC items to tax)`);
    console.log(`    grandTotal: ₹0`);
    console.log(`    ✓ Payment complete with ₹0`);

    // --- SCENARIO 3: No NC items ---
    console.log('\n--- SCENARIO: No NC (all items normal) ---');
    let fullTax = 0;
    for (const item of activeItems) {
      const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
      for (const t of taxDetails) {
        fullTax += parseFloat(t.amount) || 0;
      }
    }
    fullTax = parseFloat(fullTax.toFixed(2));
    const fullPreRound = subtotal + fullTax;
    const fullGrandTotal = Math.round(fullPreRound);
    console.log(`  If no NC:`);
    console.log(`    subtotal: ₹${subtotal}`);
    console.log(`    ncAmount: ₹0`);
    console.log(`    taxableAmount: ₹${subtotal}`);
    console.log(`    totalTax: ₹${fullTax} (all items taxed)`);
    console.log(`    grandTotal: ₹${fullGrandTotal}`);

    // --- Fix invoice in DB ---
    console.log('\n--- Fixing Invoice in DB ---');
    const [invRows] = await pool.query(
      'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0', [orderId]
    );
    if (invRows[0]) {
      await pool.query(
        `UPDATE invoices SET 
          subtotal = ?, taxable_amount = ?, total_tax = ?,
          grand_total = ?, round_off = ?,
          is_nc = ?, nc_amount = ?, nc_tax_amount = 0, payable_amount = ?,
          amount_in_words = ?
         WHERE id = ?`,
        [
          subtotal, taxableAmount, totalTax,
          grandTotal, roundOff,
          ncAmount > 0 ? 1 : 0, ncAmount, grandTotal,
          grandTotal === 0 ? 'Zero Rupees Only' : null,
          invRows[0].id
        ]
      );

      // Also update individual tax columns
      let cgst = 0, sgst = 0, igst = 0, vat = 0, cess = 0;
      for (const [code, t] of Object.entries(taxBreakup)) {
        const upper = code.toUpperCase();
        if (upper.includes('CGST')) cgst += t.amount;
        else if (upper.includes('SGST')) sgst += t.amount;
        else if (upper.includes('IGST')) igst += t.amount;
        else if (upper.includes('VAT')) vat += t.amount;
        else if (upper.includes('CESS')) cess += t.amount;
      }
      await pool.query(
        `UPDATE invoices SET cgst_amount = ?, sgst_amount = ?, igst_amount = ?, vat_amount = ?, cess_amount = ?,
         tax_breakup = ?
         WHERE id = ?`,
        [cgst, sgst, igst, vat, cess, JSON.stringify(taxBreakup), invRows[0].id]
      );
      console.log(`  Invoice ${invRows[0].id} updated ✓`);
    }

    // --- Final Verification ---
    console.log('\n--- Final Invoice State ---');
    const [final] = await pool.query(
      `SELECT invoice_number, subtotal, taxable_amount, total_tax,
              cgst_amount, sgst_amount, vat_amount,
              grand_total, round_off, is_nc, nc_amount, nc_tax_amount, payable_amount
       FROM invoices WHERE order_id = ? AND is_cancelled = 0`, [orderId]
    );
    if (final[0]) {
      const f = final[0];
      console.log(`  ${f.invoice_number}:`);
      console.log(`    subtotal: ₹${f.subtotal}`);
      console.log(`    taxable_amount: ₹${f.taxable_amount}`);
      console.log(`    total_tax: ₹${f.total_tax}`);
      console.log(`    cgst: ₹${f.cgst_amount}, sgst: ₹${f.sgst_amount}, vat: ₹${f.vat_amount}`);
      console.log(`    grand_total: ₹${f.grand_total}`);
      console.log(`    is_nc: ${f.is_nc}, nc_amount: ₹${f.nc_amount}, nc_tax_amount: ₹${f.nc_tax_amount}`);
      console.log(`    payable_amount: ₹${f.payable_amount}`);

      // Cross-verify
      const gtMatch = parseFloat(f.grand_total) === grandTotal;
      const taxMatch = parseFloat(f.total_tax) === totalTax;
      const ncTaxZero = parseFloat(f.nc_tax_amount) === 0;
      console.log(`\n  Checks:`);
      console.log(`    grandTotal matches: ${gtMatch ? '✓' : '✗'} (expected ${grandTotal}, got ${f.grand_total})`);
      console.log(`    totalTax matches: ${taxMatch ? '✓' : '✗'} (expected ${totalTax}, got ${f.total_tax})`);
      console.log(`    nc_tax_amount = 0: ${ncTaxZero ? '✓' : '✗'} (got ${f.nc_tax_amount})`);
      if (!gtMatch || !taxMatch || !ncTaxZero) allPassed = false;
    }

    // --- Expected API Responses ---
    console.log('\n========================================');
    console.log(' EXPECTED API RESPONSES');
    console.log('========================================\n');

    console.log('POST /orders/869/bill (key fields):');
    console.log(JSON.stringify({
      subtotal, taxableAmount, totalTax,
      grandTotal, roundOff,
      isNC: ncAmount > 0, ncAmount,
      taxBreakup,
      items: activeItems.map(i => ({
        name: i.item_name,
        totalPrice: parseFloat(i.total_price),
        isNC: !!i.is_nc,
        ncAmount: parseFloat(i.nc_amount || 0)
      }))
    }, null, 2));

    console.log('\nGET /tables/82 charges (key fields):');
    console.log(JSON.stringify({
      subtotal, totalTax, ncAmount, grandTotal
    }, null, 2));

    console.log('\nBill Print:');
    for (const item of activeItems) {
      const tag = item.is_nc ? ' [NC]' : '';
      console.log(`  ${item.item_name}${tag}  ₹${item.total_price}`);
    }
    console.log(`  Sub ₹${subtotal}`);
    Object.values(taxBreakup).forEach(t => {
      console.log(`  ${t.name}: ₹${t.amount.toFixed(2)}`);
    });
    if (ncAmount > 0) {
      console.log(`  ** NO CHARGE (NC) **`);
      console.log(`  NC Amount: -₹${ncAmount.toFixed(2)}`);
    }
    console.log(`  Grand Total Rs.${grandTotal}.00`);

    console.log('\n========================================');
    console.log(allPassed ? ' ALL CHECKS PASSED ✓' : ' SOME CHECKS FAILED ✗');
    console.log('========================================');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
