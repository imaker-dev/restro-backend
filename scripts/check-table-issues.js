/**
 * Check for duplicate tables and due payment issues
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
    console.log('=== Checking for Duplicate Table Issues ===\n');

    // 1. Check for duplicate table_layouts
    const [dupLayouts] = await pool.query(`
      SELECT table_id, COUNT(*) as cnt 
      FROM table_layouts 
      GROUP BY table_id 
      HAVING cnt > 1
    `);
    console.log('1. Duplicate table_layouts:', dupLayouts.length > 0 ? dupLayouts : 'None');

    // 2. Check for duplicate active sessions
    const [dupSessions] = await pool.query(`
      SELECT table_id, COUNT(*) as cnt 
      FROM table_sessions 
      WHERE status = 'active' 
      GROUP BY table_id 
      HAVING cnt > 1
    `);
    console.log('2. Duplicate active sessions:', dupSessions.length > 0 ? dupSessions : 'None');

    // 3. Get sample floor and check tables
    const [floors] = await pool.query(`SELECT id, name, outlet_id FROM floors WHERE is_active = 1 LIMIT 1`);
    if (floors.length > 0) {
      const floorId = floors[0].id;
      console.log(`\n3. Checking floor: ${floors[0].name} (ID: ${floorId})`);

      // Run the same query as getByFloor
      const [tables] = await pool.query(`
        SELECT t.id, t.table_number, t.name,
          tl.id as layout_id,
          ts.id as session_id, ts.status as session_status
        FROM tables t
        LEFT JOIN table_layouts tl ON t.id = tl.table_id
        LEFT JOIN table_sessions ts ON t.id = ts.table_id AND ts.status = 'active'
        WHERE t.floor_id = ? AND t.is_active = 1
        ORDER BY t.display_order, t.table_number
      `, [floorId]);

      console.log(`   Total rows returned: ${tables.length}`);
      
      // Count unique table IDs
      const uniqueIds = new Set(tables.map(t => t.id));
      console.log(`   Unique tables: ${uniqueIds.size}`);
      
      if (tables.length !== uniqueIds.size) {
        console.log('   ⚠️ DUPLICATE TABLES DETECTED!');
        
        // Find which tables are duplicated
        const idCounts = {};
        tables.forEach(t => {
          idCounts[t.id] = (idCounts[t.id] || 0) + 1;
        });
        
        const duplicates = Object.entries(idCounts).filter(([id, count]) => count > 1);
        console.log('   Duplicated table IDs:', duplicates);
        
        // Show details of duplicates
        for (const [tableId] of duplicates) {
          const dups = tables.filter(t => t.id == tableId);
          console.log(`\n   Table ${tableId} appears ${dups.length} times:`);
          console.table(dups);
        }
      }
    }

    // 4. Check due payment issues
    console.log('\n=== Checking Due Payment Issues ===\n');

    // Check orders with dues
    const [dueOrders] = await pool.query(`
      SELECT o.id, o.order_number, o.customer_id, o.total_amount, o.paid_amount, o.due_amount,
             o.payment_status, o.status, o.table_id,
             c.name as customer_name, c.phone as customer_phone,
             t.table_number, t.status as table_status
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.due_amount > 0 AND o.status != 'cancelled'
      ORDER BY o.created_at DESC
      LIMIT 10
    `);
    
    console.log('4. Orders with dues:');
    console.table(dueOrders.map(o => ({
      orderId: o.id,
      orderNumber: o.order_number,
      customerId: o.customer_id,
      customerName: o.customer_name,
      total: o.total_amount,
      paid: o.paid_amount,
      due: o.due_amount,
      paymentStatus: o.payment_status,
      orderStatus: o.status,
      tableId: o.table_id,
      tableStatus: o.table_status
    })));

    // 5. Check if there are orders where due_amount doesn't match calculation
    const [mismatchDues] = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.paid_amount, o.due_amount,
             (o.total_amount - o.paid_amount) as calculated_due,
             o.due_amount - (o.total_amount - o.paid_amount) as difference
      FROM orders o
      WHERE o.status != 'cancelled'
        AND ABS(o.due_amount - (o.total_amount - o.paid_amount)) > 0.01
      LIMIT 10
    `);
    
    console.log('\n5. Orders with due amount mismatch:');
    if (mismatchDues.length > 0) {
      console.table(mismatchDues);
    } else {
      console.log('   None found');
    }

    // 6. Check tables that should be released but aren't
    const [unreleased] = await pool.query(`
      SELECT t.id, t.table_number, t.status as table_status,
             o.id as order_id, o.order_number, o.status as order_status, o.payment_status
      FROM tables t
      JOIN orders o ON t.id = o.table_id
      WHERE t.status = 'occupied'
        AND o.status IN ('completed', 'paid')
        AND o.id = (SELECT MAX(id) FROM orders WHERE table_id = t.id)
      LIMIT 10
    `);
    
    console.log('\n6. Tables that might need to be released (occupied but order completed):');
    if (unreleased.length > 0) {
      console.table(unreleased);
    } else {
      console.log('   None found');
    }

    // 7. Check active table sessions without active orders
    const [orphanSessions] = await pool.query(`
      SELECT ts.id, ts.table_id, ts.order_id, ts.status as session_status,
             t.table_number, t.status as table_status,
             o.status as order_status, o.payment_status
      FROM table_sessions ts
      JOIN tables t ON ts.table_id = t.id
      LEFT JOIN orders o ON ts.order_id = o.id
      WHERE ts.status = 'active'
        AND (o.id IS NULL OR o.status IN ('completed', 'paid', 'cancelled'))
      LIMIT 10
    `);
    
    console.log('\n7. Active table sessions with completed/cancelled orders:');
    if (orphanSessions.length > 0) {
      console.table(orphanSessions);
    } else {
      console.log('   None found');
    }

    console.log('\n=== Check Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
