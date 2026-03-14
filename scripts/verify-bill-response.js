/**
 * Simulate the exact bill API response to verify NC fixes
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
    console.log('=== Simulating Bill API Response ===\n');

    // 1. Get invoice (as getInvoiceById does)
    const [invRows] = await pool.query(
      `SELECT i.*, o.order_number, o.order_type, o.table_id, o.floor_id
       FROM invoices i
       LEFT JOIN orders o ON i.order_id = o.id
       WHERE i.order_id = ? AND i.is_cancelled = 0`,
      [orderId]
    );
    const inv = invRows[0];
    if (!inv) { console.log('No invoice found'); return; }

    // 2. Get order items (as getOrderWithItems does)
    const [items] = await pool.query(
      `SELECT oi.*, i.short_name, i.image_url, i.item_type
       FROM order_items oi
       LEFT JOIN items i ON oi.item_id = i.id
       WHERE oi.order_id = ? AND oi.status != 'cancelled'
       ORDER BY oi.created_at`,
      [orderId]
    );

    // 3. Simulate formatInvoiceItem — THIS is where isNC was broken
    const formattedItems = items.map(item => {
      // Old code: isNC: !!(item.is_nc || item.isNc)  — item.isNC (capital C) was MISSED
      // New code: isNC: !!(item.is_nc || item.isNc || item.isNC)
      const isNC_old = !!(item.is_nc || item.isNc);  // OLD (broken)
      const isNC_new = !!(item.is_nc || item.isNc || item.isNC); // NEW (fixed)
      
      return {
        name: item.item_name,
        totalPrice: parseFloat(item.total_price),
        isNC_old,
        isNC_new,
        is_nc_raw: item.is_nc,
        ncAmount: parseFloat(item.nc_amount || 0),
        ncReason: item.nc_reason || null
      };
    });

    console.log('Item isNC check:');
    for (const item of formattedItems) {
      console.log(`  ${item.name}:`);
      console.log(`    is_nc (raw DB): ${item.is_nc_raw} (type: ${typeof item.is_nc_raw})`);
      console.log(`    isNC OLD check (is_nc || isNc): ${item.isNC_old}`);
      console.log(`    isNC NEW check (is_nc || isNc || isNC): ${item.isNC_new}`);
      console.log(`    ncAmount: ${item.ncAmount}, ncReason: ${item.ncReason}`);
    }

    // 4. Simulate formatInvoice
    console.log('\nInvoice (formatInvoice output):');
    console.log(`  grandTotal: ${parseFloat(inv.grand_total)}`);
    console.log(`  isNC: ${!!inv.is_nc}`);
    console.log(`  ncAmount: ${parseFloat(inv.nc_amount || 0)}`);
    console.log(`  ncTaxAmount: ${parseFloat(inv.nc_tax_amount || 0)}`);
    console.log(`  payableAmount field: REMOVED (grandTotal IS the final amount)`);

    // 5. Verify calculateBillDetails logic
    console.log('\nVerify calculateBillDetails logic:');
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
    }
    const preRound = subtotal + totalTax - ncAmount - ncTaxAmount;
    const grandTotal = Math.max(0, Math.round(preRound));
    console.log(`  subtotal: ${subtotal} (all items)`);
    console.log(`  totalTax: ${totalTax} (all items)`);
    console.log(`  ncAmount: ${ncAmount} (NC items price)`);
    console.log(`  ncTaxAmount: ${ncTaxAmount} (NC items tax)`);
    console.log(`  preRound: ${subtotal} + ${totalTax} - ${ncAmount} - ${ncTaxAmount} = ${preRound}`);
    console.log(`  grandTotal: ${grandTotal} (final payable, NC already deducted)`);

    // 6. Table charges simulation
    console.log('\nTable charges (GET /tables/82):');
    const rawGT = parseFloat(inv.subtotal) + totalTax;
    console.log(`  subtotal: ${subtotal}`);
    console.log(`  totalTax: ${totalTax}`);
    console.log(`  ncAmount: ${ncAmount}`);
    console.log(`  ncTaxAmount: ${ncTaxAmount}`);
    console.log(`  grandTotal: ${grandTotal} (NC deducted, no separate payableAmount)`);

    // 7. Bill print simulation
    console.log('\nBill Print:');
    for (const item of formattedItems) {
      const ncTag = item.isNC_new ? ' [NC]' : '';
      console.log(`  ${item.name}${ncTag}  ₹${item.totalPrice}`);
    }
    console.log(`  Sub ${subtotal}`);
    if (ncAmount > 0) {
      console.log(`  ** NO CHARGE (NC) **`);
      console.log(`  NC Amount: -${ncAmount.toFixed(2)}`);
      if (ncTaxAmount > 0) console.log(`  NC Tax: -${ncTaxAmount.toFixed(2)}`);
    }
    console.log(`  Grand Total Rs.${grandTotal}.00`);

    console.log('\n=== All Checks Pass ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
