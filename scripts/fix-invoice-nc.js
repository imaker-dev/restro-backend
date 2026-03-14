/**
 * Fix existing invoice to reflect new NC logic:
 * grandTotal = final amount after NC deduction (no separate payableAmount)
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

  const orderId = 871;

  try {
    console.log('=== Fix Invoice NC ===\n');

    // 1. Get items
    const [items] = await pool.query(
      `SELECT id, item_name, total_price, tax_amount, is_nc, nc_amount
       FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
      [orderId]
    );

    let subtotal = 0, totalTax = 0, ncAmount = 0, ncTaxAmount = 0;
    for (const item of items) {
      const price = parseFloat(item.total_price);
      const tax = parseFloat(item.tax_amount || 0);
      subtotal += price;
      totalTax += tax;
      if (item.is_nc) {
        ncAmount += price;
        ncTaxAmount += tax;
      }
      console.log(`  ${item.item_name}: price=${price}, tax=${tax}, is_nc=${item.is_nc}`);
    }

    // grandTotal = final amount (NC deducted)
    const preRound = subtotal + totalTax - ncAmount - ncTaxAmount;
    const grandTotal = Math.max(0, Math.round(preRound));
    const roundOff = grandTotal - preRound;

    console.log(`\n  subtotal: ${subtotal}`);
    console.log(`  totalTax: ${totalTax}`);
    console.log(`  ncAmount: ${ncAmount}`);
    console.log(`  ncTaxAmount: ${ncTaxAmount}`);
    console.log(`  grandTotal (after NC): ${grandTotal}`);
    console.log(`  roundOff: ${roundOff.toFixed(2)}`);

    // 2. Update invoice
    const [invoice] = await pool.query(
      'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0',
      [orderId]
    );

    if (invoice[0]) {
      await pool.query(
        `UPDATE invoices SET 
          grand_total = ?, round_off = ?,
          is_nc = ?, nc_amount = ?, nc_tax_amount = ?, payable_amount = ?,
          amount_in_words = ?
         WHERE id = ?`,
        [
          grandTotal,
          parseFloat(roundOff.toFixed(2)),
          ncAmount > 0 ? 1 : 0,
          ncAmount,
          ncTaxAmount,
          grandTotal,
          grandTotal === 0 ? 'Zero Rupees Only' : `Rupees ${grandTotal} Only`,
          invoice[0].id
        ]
      );
      console.log('\n  Invoice updated!');
    }

    // 3. Verify
    const [updated] = await pool.query(
      `SELECT invoice_number, subtotal, total_tax, grand_total, round_off,
              is_nc, nc_amount, nc_tax_amount, payable_amount, amount_in_words
       FROM invoices WHERE order_id = ? AND is_cancelled = 0`,
      [orderId]
    );

    if (updated[0]) {
      const inv = updated[0];
      console.log('\n  Updated Invoice:');
      console.log(`    invoice: ${inv.invoice_number}`);
      console.log(`    subtotal: ${inv.subtotal}`);
      console.log(`    total_tax: ${inv.total_tax}`);
      console.log(`    grand_total: ${inv.grand_total} (this is the final payable)`);
      console.log(`    round_off: ${inv.round_off}`);
      console.log(`    is_nc: ${inv.is_nc}`);
      console.log(`    nc_amount: ${inv.nc_amount}`);
      console.log(`    nc_tax_amount: ${inv.nc_tax_amount}`);
      console.log(`    amount_in_words: ${inv.amount_in_words}`);
    }

    // 4. Expected bill API response
    console.log('\n  Expected POST /orders/869/bill response:');
    console.log('  {');
    console.log(`    "subtotal": ${subtotal},`);
    console.log(`    "totalTax": ${totalTax},`);
    console.log(`    "grandTotal": ${grandTotal},`);
    console.log(`    "isNC": ${ncAmount > 0},`);
    console.log(`    "ncAmount": ${ncAmount},`);
    console.log(`    "ncTaxAmount": ${ncTaxAmount},`);
    console.log('    "items": [');
    for (const item of items) {
      console.log(`      { "name": "${item.item_name}", "isNC": ${item.is_nc === 1} },`);
    }
    console.log('    ]');
    console.log('  }');

    console.log('\n=== Done ===');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
