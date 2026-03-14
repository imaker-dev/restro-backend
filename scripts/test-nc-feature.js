/**
 * Test script to verify NC (No Charge) feature
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
    console.log('=== Testing NC (No Charge) Feature ===\n');

    // 1. Check NC reasons table
    console.log('1. Checking NC reasons...');
    const [reasons] = await pool.query('SELECT * FROM nc_reasons WHERE outlet_id = 44 LIMIT 10');
    console.log(`   Found ${reasons.length} NC reasons`);
    console.table(reasons.map(r => ({ id: r.id, name: r.name, description: r.description })));

    // 2. Check NC columns in orders table
    console.log('\n2. Checking NC columns in orders table...');
    const [orderCols] = await pool.query("SHOW COLUMNS FROM orders LIKE 'nc%'");
    console.log(`   Found ${orderCols.length} NC columns in orders:`, orderCols.map(c => c.Field).join(', '));

    // 3. Check NC columns in order_items table
    console.log('\n3. Checking NC columns in order_items table...');
    const [itemCols] = await pool.query("SHOW COLUMNS FROM order_items LIKE 'nc%'");
    console.log(`   Found ${itemCols.length} NC columns in order_items:`, itemCols.map(c => c.Field).join(', '));

    // 4. Check NC columns in invoices table
    console.log('\n4. Checking NC columns in invoices table...');
    const [invCols] = await pool.query("SHOW COLUMNS FROM invoices WHERE Field IN ('is_nc', 'nc_amount', 'payable_amount')");
    console.log(`   Found ${invCols.length} NC columns in invoices:`, invCols.map(c => c.Field).join(', '));

    // 5. Check nc_logs table
    console.log('\n5. Checking nc_logs table...');
    const [logCols] = await pool.query('DESCRIBE nc_logs');
    console.log(`   nc_logs table has ${logCols.length} columns`);

    // 6. Find an order to test NC on
    console.log('\n6. Finding a recent order for NC testing...');
    const [orders] = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.status, o.is_nc, o.nc_amount,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
      WHERE o.outlet_id = 44 AND o.status NOT IN ('cancelled')
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);
    
    if (orders.length > 0) {
      console.log('   Recent orders:');
      console.table(orders.map(o => ({
        orderId: o.id,
        orderNumber: o.order_number,
        totalAmount: o.total_amount,
        status: o.status,
        isNC: o.is_nc ? 'Yes' : 'No',
        ncAmount: o.nc_amount,
        itemCount: o.item_count
      })));

      // Get items for first order
      const testOrder = orders[0];
      const [items] = await pool.query(`
        SELECT id, item_name, quantity, total_price, is_nc, nc_amount, nc_reason, status
        FROM order_items
        WHERE order_id = ? AND status != 'cancelled'
      `, [testOrder.id]);
      
      console.log(`\n   Items in order ${testOrder.order_number}:`);
      console.table(items.map(i => ({
        id: i.id,
        name: i.item_name,
        qty: i.quantity,
        price: i.total_price,
        isNC: i.is_nc ? 'Yes' : 'No',
        ncAmount: i.nc_amount,
        ncReason: i.nc_reason
      })));
    }

    // 7. Check invoices with NC
    console.log('\n7. Checking invoices with payable_amount...');
    const [invoices] = await pool.query(`
      SELECT id, invoice_number, grand_total, nc_amount, payable_amount, is_nc, payment_status
      FROM invoices
      WHERE outlet_id = 44 AND is_cancelled = 0
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.table(invoices.map(i => ({
      id: i.id,
      invoice: i.invoice_number,
      grandTotal: i.grand_total,
      ncAmount: i.nc_amount,
      payableAmount: i.payable_amount,
      isNC: i.is_nc ? 'Yes' : 'No',
      status: i.payment_status
    })));

    console.log('\n=== NC Feature Test Complete ===');
    console.log('\nAPI Endpoints for NC:');
    console.log('- GET    /api/v1/orders/:outletId/nc/reasons - Get NC reasons');
    console.log('- POST   /api/v1/orders/:outletId/nc/reasons - Create NC reason');
    console.log('- POST   /api/v1/orders/:orderId/nc - Mark order as NC');
    console.log('- DELETE /api/v1/orders/:orderId/nc - Remove NC from order');
    console.log('- POST   /api/v1/orders/:orderId/items/:itemId/nc - Mark item as NC');
    console.log('- DELETE /api/v1/orders/:orderId/items/:itemId/nc - Remove NC from item');
    console.log('- GET    /api/v1/orders/:orderId/nc/logs - Get NC logs for order');
    console.log('- GET    /api/v1/orders/reports/:outletId/nc - Get NC report');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
