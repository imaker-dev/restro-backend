/**
 * Fix duplicate table sessions and due amount issues
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

  const connection = await pool.getConnection();

  try {
    console.log('=== Fixing Table and Due Issues ===\n');

    await connection.beginTransaction();

    // 1. Fix duplicate active sessions - keep only the latest one
    console.log('1. Fixing duplicate active sessions...');
    
    // Find tables with duplicate sessions
    const [dupSessions] = await connection.query(`
      SELECT table_id, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY started_at DESC) as session_ids
      FROM table_sessions 
      WHERE status = 'active' 
      GROUP BY table_id 
      HAVING cnt > 1
    `);

    for (const dup of dupSessions) {
      const sessionIds = dup.session_ids.split(',').map(Number);
      const keepId = sessionIds[0]; // Keep the latest
      const closeIds = sessionIds.slice(1); // Close the rest
      
      console.log(`   Table ${dup.table_id}: Keeping session ${keepId}, closing ${closeIds.join(', ')}`);
      
      await connection.query(`
        UPDATE table_sessions 
        SET status = 'closed', ended_at = NOW() 
        WHERE id IN (?)
      `, [closeIds]);
    }
    console.log(`   Fixed ${dupSessions.length} tables with duplicate sessions`);

    // 2. Fix orphan sessions (active sessions without orders)
    console.log('\n2. Fixing orphan active sessions (no order)...');
    
    const [orphanSessions] = await connection.query(`
      SELECT ts.id, ts.table_id, t.table_number
      FROM table_sessions ts
      JOIN tables t ON ts.table_id = t.id
      WHERE ts.status = 'active' AND ts.order_id IS NULL
    `);

    if (orphanSessions.length > 0) {
      const orphanIds = orphanSessions.map(s => s.id);
      const tableIds = orphanSessions.map(s => s.table_id);
      
      // Close orphan sessions
      await connection.query(`
        UPDATE table_sessions 
        SET status = 'closed', ended_at = NOW() 
        WHERE id IN (?)
      `, [orphanIds]);
      
      // Release tables
      await connection.query(`
        UPDATE tables 
        SET status = 'available' 
        WHERE id IN (?) AND status = 'occupied'
      `, [tableIds]);
      
      console.log(`   Closed ${orphanSessions.length} orphan sessions and released tables`);
    } else {
      console.log('   No orphan sessions found');
    }

    // 3. Fix sessions with completed/cancelled orders
    console.log('\n3. Fixing sessions with completed orders...');
    
    const [completedSessions] = await connection.query(`
      SELECT ts.id, ts.table_id, ts.order_id, o.status as order_status
      FROM table_sessions ts
      JOIN orders o ON ts.order_id = o.id
      WHERE ts.status = 'active' AND o.status IN ('completed', 'paid', 'cancelled')
    `);

    if (completedSessions.length > 0) {
      const sessionIds = completedSessions.map(s => s.id);
      const tableIds = completedSessions.map(s => s.table_id);
      
      // Close sessions
      await connection.query(`
        UPDATE table_sessions 
        SET status = 'closed', ended_at = NOW() 
        WHERE id IN (?)
      `, [sessionIds]);
      
      // Release tables
      await connection.query(`
        UPDATE tables 
        SET status = 'available' 
        WHERE id IN (?)
      `, [tableIds]);
      
      console.log(`   Closed ${completedSessions.length} sessions and released tables`);
    } else {
      console.log('   No completed order sessions to fix');
    }

    // 4. Fix due amount mismatches
    console.log('\n4. Fixing due amount mismatches...');
    
    const [result] = await connection.query(`
      UPDATE orders 
      SET due_amount = GREATEST(0, total_amount - paid_amount)
      WHERE status != 'cancelled'
        AND ABS(due_amount - (total_amount - paid_amount)) > 0.01
    `);
    
    console.log(`   Fixed ${result.affectedRows} orders with due amount mismatch`);

    // 5. Fix payment_status based on actual amounts
    console.log('\n5. Fixing payment status based on amounts...');
    
    // Orders that should be 'completed' (fully paid)
    const [paidFix] = await connection.query(`
      UPDATE orders 
      SET payment_status = 'completed'
      WHERE status != 'cancelled'
        AND paid_amount >= total_amount
        AND total_amount > 0
        AND payment_status != 'completed'
    `);
    console.log(`   Fixed ${paidFix.affectedRows} orders to 'completed' payment status`);

    // Orders that should be 'partial'
    const [partialFix] = await connection.query(`
      UPDATE orders 
      SET payment_status = 'partial'
      WHERE status != 'cancelled'
        AND paid_amount > 0
        AND paid_amount < total_amount
        AND payment_status != 'partial'
    `);
    console.log(`   Fixed ${partialFix.affectedRows} orders to 'partial' payment status`);

    // Orders that should be 'pending'
    const [pendingFix] = await connection.query(`
      UPDATE orders 
      SET payment_status = 'pending'
      WHERE status != 'cancelled'
        AND paid_amount = 0
        AND total_amount > 0
        AND payment_status NOT IN ('pending', 'completed')
    `);
    console.log(`   Fixed ${pendingFix.affectedRows} orders to 'pending' payment status`);

    await connection.commit();
    console.log('\n=== All fixes applied successfully ===');

    // Verify fixes
    console.log('\n=== Verification ===');
    
    const [dupCheck] = await pool.query(`
      SELECT table_id, COUNT(*) as cnt 
      FROM table_sessions 
      WHERE status = 'active' 
      GROUP BY table_id 
      HAVING cnt > 1
    `);
    console.log('Remaining duplicate sessions:', dupCheck.length > 0 ? dupCheck : 'None ✓');

    const [dueCheck] = await pool.query(`
      SELECT COUNT(*) as cnt
      FROM orders
      WHERE status != 'cancelled'
        AND ABS(due_amount - (total_amount - paid_amount)) > 0.01
    `);
    console.log('Remaining due mismatches:', dueCheck[0].cnt === 0 ? 'None ✓' : dueCheck[0].cnt);

  } catch (error) {
    await connection.rollback();
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
