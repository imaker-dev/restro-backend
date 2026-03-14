/**
 * Diagnose NC issue - check order 869 and item 1788
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
  const itemId = 1788;

  try {
    console.log('=== Diagnosing NC Issue ===\n');

    // 1. Check order NC fields
    console.log('1. Order NC fields:');
    const [orders] = await pool.query(
      `SELECT id, order_number, status, is_nc, nc_amount, 
              total_amount, subtotal
       FROM orders WHERE id = ?`,
      [orderId]
    );
    if (orders[0]) {
      console.table([{
        order_number: orders[0].order_number,
        status: orders[0].status,
        is_nc: orders[0].is_nc,
        nc_amount: parseFloat(orders[0].nc_amount || 0),
        total_amount: parseFloat(orders[0].total_amount),
        subtotal: parseFloat(orders[0].subtotal)
      }]);
    }

    // 2. Check order items NC fields
    console.log('\n2. Order Items NC fields:');
    const [items] = await pool.query(
      `SELECT id, item_name, quantity, total_price, tax_amount, status,
              is_nc, nc_reason_id, nc_reason, nc_amount, nc_by, nc_at
       FROM order_items WHERE order_id = ?`,
      [orderId]
    );
    console.table(items.map(i => ({
      id: i.id,
      item: i.item_name,
      price: parseFloat(i.total_price),
      tax: parseFloat(i.tax_amount || 0),
      status: i.status,
      is_nc: i.is_nc,
      nc_amount: parseFloat(i.nc_amount || 0),
      nc_reason: i.nc_reason
    })));

    // 3. Check invoice NC fields
    console.log('\n3. Invoice NC fields:');
    const [invoices] = await pool.query(
      `SELECT id, invoice_number, subtotal, total_tax, grand_total,
              is_nc, nc_amount, payable_amount
       FROM invoices WHERE order_id = ? AND is_cancelled = 0`,
      [orderId]
    );
    if (invoices[0]) {
      console.table([{
        invoice_number: invoices[0].invoice_number,
        subtotal: parseFloat(invoices[0].subtotal),
        total_tax: parseFloat(invoices[0].total_tax),
        grand_total: parseFloat(invoices[0].grand_total),
        is_nc: invoices[0].is_nc,
        nc_amount: parseFloat(invoices[0].nc_amount || 0),
        payable_amount: parseFloat(invoices[0].payable_amount || invoices[0].grand_total)
      }]);
    }

    // 4. Check NC logs
    console.log('\n4. NC Logs for order:');
    const [ncLogs] = await pool.query(
      `SELECT id, order_item_id, action_type, nc_amount, nc_reason, item_name, applied_at
       FROM nc_logs WHERE order_id = ? ORDER BY applied_at DESC`,
      [orderId]
    );
    if (ncLogs.length > 0) {
      console.table(ncLogs.map(l => ({
        id: l.id,
        item_id: l.order_item_id,
        action: l.action_type,
        amount: parseFloat(l.nc_amount || 0),
        reason: l.nc_reason,
        item: l.item_name,
        at: l.applied_at
      })));
    } else {
      console.log('   No NC logs found');
    }

    // 5. Check order_items table structure for is_nc column
    console.log('\n5. order_items is_nc column info:');
    const [columns] = await pool.query(
      `SHOW COLUMNS FROM order_items WHERE Field = 'is_nc'`
    );
    if (columns[0]) {
      console.log(`   Type: ${columns[0].Type}`);
      console.log(`   Null: ${columns[0].Null}`);
      console.log(`   Default: ${columns[0].Default}`);
    }

    // 6. Raw check of item 1788
    console.log(`\n6. Raw data for item ${itemId}:`);
    const [rawItem] = await pool.query(
      `SELECT * FROM order_items WHERE id = ?`,
      [itemId]
    );
    if (rawItem[0]) {
      console.log(`   is_nc value: ${rawItem[0].is_nc} (type: ${typeof rawItem[0].is_nc})`);
      console.log(`   nc_amount: ${rawItem[0].nc_amount}`);
      console.log(`   nc_reason: ${rawItem[0].nc_reason}`);
      console.log(`   nc_reason_id: ${rawItem[0].nc_reason_id}`);
      console.log(`   nc_by: ${rawItem[0].nc_by}`);
      console.log(`   nc_at: ${rawItem[0].nc_at}`);
    }

    // 7. Summary and fix suggestion
    console.log('\n7. Analysis:');
    const item = rawItem[0];
    if (item) {
      if (item.nc_amount > 0 && !item.is_nc) {
        console.log('   ISSUE: nc_amount > 0 but is_nc = 0/false');
        console.log('   The is_nc flag is not being set when NC is applied!');
      } else if (item.is_nc && item.nc_amount > 0) {
        console.log('   Item NC is correctly set');
      }
    }

    const inv = invoices[0];
    if (inv) {
      const itemsNC = items.filter(i => i.is_nc && i.status !== 'cancelled');
      const totalItemNC = itemsNC.reduce((sum, i) => sum + parseFloat(i.nc_amount || 0), 0);
      if (totalItemNC > 0 && parseFloat(inv.nc_amount) === 0) {
        console.log('   ISSUE: Items have NC but invoice nc_amount = 0');
        console.log('   Invoice needs to be recalculated with NC amounts');
      }
      if (totalItemNC > 0 && parseFloat(inv.payable_amount) === parseFloat(inv.grand_total)) {
        console.log('   ISSUE: payable_amount should be reduced by NC amount');
        console.log(`   Expected payable: ${parseFloat(inv.grand_total) - totalItemNC}`);
      }
    }

    console.log('\n=== Diagnosis Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
