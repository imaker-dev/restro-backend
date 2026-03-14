/**
 * Test bulk NC operations
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
    console.log('=== Testing Bulk NC Operations ===\n');

    // 1. Find an active order with multiple items
    console.log('1. Finding an active order with multiple items...');
    const [activeOrders] = await pool.query(`
      SELECT o.id, o.order_number, o.outlet_id, o.status, o.is_nc,
             COUNT(oi.id) as item_count
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
      WHERE o.status IN ('pending', 'confirmed', 'preparing', 'ready')
      GROUP BY o.id
      HAVING item_count >= 2
      ORDER BY o.created_at DESC
      LIMIT 1
    `);

    if (!activeOrders[0]) {
      console.log('   No active orders with multiple items found for testing.');
      console.log('   Creating a test scenario description instead...\n');
      
      console.log('=== API Usage Examples ===\n');
      
      console.log('BULK MARK ITEMS AS NC:');
      console.log('POST /api/v1/orders/:orderId/items/nc/bulk');
      console.log('Request Body:');
      console.log(JSON.stringify({
        items: [
          { orderItemId: 1001 },
          { orderItemId: 1002 },
          { orderItemId: 1003, ncReason: "Different reason for this item" }
        ],
        ncReasonId: 2,
        ncReason: "Customer Complaint",
        notes: "Bulk NC for table complaint"
      }, null, 2));
      
      console.log('\nResponse:');
      console.log(JSON.stringify({
        success: true,
        message: "3 items marked as NC",
        data: {
          orderId: 861,
          orderNumber: "ORD2603130023",
          totalItemsProcessed: 3,
          successCount: 3,
          failedCount: 0,
          totalNcAmount: 750.00,
          items: [
            { orderItemId: 1001, success: true, itemName: "Paneer Tikka", ncAmount: 250 },
            { orderItemId: 1002, success: true, itemName: "Butter Naan", ncAmount: 50 },
            { orderItemId: 1003, success: true, itemName: "Dal Makhani", ncAmount: 450 }
          ]
        }
      }, null, 2));

      console.log('\n\nBULK REMOVE NC FROM ITEMS:');
      console.log('DELETE /api/v1/orders/:orderId/items/nc/bulk');
      console.log('Request Body:');
      console.log(JSON.stringify({
        orderItemIds: [1001, 1002, 1003],
        notes: "Customer agreed to pay after resolution"
      }, null, 2));
      
      console.log('\nResponse:');
      console.log(JSON.stringify({
        success: true,
        message: "NC removed from 3 items",
        data: {
          orderId: 861,
          orderNumber: "ORD2603130023",
          totalItemsProcessed: 3,
          successCount: 3,
          failedCount: 0,
          totalRemovedAmount: 750.00,
          items: [
            { orderItemId: 1001, success: true, itemName: "Paneer Tikka", removedNCAmount: 250 },
            { orderItemId: 1002, success: true, itemName: "Butter Naan", removedNCAmount: 50 },
            { orderItemId: 1003, success: true, itemName: "Dal Makhani", removedNCAmount: 450 }
          ]
        }
      }, null, 2));

      await pool.end();
      return;
    }

    const order = activeOrders[0];
    console.log(`   Found order: ${order.order_number} (ID: ${order.id}) with ${order.item_count} items`);

    // 2. Get items from this order
    console.log('\n2. Getting order items...');
    const [items] = await pool.query(`
      SELECT id, item_name, quantity, total_price, is_nc, nc_amount, status
      FROM order_items
      WHERE order_id = ? AND status != 'cancelled'
      ORDER BY id
    `, [order.id]);
    
    console.table(items);

    // 3. Check which items can be marked as NC
    const ncCandidates = items.filter(i => !i.is_nc);
    const ncItems = items.filter(i => i.is_nc);
    
    console.log(`\n3. Items available for NC: ${ncCandidates.length}`);
    console.log(`   Items already NC: ${ncItems.length}`);

    // 4. Simulate bulk NC operation (without actually doing it)
    console.log('\n4. Simulating bulk NC operation...');
    if (ncCandidates.length > 0) {
      const itemIds = ncCandidates.slice(0, 2).map(i => i.id);
      console.log(`   Would mark these items as NC: ${itemIds.join(', ')}`);
      console.log('\n   API Request would be:');
      console.log(`   POST /api/v1/orders/${order.id}/items/nc/bulk`);
      console.log('   Body:', JSON.stringify({
        items: itemIds.map(id => ({ orderItemId: id })),
        ncReasonId: 1,
        ncReason: "Manager Complimentary",
        notes: "Bulk NC test"
      }, null, 2));
    }

    // 5. Simulate bulk NC removal (without actually doing it)
    console.log('\n5. Simulating bulk NC removal...');
    if (ncItems.length > 0) {
      const itemIds = ncItems.map(i => i.id);
      console.log(`   Would remove NC from: ${itemIds.join(', ')}`);
      console.log('\n   API Request would be:');
      console.log(`   DELETE /api/v1/orders/${order.id}/items/nc/bulk`);
      console.log('   Body:', JSON.stringify({
        orderItemIds: itemIds,
        notes: "Bulk NC removal test"
      }, null, 2));
    }

    console.log('\n=== Test Complete ===');
    console.log('\nNew Bulk NC Endpoints:');
    console.log('- POST   /api/v1/orders/:orderId/items/nc/bulk   (Mark multiple items as NC)');
    console.log('- DELETE /api/v1/orders/:orderId/items/nc/bulk   (Remove NC from multiple items)');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
