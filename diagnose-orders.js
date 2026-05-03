/**
 * Diagnostic script: Find all active orders blocking shift close for outlet 46
 * Safe read-only query - NO modifications
 */
const mysql = require('mysql2/promise');
const dbConfig = require('./src/config/database.config');

async function main() {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: 3306,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    connectionLimit: 2,
    dateStrings: true,
  });

  try {
    const [activeOrders] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.order_type,
              o.table_id, o.table_session_id, o.floor_id, o.total_amount, o.created_at,
              t.table_number, t.status as table_status,
              ts.status as session_status,
              u.name as created_by_name, o.created_by
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN table_sessions ts ON o.table_session_id = ts.id
       LEFT JOIN users u ON o.created_by = u.id
       WHERE o.outlet_id = 46 AND o.status NOT IN ('paid', 'completed', 'cancelled')
       ORDER BY o.created_at DESC`
    );

    console.log('=== ACTIVE ORDERS FOR OUTLET 46 ===');
    console.log(`Total active orders: ${activeOrders.length}\n`);

    for (const o of activeOrders) {
      console.log(`Order #${o.order_number} (id=${o.id})`);
      console.log(`  Status: ${o.status} | Payment: ${o.payment_status} | Type: ${o.order_type}`);
      console.log(`  Table: ${o.table_number || 'N/A'} (id=${o.table_id}, table_status=${o.table_status})`);
      console.log(`  Session: ${o.session_status || 'N/A'} (id=${o.table_session_id})`);
      console.log(`  Amount: Rs${o.total_amount} | Created: ${o.created_at} by ${o.created_by_name || 'User '+o.created_by}`);

      const [items] = await pool.query(
        `SELECT oi.item_name, oi.quantity, oi.status, oi.kot_id
         FROM order_items oi WHERE oi.order_id = ? AND oi.status != 'cancelled'`,
        [o.id]
      );
      console.log(`  Items (${items.length}): ${items.map(i => `${i.item_name}x${i.quantity}[${i.status}]`).join(', ')}`);

      const [kots] = await pool.query(
        `SELECT kt.kot_number, kt.status FROM kot_tickets kt WHERE kt.order_id = ? AND kt.status != 'cancelled'`,
        [o.id]
      );
      console.log(`  KOTs (${kots.length}): ${kots.map(k => `${k.kot_number}[${k.status}]`).join(', ')}`);

      const [payments] = await pool.query(
        `SELECT SUM(p.total_amount) as paid FROM payments p WHERE p.order_id = ? AND p.status = 'completed'`,
        [o.id]
      );
      console.log(`  Paid: Rs${payments[0].paid || 0}\n`);
    }

    // Shift info
    const [shifts] = await pool.query(
      `SELECT ds.id, ds.status, ds.opening_time, u.name as cashier_name
       FROM day_sessions ds
       LEFT JOIN users u ON ds.cashier_id = u.id
       WHERE ds.outlet_id = 46 AND ds.status = 'open'
       ORDER BY ds.id DESC`
    );
    console.log(`=== OPEN SHIFTS ===`);
    for (const s of shifts) {
      console.log(`Shift ${s.id}: ${s.status} | opened ${s.opening_time} | cashier: ${s.cashier_name}`);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

main();
