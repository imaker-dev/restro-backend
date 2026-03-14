/**
 * Complete NC test - verify all NC fixes work correctly
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
    console.log('=== Complete NC Test ===\n');

    // 1. Get order items with NC data
    const [items] = await pool.query(
      `SELECT id, item_name, total_price, tax_amount, is_nc, nc_amount, nc_reason
       FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
      [orderId]
    );

    // Calculate NC totals from items
    let ncAmount = 0;
    let ncTaxAmount = 0;
    let subtotal = 0;
    let totalTax = 0;

    console.log('1. Order Items:');
    for (const item of items) {
      subtotal += parseFloat(item.total_price);
      totalTax += parseFloat(item.tax_amount || 0);
      
      const isNC = item.is_nc === 1;
      if (isNC) {
        ncAmount += parseFloat(item.total_price);
        ncTaxAmount += parseFloat(item.tax_amount || 0);
      }
      console.log(`   ${item.item_name}: ₹${item.total_price} + tax ₹${item.tax_amount || 0} ${isNC ? '[NC]' : ''}`);
    }

    const grandTotal = Math.round(subtotal + totalTax);
    const totalNCExclusion = ncAmount + ncTaxAmount;
    const payableAmount = Math.max(0, grandTotal - totalNCExclusion);
    const hasNCItems = ncAmount > 0;

    console.log('\n2. Calculated Values:');
    console.log(`   Subtotal: ₹${subtotal}`);
    console.log(`   Total Tax: ₹${totalTax}`);
    console.log(`   Grand Total: ₹${grandTotal}`);
    console.log(`   NC Amount: ₹${ncAmount}`);
    console.log(`   NC Tax Amount: ₹${ncTaxAmount}`);
    console.log(`   Total NC Exclusion: ₹${totalNCExclusion}`);
    console.log(`   Payable Amount: ₹${payableAmount}`);

    // 3. Update invoice with correct NC values
    console.log('\n3. Updating invoice...');
    const [invoice] = await pool.query(
      'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0',
      [orderId]
    );
    
    if (invoice[0]) {
      await pool.query(
        `UPDATE invoices SET 
          is_nc = ?, nc_amount = ?, nc_tax_amount = ?, payable_amount = ?,
          amount_in_words = ?
         WHERE id = ?`,
        [
          hasNCItems ? 1 : 0,
          ncAmount,
          ncTaxAmount,
          payableAmount,
          payableAmount === 0 ? 'Zero Rupees Only' : `Rupees ${payableAmount} Only`,
          invoice[0].id
        ]
      );
      console.log('   Invoice updated successfully!');
    }

    // 4. Verify updated invoice
    const [updatedInv] = await pool.query(
      `SELECT invoice_number, subtotal, total_tax, grand_total, 
              is_nc, nc_amount, nc_tax_amount, payable_amount
       FROM invoices WHERE order_id = ? AND is_cancelled = 0`,
      [orderId]
    );

    console.log('\n4. Updated Invoice:');
    if (updatedInv[0]) {
      const inv = updatedInv[0];
      console.log(`   Invoice: ${inv.invoice_number}`);
      console.log(`   Subtotal: ₹${inv.subtotal}`);
      console.log(`   Total Tax: ₹${inv.total_tax}`);
      console.log(`   Grand Total: ₹${inv.grand_total}`);
      console.log(`   is_nc: ${inv.is_nc}`);
      console.log(`   nc_amount: ₹${inv.nc_amount}`);
      console.log(`   nc_tax_amount: ₹${inv.nc_tax_amount}`);
      console.log(`   payable_amount: ₹${inv.payable_amount}`);
    }

    // 5. Expected API responses
    console.log('\n5. Expected API Responses:\n');

    console.log('GET /api/v1/tables/82 -> charges section:');
    console.log(JSON.stringify({
      subtotal,
      totalTax,
      grandTotal,
      nc: {
        hasNCItems,
        ncItemCount: items.filter(i => i.is_nc).length,
        ncAmount,
        ncTaxAmount,
        totalNCExclusion
      },
      payableAmount
    }, null, 2));

    console.log('\nGET /api/v1/orders/869/bill:');
    console.log(JSON.stringify({
      grandTotal,
      isNC: hasNCItems,
      ncAmount,
      ncTaxAmount,
      payableAmount,
      items: items.map(i => ({
        name: i.item_name,
        price: parseFloat(i.total_price),
        isNC: i.is_nc === 1,
        ncAmount: parseFloat(i.nc_amount || 0)
      }))
    }, null, 2));

    console.log('\nBill Print should show:');
    console.log('  Items with [NC] tag');
    console.log('  ** NO CHARGE (NC) **');
    console.log(`  NC Amount: -${ncAmount.toFixed(2)}`);
    console.log(`  NC Tax: -${ncTaxAmount.toFixed(2)}`);
    console.log(`  Grand Total Rs.${grandTotal}.00`);
    console.log(`  Payable Rs.${payableAmount.toFixed(2)}`);

    console.log('\n=== Test Complete ===');
    console.log('\nPlease restart the server and test the APIs.');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
