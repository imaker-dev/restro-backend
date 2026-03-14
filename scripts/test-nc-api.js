/**
 * Test NC API endpoints
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
    console.log('=== Testing NC API Flow ===\n');

    // Find a test order with items
    const [orders] = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.outlet_id
      FROM orders o
      WHERE o.outlet_id = 44 AND o.status IN ('billed', 'served', 'ready')
      ORDER BY o.created_at DESC
      LIMIT 1
    `);

    if (orders.length === 0) {
      console.log('No suitable order found for testing');
      return;
    }

    const testOrder = orders[0];
    console.log(`Testing with order: ${testOrder.order_number} (ID: ${testOrder.id})`);

    // Get items
    const [items] = await pool.query(`
      SELECT id, item_name, total_price, is_nc
      FROM order_items
      WHERE order_id = ? AND status != 'cancelled'
    `, [testOrder.id]);

    console.log('\nOrder items before NC:');
    console.table(items);

    if (items.length === 0) {
      console.log('No items in order');
      return;
    }

    const testItem = items[0];
    const testUserId = 1; // Admin user

    // Test 1: Mark item as NC
    console.log('\n--- Test 1: Mark item as NC ---');
    const ncReason = 'Customer Complaint';
    const ncAmount = parseFloat(testItem.total_price);

    await pool.query(`
      UPDATE order_items SET 
        is_nc = 1, nc_reason = ?, nc_amount = ?, nc_by = ?, nc_at = NOW()
      WHERE id = ?
    `, [ncReason, ncAmount, testUserId, testItem.id]);

    // Log the NC action
    await pool.query(`
      INSERT INTO nc_logs (outlet_id, order_id, order_item_id, action_type, nc_reason, nc_amount, item_name, applied_by)
      VALUES (?, ?, ?, 'item_nc', ?, ?, ?, ?)
    `, [testOrder.outlet_id, testOrder.id, testItem.id, ncReason, ncAmount, testItem.item_name, testUserId]);

    // Update order NC amount
    const [ncTotals] = await pool.query(`
      SELECT SUM(nc_amount) as total_nc
      FROM order_items
      WHERE order_id = ? AND is_nc = 1 AND status != 'cancelled'
    `, [testOrder.id]);
    
    const orderNCAmount = parseFloat(ncTotals[0].total_nc) || 0;
    await pool.query('UPDATE orders SET nc_amount = ? WHERE id = ?', [orderNCAmount, testOrder.id]);

    console.log(`Marked item "${testItem.item_name}" as NC (Amount: ${ncAmount})`);

    // Verify
    const [updatedItems] = await pool.query(`
      SELECT id, item_name, total_price, is_nc, nc_amount, nc_reason
      FROM order_items
      WHERE order_id = ?
    `, [testOrder.id]);
    console.log('\nOrder items after NC:');
    console.table(updatedItems);

    // Check order NC totals
    const [updatedOrder] = await pool.query(`
      SELECT id, order_number, total_amount, nc_amount, 
             (total_amount - COALESCE(nc_amount, 0)) as payable_amount
      FROM orders WHERE id = ?
    `, [testOrder.id]);
    console.log('\nOrder totals:');
    console.table(updatedOrder);

    // Test 2: Check NC logs
    console.log('\n--- Test 2: Check NC logs ---');
    const [logs] = await pool.query(`
      SELECT id, action_type, item_name, nc_amount, nc_reason, applied_at
      FROM nc_logs
      WHERE order_id = ?
      ORDER BY applied_at DESC
    `, [testOrder.id]);
    console.log('NC Logs:');
    console.table(logs);

    // Test 3: Remove NC from item
    console.log('\n--- Test 3: Remove NC from item ---');
    await pool.query(`
      UPDATE order_items SET 
        is_nc = 0, nc_reason = NULL, nc_amount = 0, nc_by = NULL, nc_at = NULL
      WHERE id = ?
    `, [testItem.id]);

    // Log removal
    await pool.query(`
      INSERT INTO nc_logs (outlet_id, order_id, order_item_id, action_type, nc_reason, nc_amount, item_name, applied_by)
      VALUES (?, ?, ?, 'item_nc_removed', 'NC Removed', ?, ?, ?)
    `, [testOrder.outlet_id, testOrder.id, testItem.id, ncAmount, testItem.item_name, testUserId]);

    // Update order NC amount
    await pool.query('UPDATE orders SET nc_amount = 0 WHERE id = ?', [testOrder.id]);

    console.log(`Removed NC from item "${testItem.item_name}"`);

    // Verify
    const [finalItems] = await pool.query(`
      SELECT id, item_name, total_price, is_nc, nc_amount
      FROM order_items
      WHERE order_id = ?
    `, [testOrder.id]);
    console.log('\nOrder items after NC removal:');
    console.table(finalItems);

    // Final logs
    const [finalLogs] = await pool.query(`
      SELECT id, action_type, item_name, nc_amount, applied_at
      FROM nc_logs
      WHERE order_id = ?
      ORDER BY applied_at DESC
    `, [testOrder.id]);
    console.log('\nFinal NC Logs:');
    console.table(finalLogs);

    console.log('\n=== NC API Test Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
