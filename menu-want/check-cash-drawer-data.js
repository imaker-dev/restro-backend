/**
 * Check cash drawer data discrepancy
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function check() {
  await initializeDatabase();
  const pool = getPool();
  const today = '2026-02-28';
  const floorId = 33;
  const outletId = 43;

  console.log('=== Investigating Cash Drawer Data ===\n');

  // 1. Completed orders on floor 33
  const [orders] = await pool.query(`
    SELECT o.id, o.order_number, o.total_amount, o.paid_amount, o.status, t.floor_id
    FROM orders o 
    LEFT JOIN tables t ON o.table_id = t.id 
    WHERE o.outlet_id = ? AND DATE(o.created_at) = ? 
    AND o.status IN ('paid', 'completed') 
    AND (t.floor_id = ? OR (o.table_id IS NULL AND o.order_type != 'dine_in'))
  `, [outletId, today, floorId]);

  console.log('Completed orders on floor', floorId + ':');
  let totalPaid = 0;
  orders.forEach(o => {
    totalPaid += parseFloat(o.paid_amount) || 0;
    console.log(`  ${o.order_number}: total=${o.total_amount}, paid=${o.paid_amount}, floor=${o.floor_id}`);
  });
  console.log(`  Total paid_amount: ${totalPaid}\n`);

  // 2. All payments today (all floors)
  const [allPayments] = await pool.query(`
    SELECT p.order_id, p.amount, p.payment_mode, o.order_number, t.floor_id
    FROM payments p 
    JOIN orders o ON p.order_id = o.id 
    LEFT JOIN tables t ON o.table_id = t.id 
    WHERE p.outlet_id = ? AND DATE(p.created_at) = ? AND p.status = 'completed'
  `, [outletId, today]);

  console.log('All payments today (all floors):');
  let totalAllPayments = 0;
  allPayments.forEach(p => {
    totalAllPayments += parseFloat(p.amount);
    console.log(`  ${p.order_number}: amount=${p.amount}, mode=${p.payment_mode}, floor=${p.floor_id}`);
  });
  console.log(`  Total all payments: ${totalAllPayments}\n`);

  // 3. Payments filtered by floor
  const [floorPayments] = await pool.query(`
    SELECT p.order_id, p.amount, p.payment_mode, o.order_number, t.floor_id
    FROM payments p 
    JOIN orders o ON p.order_id = o.id 
    LEFT JOIN tables t ON o.table_id = t.id 
    WHERE p.outlet_id = ? AND DATE(p.created_at) = ? AND p.status = 'completed'
    AND (t.floor_id = ? OR (o.table_id IS NULL AND o.order_type != 'dine_in'))
  `, [outletId, today, floorId]);

  console.log(`Payments for floor ${floorId} only:`);
  let totalFloorPayments = 0;
  floorPayments.forEach(p => {
    totalFloorPayments += parseFloat(p.amount);
    console.log(`  ${p.order_number}: amount=${p.amount}, mode=${p.payment_mode}, floor=${p.floor_id}`);
  });
  console.log(`  Total floor payments: ${totalFloorPayments}\n`);

  // 4. Summary
  console.log('=== Summary ===');
  console.log(`Floor ${floorId} orders paid_amount total: ${totalPaid}`);
  console.log(`Floor ${floorId} payments total: ${totalFloorPayments}`);
  console.log(`All floors payments total: ${totalAllPayments}`);
  console.log(`Difference (all - floor): ${totalAllPayments - totalFloorPayments}`);

  process.exit(0);
}

check();
