/**
 * Test NC items in tables API response
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

  const floorId = 34;

  try {
    console.log(`=== Testing Tables API NC Items (Floor ${floorId}) ===\n`);

    // 1. Check if floor exists
    const [floor] = await pool.query(
      `SELECT id, name, outlet_id FROM floors WHERE id = ?`,
      [floorId]
    );
    
    if (!floor[0]) {
      console.log(`Floor ${floorId} not found. Checking available floors...`);
      const [floors] = await pool.query(`SELECT id, name, outlet_id FROM floors WHERE is_active = 1`);
      console.table(floors);
      await pool.end();
      return;
    }
    
    console.log('Floor:', floor[0].name);

    // 2. Get tables with active sessions/orders
    const [activeTables] = await pool.query(
      `SELECT t.id, t.table_number, t.name, ts.id as session_id, o.id as order_id, o.order_number
       FROM tables t
       LEFT JOIN table_sessions ts ON t.id = ts.table_id AND ts.status = 'active'
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE t.floor_id = ? AND t.is_active = 1 AND ts.id IS NOT NULL`,
      [floorId]
    );
    
    console.log('\n2. Active tables with orders:', activeTables.length);
    if (activeTables.length > 0) {
      console.table(activeTables);
    }

    // 3. Check NC items for any active orders
    if (activeTables.length > 0) {
      const orderIds = activeTables.filter(t => t.order_id).map(t => t.order_id);
      
      if (orderIds.length > 0) {
        const [ncItems] = await pool.query(
          `SELECT oi.id, oi.order_id, oi.item_name, oi.quantity, oi.is_nc, oi.nc_reason, oi.nc_amount
           FROM order_items oi
           WHERE oi.order_id IN (?) AND oi.is_nc = 1 AND oi.status != 'cancelled'`,
          [orderIds]
        );
        
        console.log('\n3. NC items in active orders:', ncItems.length);
        if (ncItems.length > 0) {
          console.table(ncItems);
        }
      }
    }

    // 4. Simulate what the API would return for NC summary
    console.log('\n4. Simulating API response structure:');
    for (const table of activeTables.slice(0, 3)) {
      if (!table.order_id) continue;
      
      const [ncItems] = await pool.query(
        `SELECT oi.id, oi.item_name, oi.quantity, oi.unit_price, oi.total_price,
                oi.is_nc, oi.nc_reason, oi.nc_amount, oi.nc_at,
                u.name as nc_by_name
         FROM order_items oi
         LEFT JOIN users u ON oi.nc_by = u.id
         WHERE oi.order_id = ? AND oi.is_nc = 1 AND oi.status != 'cancelled'`,
        [table.order_id]
      );
      
      const totalNcAmount = ncItems.reduce((sum, item) => sum + (parseFloat(item.nc_amount) || 0), 0);
      
      console.log(`\n   Table ${table.table_number} (Order: ${table.order_number}):`);
      console.log(`   ncSummary: {`);
      console.log(`     hasNcItems: ${ncItems.length > 0},`);
      console.log(`     ncItemCount: ${ncItems.length},`);
      console.log(`     totalNcAmount: ${totalNcAmount},`);
      console.log(`     ncItems: [${ncItems.length > 0 ? '...' : ''}]`);
      console.log(`   }`);
      
      if (ncItems.length > 0) {
        console.log('   NC Items:');
        ncItems.forEach(item => {
          console.log(`     - ${item.item_name}: ₹${item.nc_amount} (${item.nc_reason || 'No reason'})`);
        });
      }
    }

    // 5. Check all NC items in system for reference
    console.log('\n5. All NC items in system:');
    const [allNcItems] = await pool.query(
      `SELECT oi.id, o.order_number, oi.item_name, oi.nc_amount, oi.nc_reason, oi.nc_at
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.is_nc = 1
       ORDER BY oi.nc_at DESC
       LIMIT 10`
    );
    if (allNcItems.length > 0) {
      console.table(allNcItems);
    } else {
      console.log('   No NC items found in system yet');
    }

    console.log('\n=== Test Complete ===');
    console.log('\nThe API will now include ncSummary for each table with an active order.');
    console.log('Structure: { hasNcItems, ncItemCount, totalNcAmount, ncItems: [...] }');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
