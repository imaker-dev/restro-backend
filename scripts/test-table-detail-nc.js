/**
 * Test NC details in table detail API response
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

  const tableId = 77;

  try {
    console.log(`=== Testing Table Detail API NC Items (Table ${tableId}) ===\n`);

    // 1. Check table exists and get basic info
    const [table] = await pool.query(
      `SELECT t.id, t.table_number, t.name, t.status, t.floor_id, f.name as floor_name
       FROM tables t
       LEFT JOIN floors f ON t.floor_id = f.id
       WHERE t.id = ?`,
      [tableId]
    );
    
    if (!table[0]) {
      console.log(`Table ${tableId} not found.`);
      await pool.end();
      return;
    }
    
    console.log('1. Table Info:');
    console.log(`   Table: ${table[0].table_number} (${table[0].name})`);
    console.log(`   Status: ${table[0].status}`);
    console.log(`   Floor: ${table[0].floor_name}`);

    // 2. Check for active session and order
    const [sessions] = await pool.query(
      `SELECT ts.id as session_id, ts.order_id, o.order_number, o.status as order_status,
              o.is_nc as order_is_nc, o.nc_amount as order_nc_amount
       FROM table_sessions ts
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE ts.table_id = ? AND ts.status IN ('active', 'billing')
       ORDER BY ts.started_at DESC LIMIT 1`,
      [tableId]
    );

    if (!sessions[0] || !sessions[0].order_id) {
      console.log('\n2. No active session or order found for this table.');
      console.log('   NC details will appear when table has an active order with NC items.');
      await pool.end();
      return;
    }

    const session = sessions[0];
    console.log('\n2. Active Session:');
    console.log(`   Session ID: ${session.session_id}`);
    console.log(`   Order: ${session.order_number} (ID: ${session.order_id})`);
    console.log(`   Order Status: ${session.order_status}`);
    console.log(`   Order is NC: ${session.order_is_nc ? 'Yes' : 'No'}`);
    console.log(`   Order NC Amount: ₹${session.order_nc_amount || 0}`);

    // 3. Get order items with NC details
    console.log('\n3. Order Items with NC Details:');
    const [items] = await pool.query(
      `SELECT oi.id, oi.item_name, oi.quantity, oi.total_price, oi.status,
              oi.is_nc, oi.nc_reason, oi.nc_amount, oi.nc_at,
              u.name as nc_by_name
       FROM order_items oi
       LEFT JOIN users u ON oi.nc_by = u.id
       WHERE oi.order_id = ?
       ORDER BY oi.created_at`,
      [session.order_id]
    );

    if (items.length > 0) {
      console.table(items.map(i => ({
        id: i.id,
        item: i.item_name,
        qty: parseFloat(i.quantity),
        price: parseFloat(i.total_price),
        status: i.status,
        isNC: i.is_nc ? 'YES' : 'no',
        ncAmount: i.is_nc ? parseFloat(i.nc_amount) : '-',
        ncReason: i.nc_reason || '-'
      })));
    } else {
      console.log('   No items in order');
    }

    // 4. NC Summary
    const ncItems = items.filter(i => i.is_nc && i.status !== 'cancelled');
    console.log('\n4. NC Summary:');
    console.log(`   Items with NC: ${ncItems.length}`);
    console.log(`   Total NC Amount: ₹${ncItems.reduce((sum, i) => sum + parseFloat(i.nc_amount || 0), 0)}`);

    // 5. Simulated API Response Structure
    console.log('\n5. API Response Structure (GET /api/v1/tables/77):');
    console.log(`
{
  "id": ${tableId},
  "tableNumber": "${table[0].table_number}",
  "status": "${table[0].status}",
  "order": {
    "id": ${session.order_id},
    "orderNumber": "${session.order_number}",
    "isNC": ${!!session.order_is_nc},
    "ncAmount": ${parseFloat(session.order_nc_amount) || 0},
    ...
  },
  "items": [
    {
      "id": ${items[0]?.id || 'xxx'},
      "name": "${items[0]?.item_name || 'Item Name'}",
      "isNC": ${!!items[0]?.is_nc},         // <-- NC badge
      "ncReason": ${items[0]?.nc_reason ? `"${items[0].nc_reason}"` : 'null'},
      "ncAmount": ${parseFloat(items[0]?.nc_amount) || 0},
      "ncBy": ${items[0]?.nc_by_name ? `"${items[0].nc_by_name}"` : 'null'},
      "ncAt": ${items[0]?.nc_at ? `"${items[0].nc_at}"` : 'null'},
      ...
    }
  ],
  "ncSummary": {
    "hasNcItems": ${ncItems.length > 0},
    "ncItemCount": ${ncItems.length},
    "totalNcAmount": ${ncItems.reduce((sum, i) => sum + parseFloat(i.nc_amount || 0), 0)},
    "ncItems": [...]
  }
}
`);

    console.log('=== Test Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
