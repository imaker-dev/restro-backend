/**
 * Test NC bill fix - verify invoice gets recalculated with NC amounts
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
    console.log('=== Testing NC Bill Fix ===\n');

    // 1. Current state before fix
    console.log('1. Current Invoice State:');
    const [invoicesBefore] = await pool.query(
      `SELECT id, invoice_number, subtotal, total_tax, grand_total,
              is_nc, nc_amount, payable_amount
       FROM invoices WHERE order_id = ? AND is_cancelled = 0`,
      [orderId]
    );
    if (invoicesBefore[0]) {
      const inv = invoicesBefore[0];
      console.log(`   Invoice: ${inv.invoice_number}`);
      console.log(`   Grand Total: ₹${parseFloat(inv.grand_total)}`);
      console.log(`   is_nc: ${inv.is_nc}`);
      console.log(`   nc_amount: ₹${parseFloat(inv.nc_amount || 0)}`);
      console.log(`   payable_amount: ₹${parseFloat(inv.payable_amount || inv.grand_total)}`);
    }

    // 2. Check order items NC
    console.log('\n2. Order Items NC Status:');
    const [items] = await pool.query(
      `SELECT id, item_name, total_price, tax_amount, is_nc, nc_amount
       FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
      [orderId]
    );
    let totalItemNC = 0;
    let totalItemNCTax = 0;
    for (const item of items) {
      console.log(`   ${item.item_name}: is_nc=${item.is_nc}, nc_amount=₹${parseFloat(item.nc_amount || 0)}`);
      if (item.is_nc) {
        totalItemNC += parseFloat(item.nc_amount || item.total_price || 0);
        totalItemNCTax += parseFloat(item.tax_amount || 0);
      }
    }
    console.log(`   Total NC Amount: ₹${totalItemNC}`);
    console.log(`   Total NC Tax: ₹${totalItemNCTax}`);

    // 3. Calculate expected payable
    const inv = invoicesBefore[0];
    if (inv) {
      const grandTotal = parseFloat(inv.grand_total);
      const expectedPayable = grandTotal - totalItemNC - totalItemNCTax;
      console.log('\n3. Expected After Fix:');
      console.log(`   Grand Total: ₹${grandTotal}`);
      console.log(`   NC Amount: ₹${totalItemNC}`);
      console.log(`   NC Tax: ₹${totalItemNCTax}`);
      console.log(`   Expected Payable: ₹${Math.max(0, expectedPayable)}`);
    }

    // 4. Simulate what calculateBillDetails would do
    console.log('\n4. Simulating calculateBillDetails logic:');
    let calcSubtotal = 0;
    let calcNCAmount = 0;
    let calcNCTax = 0;
    for (const item of items) {
      calcSubtotal += parseFloat(item.total_price);
      if (item.is_nc) {
        calcNCAmount += parseFloat(item.total_price);
        calcNCTax += parseFloat(item.tax_amount || 0);
      }
    }
    console.log(`   Subtotal: ₹${calcSubtotal}`);
    console.log(`   NC Amount (from NC items): ₹${calcNCAmount}`);
    console.log(`   NC Tax (from NC items): ₹${calcNCTax}`);
    console.log(`   Total NC Exclusion: ₹${calcNCAmount + calcNCTax}`);
    
    // Grand total from invoice
    if (inv) {
      const gt = parseFloat(inv.grand_total);
      console.log(`   Grand Total: ₹${gt}`);
      console.log(`   Payable = ${gt} - (${calcNCAmount} + ${calcNCTax}) = ₹${gt - calcNCAmount - calcNCTax}`);
    }

    console.log('\n5. To test the fix, call the bill API:');
    console.log(`   POST /api/v1/orders/${orderId}/bill`);
    console.log('   The invoice should be recalculated with NC amounts.');

    console.log('\n=== Test Setup Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
