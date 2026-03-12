/**
 * Test the listWithDue service method directly
 */
require('dotenv').config();

// Mock the getPool function
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

// Import the actual query from the service
async function testListWithDue(outletId) {
  const pool = await getPool();
  
  const page = 1;
  const limit = 50;
  const minDue = 0;
  const sortBy = 'dueBalance';
  const sortOrder = 'DESC';
  
  const offset = (page - 1) * limit;
  
  const sortMap = {
    dueBalance: 'actual_due',
    name: 'c.name',
    lastOrderAt: 'c.last_order_at',
    totalSpent: 'c.total_spent'
  };
  const sortExpr = sortMap[sortBy] || 'actual_due';
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Calculate actual due from orders, not from stale due_balance column
  const [rows] = await pool.query(
    `SELECT c.*, 
            COALESCE(od.actual_due, 0) as actual_due,
            COALESCE(od.pending_due_orders, 0) as pending_due_orders,
            COALESCE(od.total_due_collected, 0) as calculated_due_collected
     FROM customers c
     LEFT JOIN (
       SELECT customer_id, 
              SUM(due_amount) as actual_due,
              COUNT(*) as pending_due_orders,
              SUM(paid_amount) as total_due_collected
       FROM orders 
       WHERE due_amount > 0
       GROUP BY customer_id
     ) od ON od.customer_id = c.id
     WHERE c.outlet_id = ? AND c.is_active = 1 AND COALESCE(od.actual_due, 0) >= ?
     HAVING actual_due > 0
     ORDER BY ${sortExpr} ${order}, c.id DESC
     LIMIT ? OFFSET ?`,
    [outletId, minDue, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total 
     FROM customers c
     INNER JOIN (
       SELECT customer_id, SUM(due_amount) as actual_due
       FROM orders 
       WHERE due_amount > 0
       GROUP BY customer_id
       HAVING actual_due > 0
     ) od ON od.customer_id = c.id
     WHERE c.outlet_id = ? AND c.is_active = 1 AND od.actual_due >= ?`,
    [outletId, minDue]
  );

  const [[summary]] = await pool.query(
    `SELECT 
       COUNT(DISTINCT c.id) as total_customers_with_due,
       SUM(od.actual_due) as total_due_amount,
       AVG(od.actual_due) as avg_due_amount
     FROM customers c
     INNER JOIN (
       SELECT customer_id, SUM(due_amount) as actual_due
       FROM orders 
       WHERE due_amount > 0
       GROUP BY customer_id
       HAVING actual_due > 0
     ) od ON od.customer_id = c.id
     WHERE c.outlet_id = ? AND c.is_active = 1`,
    [outletId]
  );

  return {
    customers: rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      dueBalance: parseFloat(r.actual_due) || 0,
      totalDueCollected: parseFloat(r.calculated_due_collected) || parseFloat(r.total_due_collected) || 0,
      pendingDueOrders: r.pending_due_orders || 0
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    summary: {
      totalCustomersWithDue: Number(summary.total_customers_with_due) || 0,
      totalDueAmount: parseFloat(summary.total_due_amount) || 0,
      avgDueAmount: parseFloat(summary.avg_due_amount) || 0
    }
  };
}

async function main() {
  console.log('=== Testing /customers/44/due-list API Response ===\n');
  
  try {
    const result = await testListWithDue(44);
    
    console.log('Response:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n=== Verification ===');
    if (result.customers.length === 0) {
      console.log('✓ No customers with actual outstanding due');
    } else {
      for (const c of result.customers) {
        console.log(`Customer: ${c.name} (ID: ${c.id})`);
        console.log(`  - Due Balance: ₹${c.dueBalance}`);
        console.log(`  - Pending Orders: ${c.pendingDueOrders}`);
        console.log(`  - Total Collected: ₹${c.totalDueCollected}`);
      }
    }
    
    console.log(`\nSummary:`);
    console.log(`  - Total Customers with Due: ${result.summary.totalCustomersWithDue}`);
    console.log(`  - Total Due Amount: ₹${result.summary.totalDueAmount}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (pool) await pool.end();
  }
}

main();
