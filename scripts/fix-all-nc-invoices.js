/**
 * Fix ALL NC invoices:
 * - Recalculate tax only on non-NC items
 * - Set nc_tax_amount = 0
 * - Recalculate grand_total properly
 * - Fix stuck tables
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

  try {
    console.log('=== Fix ALL NC Invoices ===\n');

    // Find all NC invoices
    const [invoices] = await pool.query(
      `SELECT i.id, i.invoice_number, i.order_id, i.grand_total, i.is_nc, 
              i.nc_amount, i.nc_tax_amount, i.payment_status,
              o.status as order_status, o.table_id
       FROM invoices i
       LEFT JOIN orders o ON i.order_id = o.id
       WHERE i.is_nc = 1 AND i.is_cancelled = 0`
    );

    console.log(`Found ${invoices.length} NC invoices\n`);

    for (const inv of invoices) {
      // Get items
      const [items] = await pool.query(
        `SELECT id, item_name, total_price, tax_amount, tax_details, is_nc, status
         FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
        [inv.order_id]
      );

      let subtotal = 0, ncAmount = 0, totalTax = 0;
      const taxBreakup = {};
      let cgst = 0, sgst = 0, igst = 0, vat = 0, cess = 0;

      for (const item of items) {
        const price = parseFloat(item.total_price);
        subtotal += price;

        if (item.is_nc) {
          ncAmount += price;
          continue; // Skip tax for NC items
        }

        // Tax only on non-NC items
        const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
        for (const t of taxDetails) {
          const code = t.componentCode || t.code || 'TAX';
          const amt = parseFloat(t.amount) || 0;
          totalTax += amt;
          if (!taxBreakup[code]) taxBreakup[code] = { name: t.componentName || t.name, rate: t.rate, taxableAmount: 0, taxAmount: 0 };
          taxBreakup[code].taxableAmount += price;
          taxBreakup[code].taxAmount += amt;
          const upper = code.toUpperCase();
          if (upper.includes('CGST')) cgst += amt;
          else if (upper.includes('SGST')) sgst += amt;
          else if (upper.includes('IGST')) igst += amt;
          else if (upper.includes('VAT')) vat += amt;
          else if (upper.includes('CESS')) cess += amt;
        }
      }
      totalTax = parseFloat(totalTax.toFixed(2));

      const taxableAmount = subtotal - ncAmount;
      const preRound = taxableAmount + totalTax;
      const grandTotal = Math.max(0, Math.round(preRound));
      const roundOff = parseFloat((grandTotal - preRound).toFixed(2));

      const oldGT = parseFloat(inv.grand_total);
      const oldNcTax = parseFloat(inv.nc_tax_amount);
      const needsFix = Math.abs(oldGT - grandTotal) > 0.01 || oldNcTax > 0;

      if (needsFix) {
        await pool.query(
          `UPDATE invoices SET 
            subtotal = ?, taxable_amount = ?, total_tax = ?,
            cgst_amount = ?, sgst_amount = ?, igst_amount = ?, vat_amount = ?, cess_amount = ?,
            grand_total = ?, round_off = ?,
            nc_amount = ?, nc_tax_amount = 0, payable_amount = ?,
            amount_in_words = ?, tax_breakup = ?
           WHERE id = ?`,
          [
            subtotal, taxableAmount, totalTax,
            cgst, sgst, igst, vat, cess,
            grandTotal, roundOff,
            ncAmount, grandTotal,
            grandTotal === 0 ? 'Zero Rupees Only' : `Rupees ${grandTotal} Only`,
            JSON.stringify(taxBreakup),
            inv.id
          ]
        );
        console.log(`  ✓ ${inv.invoice_number} (order ${inv.order_id}): gt ${oldGT}→${grandTotal}, ncTax ${oldNcTax}→0, tax ${totalTax}`);
      } else {
        console.log(`  ○ ${inv.invoice_number} (order ${inv.order_id}): already correct (gt=${grandTotal})`);
      }
    }

    // Fix stuck tables (billing status but session completed)
    console.log('\n--- Fixing stuck tables ---');
    const [stuckTables] = await pool.query(
      `SELECT t.id, t.table_number, t.status, ts.status as session_status
       FROM tables t
       LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status = 'active'
       WHERE t.status = 'billing' AND ts.id IS NULL`
    );
    for (const t of stuckTables) {
      await pool.query('UPDATE tables SET status = ? WHERE id = ?', ['available', t.id]);
      console.log(`  ✓ Table ${t.table_number} (${t.id}): billing → available`);
    }
    if (stuckTables.length === 0) console.log('  No stuck tables');

    // Final verification
    console.log('\n--- Final Verification ---');
    const [final] = await pool.query(
      `SELECT i.invoice_number, i.order_id, i.grand_total, i.nc_amount, i.nc_tax_amount, 
              i.total_tax, i.payment_status, o.status as order_status
       FROM invoices i LEFT JOIN orders o ON i.order_id=o.id
       WHERE i.is_nc = 1 AND i.is_cancelled = 0`
    );
    for (const r of final) {
      const ok = parseFloat(r.nc_tax_amount) === 0;
      console.log(`  ${ok ? '✓' : '✗'} ${r.invoice_number} order=${r.order_id} gt=${r.grand_total} nc=${r.nc_amount} nctax=${r.nc_tax_amount} tax=${r.total_tax} pay=${r.payment_status} status=${r.order_status}`);
    }

    console.log('\n=== Done ===');
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
