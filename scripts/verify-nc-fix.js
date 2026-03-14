/**
 * Verify NC fix - manually trigger invoice recalculation
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

  try {
    console.log('=== Verifying NC Fix ===\n');

    // 1. Get current order and items
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ? AND status != ?',
      [orderId, 'cancelled']
    );
    const [invoice] = await pool.query(
      'SELECT * FROM invoices WHERE order_id = ? AND is_cancelled = 0',
      [orderId]
    );

    console.log('1. Current State:');
    console.log(`   Order is_nc: ${order[0]?.is_nc}, nc_amount: ${order[0]?.nc_amount}`);
    console.log(`   Invoice is_nc: ${invoice[0]?.is_nc}, nc_amount: ${invoice[0]?.nc_amount}, payable: ${invoice[0]?.payable_amount}`);

    // 2. Calculate what the invoice should be
    let subtotal = 0;
    let ncAmount = 0;
    let ncTaxAmount = 0;
    let totalTax = 0;

    for (const item of items) {
      const itemTotal = parseFloat(item.total_price) || 0;
      const itemTax = parseFloat(item.tax_amount) || 0;
      subtotal += itemTotal;
      totalTax += itemTax;
      
      if (item.is_nc) {
        ncAmount += itemTotal;
        ncTaxAmount += itemTax;
      }
    }

    const grandTotal = Math.round(subtotal + totalTax);
    const totalNCExclusion = ncAmount + ncTaxAmount;
    const payableAmount = Math.max(0, grandTotal - totalNCExclusion);
    const hasNCItems = ncAmount > 0;

    console.log('\n2. Calculated Values:');
    console.log(`   Subtotal: ${subtotal}`);
    console.log(`   Total Tax: ${totalTax}`);
    console.log(`   Grand Total: ${grandTotal}`);
    console.log(`   NC Amount: ${ncAmount}`);
    console.log(`   NC Tax: ${ncTaxAmount}`);
    console.log(`   Total NC Exclusion: ${totalNCExclusion}`);
    console.log(`   Payable Amount: ${payableAmount}`);
    console.log(`   Has NC Items: ${hasNCItems}`);

    // 3. Update invoice with correct NC values
    if (invoice[0]) {
      console.log('\n3. Updating invoice with NC values...');
      await pool.query(
        `UPDATE invoices SET 
          is_nc = ?, nc_amount = ?, payable_amount = ?,
          amount_in_words = ?
         WHERE id = ?`,
        [
          hasNCItems ? 1 : 0,
          ncAmount,
          payableAmount,
          payableAmount === 0 ? 'Zero Rupees Only' : `Rupees ${payableAmount} Only`,
          invoice[0].id
        ]
      );
      console.log('   Invoice updated!');

      // Verify
      const [updatedInv] = await pool.query(
        'SELECT is_nc, nc_amount, payable_amount, grand_total FROM invoices WHERE id = ?',
        [invoice[0].id]
      );
      console.log('\n4. Updated Invoice:');
      console.log(`   is_nc: ${updatedInv[0]?.is_nc}`);
      console.log(`   nc_amount: ${updatedInv[0]?.nc_amount}`);
      console.log(`   payable_amount: ${updatedInv[0]?.payable_amount}`);
      console.log(`   grand_total: ${updatedInv[0]?.grand_total}`);
    }

    console.log('\n=== Fix Applied ===');
    console.log('Now call the bill API to verify: GET /api/v1/orders/869/bill');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
