/**
 * Test script to verify customer APIs with search, filter, pagination
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

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Test 1: /customers/:outletId/due-list with search
async function testDueListWithSearch(outletId, search) {
  const db = await getPool();
  
  const customerConditions = ['c.outlet_id = ?', 'c.is_active = 1'];
  const customerParams = [outletId];
  
  if (hasText(search)) {
    const searchTerm = `%${search.trim()}%`;
    const isNumericSearch = /^\d+$/.test(search.trim());
    
    customerConditions.push(`(
      c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR
      EXISTS (
        SELECT 1 FROM orders os 
        LEFT JOIN invoices inv ON os.id = inv.order_id AND inv.is_cancelled = 0
        WHERE os.customer_id = c.id AND os.due_amount > 0 AND (
          os.order_number LIKE ? OR 
          os.id = ? OR
          inv.invoice_number LIKE ? OR
          inv.id = ?
        )
      )
    )`);
    customerParams.push(
      searchTerm, searchTerm, searchTerm,
      searchTerm,
      isNumericSearch ? parseInt(search.trim()) : 0,
      searchTerm,
      isNumericSearch ? parseInt(search.trim()) : 0
    );
  }
  
  const customerWhereClause = customerConditions.join(' AND ');
  
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.phone,
            COALESCE(od.actual_due, 0) as actual_due,
            od.order_numbers
     FROM customers c
     INNER JOIN (
       SELECT o.customer_id, 
              SUM(o.due_amount) as actual_due,
              GROUP_CONCAT(o.order_number ORDER BY o.created_at DESC SEPARATOR ', ') as order_numbers
       FROM orders o
       WHERE o.due_amount > 0
       GROUP BY o.customer_id
       HAVING SUM(o.due_amount) > 0
     ) od ON od.customer_id = c.id
     WHERE ${customerWhereClause}
     HAVING actual_due > 0
     ORDER BY actual_due DESC`,
    customerParams
  );
  
  return rows;
}

// Test 2: /customers/:outletId/list with search
async function testCustomerListWithSearch(outletId, search) {
  const db = await getPool();
  
  const whereParts = ['c.outlet_id = ?', 'c.is_active = 1'];
  const params = [outletId];
  
  if (hasText(search)) {
    const searchTerm = `%${search.trim()}%`;
    const isNumericSearch = /^\d+$/.test(search.trim());
    
    whereParts.push(`(
      c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.company_name LIKE ? OR c.gstin LIKE ? OR
      EXISTS (
        SELECT 1 FROM orders os 
        LEFT JOIN invoices inv ON os.id = inv.order_id AND inv.is_cancelled = 0
        WHERE os.customer_id = c.id AND os.status != 'cancelled' AND (
          os.order_number LIKE ? OR 
          os.id = ? OR
          inv.invoice_number LIKE ? OR
          inv.id = ?
        )
      )
    )`);
    params.push(
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
      searchTerm,
      isNumericSearch ? parseInt(search.trim()) : 0,
      searchTerm,
      isNumericSearch ? parseInt(search.trim()) : 0
    );
  }
  
  const whereClause = whereParts.join(' AND ');
  
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.phone, c.email
     FROM customers c
     WHERE ${whereClause}
     ORDER BY c.name
     LIMIT 10`,
    params
  );
  
  return rows;
}

// Test 3: /customers/:outletId/details/:customerId with search
async function testCustomerDetailsWithSearch(customerId, search) {
  const db = await getPool();
  
  const whereParts = ['o.customer_id = ?'];
  const params = [customerId];
  
  if (hasText(search)) {
    const term = `%${search.trim()}%`;
    const isNumericSearch = /^\d+$/.test(search.trim());
    
    whereParts.push(`(
      o.order_number LIKE ? OR 
      o.id = ? OR
      i.invoice_number LIKE ? OR 
      i.id = ? OR
      t.table_number LIKE ? OR 
      t.name LIKE ?
    )`);
    params.push(
      term,
      isNumericSearch ? parseInt(search.trim()) : 0,
      term,
      isNumericSearch ? parseInt(search.trim()) : 0,
      term,
      term
    );
  }
  
  const whereClause = whereParts.join(' AND ');
  
  const [rows] = await db.query(
    `SELECT o.id, o.order_number, o.total_amount, o.due_amount, 
            i.invoice_number, t.table_number
     FROM orders o
     LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
     LEFT JOIN tables t ON o.table_id = t.id
     WHERE ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT 10`,
    params
  );
  
  return rows;
}

async function main() {
  console.log('=== Testing Customer APIs with Search ===\n');
  
  try {
    const db = await getPool();
    
    // Get sample data first
    console.log('1. Getting sample data from outlet 44...');
    const [sampleOrders] = await db.query(
      `SELECT o.id, o.order_number, o.customer_id, c.name as customer_name, 
              o.due_amount, i.invoice_number
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
       WHERE o.outlet_id = 44 AND o.due_amount > 0
       LIMIT 5`
    );
    console.log('   Sample orders with due:');
    console.table(sampleOrders);
    
    if (sampleOrders.length === 0) {
      console.log('   No orders with due found. Testing with general search...');
    }
    
    // Test 2: Search by customer name
    console.log('\n2. Testing /customers/44/due-list?search=Rishav');
    const dueListByName = await testDueListWithSearch(44, 'Rishav');
    if (dueListByName.length > 0) {
      console.log('   ✓ Found by name:');
      console.table(dueListByName);
    } else {
      console.log('   No results for name search');
    }
    
    // Test 3: Search by order number
    if (sampleOrders.length > 0) {
      const orderNumber = sampleOrders[0].order_number;
      console.log(`\n3. Testing /customers/44/due-list?search=${orderNumber}`);
      const dueListByOrder = await testDueListWithSearch(44, orderNumber);
      if (dueListByOrder.length > 0) {
        console.log('   ✓ Found by order number:');
        console.table(dueListByOrder);
      } else {
        console.log('   No results for order number search');
      }
    }
    
    // Test 4: Search by order ID
    if (sampleOrders.length > 0) {
      const orderId = sampleOrders[0].id.toString();
      console.log(`\n4. Testing /customers/44/due-list?search=${orderId} (order ID)`);
      const dueListByOrderId = await testDueListWithSearch(44, orderId);
      if (dueListByOrderId.length > 0) {
        console.log('   ✓ Found by order ID:');
        console.table(dueListByOrderId);
      } else {
        console.log('   No results for order ID search');
      }
    }
    
    // Test 5: Customer list with order number search
    if (sampleOrders.length > 0) {
      const orderNumber = sampleOrders[0].order_number;
      console.log(`\n5. Testing /customers/44/list?search=${orderNumber}`);
      const customerListByOrder = await testCustomerListWithSearch(44, orderNumber);
      if (customerListByOrder.length > 0) {
        console.log('   ✓ Found by order number:');
        console.table(customerListByOrder);
      } else {
        console.log('   No results');
      }
    }
    
    // Test 6: Customer details with order search
    if (sampleOrders.length > 0 && sampleOrders[0].customer_id) {
      const customerId = sampleOrders[0].customer_id;
      const orderNumber = sampleOrders[0].order_number;
      console.log(`\n6. Testing /customers/44/details/${customerId}?search=${orderNumber}`);
      const detailsByOrder = await testCustomerDetailsWithSearch(customerId, orderNumber);
      if (detailsByOrder.length > 0) {
        console.log('   ✓ Found orders by search:');
        console.table(detailsByOrder);
      } else {
        console.log('   No results');
      }
    }
    
    console.log('\n=== All Tests Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    if (pool) await pool.end();
  }
}

main();
