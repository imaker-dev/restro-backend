/**
 * Test all due-related APIs
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

let pool;

async function getPool() {
  if (!pool) {
    pool = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'restro_db'
    });
  }
  return pool;
}

// Test 1: /customers/:outletId/due-list
async function testDueList(outletId) {
  const db = await getPool();
  
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.phone,
            COALESCE(od.actual_due, 0) as actual_due,
            COALESCE(od.pending_due_orders, 0) as pending_due_orders,
            COALESCE(od.total_paid, 0) as total_paid
     FROM customers c
     LEFT JOIN (
       SELECT customer_id, 
              SUM(due_amount) as actual_due,
              COUNT(*) as pending_due_orders,
              SUM(paid_amount) as total_paid
       FROM orders 
       WHERE due_amount > 0
       GROUP BY customer_id
     ) od ON od.customer_id = c.id
     WHERE c.outlet_id = ? AND c.is_active = 1 AND COALESCE(od.actual_due, 0) > 0
     ORDER BY actual_due DESC`,
    [outletId]
  );
  
  return rows;
}

// Test 2: /customers/:outletId/due/:customerId
async function testCustomerDue(customerId) {
  const db = await getPool();
  
  const [customer] = await db.query(
    `SELECT id, name, phone, email FROM customers WHERE id = ?`,
    [customerId]
  );
  if (!customer[0]) return null;

  const [pendingOrders] = await db.query(
    `SELECT o.id, o.order_number, o.total_amount, o.paid_amount, o.due_amount, o.created_at,
            i.invoice_number
     FROM orders o
     LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
     WHERE o.customer_id = ? AND o.due_amount > 0
     ORDER BY o.created_at DESC`,
    [customerId]
  );

  const actualDueBalance = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.due_amount) || 0), 0);
  const totalPaidOnDueOrders = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.paid_amount) || 0), 0);

  if (pendingOrders.length === 0) {
    return null;
  }

  return {
    customerId: customer[0].id,
    customerName: customer[0].name,
    customerPhone: customer[0].phone,
    dueBalance: actualDueBalance,
    totalDueCollected: totalPaidOnDueOrders,
    pendingOrdersCount: pendingOrders.length,
    pendingOrders: pendingOrders.map(o => ({
      orderId: o.id,
      orderNumber: o.order_number,
      invoiceNumber: o.invoice_number,
      totalAmount: parseFloat(o.total_amount) || 0,
      paidAmount: parseFloat(o.paid_amount) || 0,
      dueAmount: parseFloat(o.due_amount) || 0
    }))
  };
}

// Test 3: /api/v1/orders/reports/:outletId/due
async function testDueReport(outletId) {
  const db = await getPool();
  
  const [customers] = await db.query(
    `SELECT 
      c.id, c.name, c.phone, c.email, c.total_orders, c.total_spent, c.created_at,
      COALESCE(SUM(o.due_amount), 0) as actual_due,
      COUNT(o.id) as total_due_orders,
      MAX(o.created_at) as last_due_date,
      COALESCE(SUM(o.paid_amount), 0) as total_paid_on_due_orders
     FROM customers c
     INNER JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0
     WHERE c.outlet_id = ? AND c.is_active = 1
     GROUP BY c.id
     HAVING actual_due > 0
     ORDER BY actual_due DESC`,
    [outletId]
  );

  const [[summary]] = await db.query(
    `SELECT 
      COUNT(DISTINCT c.id) as total_customers_with_due,
      COALESCE(SUM(o.due_amount), 0) as total_outstanding_due,
      COALESCE(SUM(o.paid_amount), 0) as total_collected,
      COUNT(o.id) as total_orders_with_due
     FROM customers c
     INNER JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0
     WHERE c.outlet_id = ? AND c.is_active = 1`,
    [outletId]
  );

  return {
    customers: customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      dueBalance: parseFloat(c.actual_due) || 0,
      totalDueCollected: parseFloat(c.total_paid_on_due_orders) || 0,
      totalDueOrders: c.total_due_orders || 0,
      lastDueDate: c.last_due_date
    })),
    summary: {
      totalCustomersWithDue: summary.total_customers_with_due || 0,
      totalOutstandingDue: parseFloat(summary.total_outstanding_due) || 0,
      totalCollected: parseFloat(summary.total_collected) || 0,
      totalOrdersWithDue: summary.total_orders_with_due || 0
    }
  };
}

async function main() {
  console.log('=== Testing All Due APIs ===\n');
  
  try {
    // Check actual DB state first
    const db = await getPool();
    console.log('1. Database State:');
    const [dbCustomer] = await db.query(
      'SELECT id, name, due_balance, total_due_collected FROM customers WHERE id = 15'
    );
    console.log('   Customer 15 in DB (stale values):');
    console.log(`   - due_balance: ${dbCustomer[0]?.due_balance}`);
    console.log(`   - total_due_collected: ${dbCustomer[0]?.total_due_collected}`);
    
    const [dbOrders] = await db.query(
      'SELECT id, order_number, due_amount, paid_amount FROM orders WHERE customer_id = 15 AND due_amount > 0'
    );
    console.log('\n   Actual orders with due:');
    console.table(dbOrders);
    
    // Test API 1: /customers/44/due-list
    console.log('\n2. API: /customers/44/due-list');
    const dueList = await testDueList(44);
    if (dueList.length === 0) {
      console.log('   ✓ No customers with outstanding dues');
    } else {
      console.log('   Customers with due:');
      for (const c of dueList) {
        console.log(`   - ${c.name} (ID: ${c.id}): Due = ₹${c.actual_due}, Orders = ${c.pending_due_orders}`);
      }
    }
    
    // Test API 2: /customers/44/due/15
    console.log('\n3. API: /customers/44/due/15');
    const customerDue = await testCustomerDue(15);
    if (!customerDue) {
      console.log('   ✓ No outstanding dues for customer 15 (will return 404)');
    } else {
      console.log(`   Customer: ${customerDue.customerName}`);
      console.log(`   - Due Balance: ₹${customerDue.dueBalance}`);
      console.log(`   - Total Collected: ₹${customerDue.totalDueCollected}`);
      console.log(`   - Pending Orders: ${customerDue.pendingOrdersCount}`);
      console.log('   Orders:');
      for (const o of customerDue.pendingOrders) {
        console.log(`     - ${o.orderNumber}: Total ₹${o.totalAmount}, Paid ₹${o.paidAmount}, Due ₹${o.dueAmount}`);
      }
    }
    
    // Test API 3: /api/v1/orders/reports/44/due
    console.log('\n4. API: /api/v1/orders/reports/44/due');
    const dueReport = await testDueReport(44);
    console.log('   Summary:');
    console.log(`   - Customers with Due: ${dueReport.summary.totalCustomersWithDue}`);
    console.log(`   - Total Outstanding: ₹${dueReport.summary.totalOutstandingDue}`);
    console.log(`   - Total Collected: ₹${dueReport.summary.totalCollected}`);
    console.log(`   - Orders with Due: ${dueReport.summary.totalOrdersWithDue}`);
    if (dueReport.customers.length > 0) {
      console.log('\n   Customers:');
      for (const c of dueReport.customers) {
        console.log(`   - ${c.name}: Due ₹${c.dueBalance}, Collected ₹${c.totalDueCollected}`);
      }
    }
    
    // Verify consistency
    console.log('\n5. Consistency Check:');
    const expectedDue = dbOrders.reduce((sum, o) => sum + parseFloat(o.due_amount), 0);
    console.log(`   Expected due from orders: ₹${expectedDue}`);
    
    if (customerDue) {
      if (customerDue.dueBalance === expectedDue) {
        console.log(`   ✓ Customer due API matches: ₹${customerDue.dueBalance}`);
      } else {
        console.log(`   ✗ MISMATCH: Customer due API shows ₹${customerDue.dueBalance}`);
      }
    }
    
    if (dueReport.summary.totalOutstandingDue === expectedDue) {
      console.log(`   ✓ Due report API matches: ₹${dueReport.summary.totalOutstandingDue}`);
    } else {
      console.log(`   ✗ MISMATCH: Due report API shows ₹${dueReport.summary.totalOutstandingDue}`);
    }
    
    console.log('\n=== All Tests Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (pool) await pool.end();
  }
}

main();
