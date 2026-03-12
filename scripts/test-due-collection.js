/**
 * Test script for Due Collection via Payment API
 * Run: node scripts/test-due-collection.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db'
  });

  console.log('=== DUE COLLECTION TEST ===\n');

  // Find an order with due amount
  const [orders] = await pool.query(`
    SELECT o.id, o.order_number, o.customer_id, o.total_amount, o.paid_amount, o.due_amount, 
           o.payment_status, o.status, c.name as customer_name, c.due_balance
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.due_amount > 0 AND o.payment_status = 'partial'
    ORDER BY o.created_at DESC
    LIMIT 1
  `);

  if (orders.length === 0) {
    console.log('No orders with due amount found. Create one first.');
    await pool.end();
    return;
  }

  const order = orders[0];
  console.log('Order with due:', {
    orderId: order.id,
    orderNumber: order.order_number,
    totalAmount: parseFloat(order.total_amount),
    paidAmount: parseFloat(order.paid_amount),
    dueAmount: parseFloat(order.due_amount),
    paymentStatus: order.payment_status,
    status: order.status,
    customerName: order.customer_name,
    customerDueBalance: parseFloat(order.due_balance)
  });

  // Get invoice
  const [invoices] = await pool.query(`
    SELECT id, invoice_number, grand_total, paid_amount, due_amount, payment_status
    FROM invoices WHERE order_id = ? AND is_cancelled = 0
  `, [order.id]);

  if (invoices.length > 0) {
    console.log('\nInvoice before collection:', invoices[0]);
  }

  console.log('\n--- To test due collection, make a POST request to: ---');
  console.log(`POST /api/v1/orders/payment`);
  console.log(`Body: {`);
  console.log(`  "orderId": ${order.id},`);
  if (invoices.length > 0) {
    console.log(`  "invoiceId": ${invoices[0].id},`);
  }
  console.log(`  "paymentMode": "cash",`);
  console.log(`  "amount": ${parseFloat(order.due_amount)}`);
  console.log(`}`);

  console.log('\n--- Expected result after collection: ---');
  console.log(`Order paid_amount: ${parseFloat(order.total_amount)}`);
  console.log(`Order due_amount: 0`);
  console.log(`Order payment_status: completed`);
  console.log(`Invoice payment_status: paid`);
  console.log(`Customer due_balance: ${parseFloat(order.due_balance) - parseFloat(order.due_amount)}`);

  await pool.end();
}

main().catch(console.error);
