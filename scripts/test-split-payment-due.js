/**
 * Test script to verify split payment due collection fix
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
    console.log('=== Testing Split Payment Due Collection Fix ===\n');

    // Find an order with due amount for testing
    const [ordersWithDue] = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.paid_amount, o.due_amount, 
             o.payment_status, o.status, o.customer_id, o.customer_phone,
             i.id as invoice_id, i.invoice_number, i.grand_total
      FROM orders o
      LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
      WHERE o.outlet_id = 44 AND o.due_amount > 0 AND o.customer_id IS NOT NULL
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    console.log('1. Orders with pending dues:');
    if (ordersWithDue.length === 0) {
      console.log('   No orders with pending dues found.');
    } else {
      console.table(ordersWithDue.map(o => ({
        orderId: o.id,
        orderNumber: o.order_number,
        invoiceId: o.invoice_id,
        grandTotal: o.grand_total,
        paidAmount: o.paid_amount,
        dueAmount: o.due_amount,
        paymentStatus: o.payment_status,
        orderStatus: o.status,
        customerId: o.customer_id
      })));
    }

    // Check existing payments for these orders
    if (ordersWithDue.length > 0) {
      const orderIds = ordersWithDue.map(o => o.id);
      const [payments] = await pool.query(`
        SELECT p.id, p.order_id, p.payment_mode, p.amount, p.total_amount, p.status, p.created_at
        FROM payments p
        WHERE p.order_id IN (?)
        ORDER BY p.created_at DESC
      `, [orderIds]);

      console.log('\n2. Existing payments for these orders:');
      if (payments.length === 0) {
        console.log('   No payments found.');
      } else {
        console.table(payments);
      }

      // Check due transactions
      const [dueTransactions] = await pool.query(`
        SELECT cdt.id, cdt.customer_id, cdt.order_id, cdt.transaction_type, cdt.amount, cdt.created_at
        FROM customer_due_transactions cdt
        WHERE cdt.order_id IN (?)
        ORDER BY cdt.created_at DESC
      `, [orderIds]);

      console.log('\n3. Due transactions for these orders:');
      if (dueTransactions.length === 0) {
        console.log('   No due transactions found.');
      } else {
        console.table(dueTransactions);
      }
    }

    // Simulate split payment calculation
    if (ordersWithDue.length > 0) {
      const testOrder = ordersWithDue[0];
      console.log('\n4. Simulating split payment for order:', testOrder.order_number);
      console.log(`   Current state: paid=${testOrder.paid_amount}, due=${testOrder.due_amount}, total=${testOrder.grand_total || testOrder.total_amount}`);
      
      const splitAmount = 300; // Example split payment amount
      const newPaidAmount = parseFloat(testOrder.paid_amount) + splitAmount;
      const orderTotal = parseFloat(testOrder.grand_total || testOrder.total_amount);
      const newDueAmount = orderTotal - newPaidAmount;
      
      console.log(`   If split payment of ${splitAmount} is made:`);
      console.log(`   - New paid amount: ${newPaidAmount}`);
      console.log(`   - New due amount: ${newDueAmount}`);
      console.log(`   - Payment status: ${newDueAmount <= 0 ? 'completed' : 'partial'}`);
      console.log(`   - Order status: ${newDueAmount <= 0 ? 'completed' : (testOrder.customer_id ? 'completed (due payment)' : testOrder.status)}`);
      
      // Check if due collection transaction would be created
      const previousDue = parseFloat(testOrder.due_amount);
      if (previousDue > 0 && testOrder.customer_id) {
        console.log(`   - Due collection transaction would be created for: ${Math.min(splitAmount, previousDue)}`);
      }
    }

    console.log('\n=== Test Complete ===');
    console.log('\nTo test the actual API, use:');
    console.log('POST /api/v1/orders/payment/split');
    console.log('Body: { orderId: <id>, invoiceId: <id>, outletId: 44, splits: [{ paymentMode: "cash", amount: 100 }, { paymentMode: "upi", amount: 200 }] }');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
