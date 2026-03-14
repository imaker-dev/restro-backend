/**
 * Fix ALL invoices that have NC items but incorrect grand_total
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
    // Find all non-cancelled invoices
    const [invoices] = await pool.query(
      'SELECT id, order_id, invoice_number, grand_total, is_nc, nc_amount, nc_tax_amount, payable_amount FROM invoices WHERE is_cancelled = 0'
    );

    let fixed = 0;
    for (const inv of invoices) {
      // Get NC items for this order
      const [items] = await pool.query(
        `SELECT total_price, tax_amount, is_nc 
         FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
        [inv.order_id]
      );

      let subtotal = 0, totalTax = 0, ncAmount = 0, ncTaxAmount = 0;
      for (const item of items) {
        subtotal += parseFloat(item.total_price);
        totalTax += parseFloat(item.tax_amount || 0);
        if (item.is_nc) {
          ncAmount += parseFloat(item.total_price);
          ncTaxAmount += parseFloat(item.tax_amount || 0);
        }
      }

      if (ncAmount === 0) continue; // No NC items, skip

      const preRound = subtotal + totalTax - ncAmount - ncTaxAmount;
      const grandTotal = Math.max(0, Math.round(preRound));
      const roundOff = parseFloat((grandTotal - preRound).toFixed(2));
      const isNC = ncAmount > 0;

      // Check if needs update
      const currentGT = parseFloat(inv.grand_total);
      if (Math.abs(currentGT - grandTotal) > 0.01 || !inv.is_nc) {
        await pool.query(
          `UPDATE invoices SET 
            grand_total = ?, round_off = ?,
            is_nc = ?, nc_amount = ?, nc_tax_amount = ?, payable_amount = ?,
            amount_in_words = ?
           WHERE id = ?`,
          [
            grandTotal, roundOff,
            isNC ? 1 : 0, ncAmount, ncTaxAmount, grandTotal,
            grandTotal === 0 ? 'Zero Rupees Only' : null,
            inv.id
          ]
        );
        console.log(`Fixed ${inv.invoice_number}: grand_total ${currentGT} → ${grandTotal} (NC: ${ncAmount} + tax ${ncTaxAmount})`);
        fixed++;
      }
    }

    if (fixed === 0) {
      console.log('All invoices are already correct.');
    } else {
      console.log(`\nFixed ${fixed} invoice(s).`);
    }

    // Verify order 869 specifically
    const [result] = await pool.query(
      `SELECT i.invoice_number, i.subtotal, i.total_tax, i.grand_total, i.round_off,
              i.is_nc, i.nc_amount, i.nc_tax_amount, i.payable_amount
       FROM invoices i WHERE i.order_id = 869 AND i.is_cancelled = 0`,
      []
    );
    if (result[0]) {
      console.log('\nOrder 869 invoice:');
      console.log(JSON.stringify(result[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
