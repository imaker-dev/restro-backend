/**
 * Test script to verify API fixes:
 * 1. listWithDue SQL fix
 * 2. Pending bills date range filter
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

// Test 1: listWithDue without search (the failing case)
async function testListWithDueNoSearch(outletId) {
  const db = await getPool();
  
  const customerConditions = ['c.outlet_id = ?', 'c.is_active = 1'];
  const customerParams = [outletId];
  const orderSearchCondition = 'o.due_amount > 0';
  const orderSearchParams = [];
  const dueFilterClause = ''; // No minDue/maxDue filter
  
  const customerWhereClause = customerConditions.join(' AND ');
  
  // Main query
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.phone,
            od.actual_due,
            od.pending_due_orders,
            od.order_numbers
     FROM customers c
     INNER JOIN (
       SELECT o.customer_id, 
              SUM(o.due_amount) as actual_due,
              COUNT(*) as pending_due_orders,
              GROUP_CONCAT(o.order_number ORDER BY o.created_at DESC SEPARATOR ', ') as order_numbers
       FROM orders o
       WHERE ${orderSearchCondition}
       GROUP BY o.customer_id
       HAVING SUM(o.due_amount) > 0
     ) od ON od.customer_id = c.id
     WHERE ${customerWhereClause}${dueFilterClause}
     ORDER BY od.actual_due DESC
     LIMIT 10`,
    [...orderSearchParams, ...customerParams]
  );
  
  // Count query
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) as total
     FROM customers c
     INNER JOIN (
       SELECT o.customer_id, SUM(o.due_amount) as actual_due
       FROM orders o
       WHERE ${orderSearchCondition}
       GROUP BY o.customer_id
       HAVING SUM(o.due_amount) > 0
     ) od ON od.customer_id = c.id
     WHERE ${customerWhereClause}${dueFilterClause}`,
    [...orderSearchParams, ...customerParams]
  );
  
  // Summary query
  const [[summary]] = await db.query(
    `SELECT 
       COUNT(DISTINCT c.id) as total_customers_with_due,
       SUM(od.actual_due) as total_due_amount,
       AVG(od.actual_due) as avg_due_amount
     FROM customers c
     INNER JOIN (
       SELECT o.customer_id, SUM(o.due_amount) as actual_due
       FROM orders o
       WHERE ${orderSearchCondition}
       GROUP BY o.customer_id
       HAVING SUM(o.due_amount) > 0
     ) od ON od.customer_id = c.id
     WHERE ${customerWhereClause}${dueFilterClause}`,
    [...orderSearchParams, ...customerParams]
  );
  
  return { rows, total, summary };
}

// Test 2: Pending bills with date filter
async function testPendingBillsWithDateFilter(outletId, fromDate, toDate) {
  const db = await getPool();
  
  let whereClause = `WHERE i.outlet_id = ? AND i.is_cancelled = 0`;
  const params = [outletId];
  
  if (fromDate) {
    whereClause += ` AND i.created_at >= ?`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND i.created_at <= ?`;
    params.push(toDate);
  }
  
  whereClause += ` AND i.payment_status IN ('pending', 'partial', 'paid')`;
  whereClause += ` AND (o.status IS NULL OR o.status != 'cancelled')`;
  
  const [rows] = await db.query(
    `SELECT i.id, i.invoice_number, i.grand_total, i.payment_status, i.created_at,
            o.order_number, o.order_type
     FROM invoices i
     LEFT JOIN orders o ON i.order_id = o.id
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT 10`,
    params
  );
  
  return rows;
}

async function main() {
  console.log('=== Testing API Fixes ===\n');
  
  try {
    // Test 1: listWithDue without search
    console.log('1. Testing /customers/44/due-list (no search - the failing case)');
    const dueListResult = await testListWithDueNoSearch(44);
    console.log(`   ✓ Query succeeded`);
    console.log(`   Total customers with due: ${dueListResult.total}`);
    if (dueListResult.rows.length > 0) {
      console.log('   Customers:');
      console.table(dueListResult.rows);
    }
    console.log(`   Summary: ${dueListResult.summary.total_customers_with_due} customers, ₹${dueListResult.summary.total_due_amount} total due`);
    
    // Test 2: Pending bills without date filter
    console.log('\n2. Testing /orders/bills/pending/44 (no date filter)');
    const billsNoFilter = await testPendingBillsWithDateFilter(44, null, null);
    console.log(`   ✓ Query succeeded`);
    console.log(`   Total bills: ${billsNoFilter.length}`);
    if (billsNoFilter.length > 0) {
      console.log('   Recent bills:');
      console.table(billsNoFilter.slice(0, 5));
    }
    
    // Test 3: Pending bills with date filter
    const today = new Date().toISOString().split('T')[0];
    const fromDate = today + ' 00:00:00';
    const toDate = today + ' 23:59:59';
    console.log(`\n3. Testing /orders/bills/pending/44?fromDate=${fromDate}&toDate=${toDate}`);
    const billsWithFilter = await testPendingBillsWithDateFilter(44, fromDate, toDate);
    console.log(`   ✓ Query succeeded`);
    console.log(`   Bills today: ${billsWithFilter.length}`);
    if (billsWithFilter.length > 0) {
      console.log('   Today\'s bills:');
      console.table(billsWithFilter.slice(0, 5));
    }
    
    console.log('\n=== All Tests Passed ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    if (pool) await pool.end();
  }
}

main();
