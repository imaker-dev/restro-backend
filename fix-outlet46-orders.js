/**
 * Safe Order Cancellation Script for Outlet 46
 * Usage:
 *   node fix-outlet46-orders.js --dry-run    (preview only, no changes)
 *   node fix-outlet46-orders.js --execute    (actually cancel orders + close shifts)
 *
 * This script:
 * 1. Lists ALL active orders for outlet 46
 * 2. Cancels dine-in table orders that have NO payments (ghost orders)
 * 3. For orders WITH payments, settles them as completed instead of cancelling
 * 4. Ends table sessions and frees tables
 * 5. Closes open day_sessions (shifts) for outlet 46
 */
const mysql = require('mysql2/promise');
const dbConfig = require('./src/config/database.config');

const DRY_RUN = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');

if (!DRY_RUN && !EXECUTE) {
  console.log('Usage: node fix-outlet46-orders.js --dry-run  (preview)');
  console.log('       node fix-outlet46-orders.js --execute (apply changes)');
  process.exit(1);
}

const MODE = DRY_RUN ? 'DRY-RUN (preview only)' : 'EXECUTE (will modify data)';
console.log(`\n=== MODE: ${MODE} ===\n`);

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

  const connection = await pool.getConnection();

  try {
    if (!DRY_RUN) await connection.beginTransaction();

    // ── STEP 1: Find all active orders for outlet 46 ──
    const [activeOrders] = await connection.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.order_type,
              o.table_id, o.table_session_id, o.total_amount, o.created_by,
              t.table_number, t.status as table_status, ts.status as session_status
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN table_sessions ts ON o.table_session_id = ts.id
       WHERE o.outlet_id = 46
         AND o.status NOT IN ('paid', 'completed', 'cancelled')
       ORDER BY o.created_at DESC`
    );

    console.log(`Found ${activeOrders.length} active order(s) for outlet 46\n`);

    if (activeOrders.length === 0) {
      console.log('No active orders found. Checking open shifts...');
    }

    const cancelledOrders = [];
    const completedOrders = [];

    for (const order of activeOrders) {
      // Check payments
      const [payments] = await connection.query(
        `SELECT SUM(total_amount) as paid FROM payments WHERE order_id = ? AND status = 'completed'`,
        [order.id]
      );
      const paidAmount = parseFloat(payments[0].paid) || 0;

      console.log(`Order #${order.order_number} (id=${order.id})`);
      console.log(`  Table: ${order.table_number || 'N/A'} | Type: ${order.order_type}`);
      console.log(`  Total: Rs${order.total_amount} | Paid: Rs${paidAmount}`);

      if (paidAmount > 0) {
        // Order has payment - DON'T cancel, complete it instead
        console.log(`  ACTION: ${DRY_RUN ? 'Would' : 'Will'} COMPLETE (has payment Rs${paidAmount})`);
        completedOrders.push({ ...order, paidAmount });
      } else {
        // No payment - safe to cancel
        console.log(`  ACTION: ${DRY_RUN ? 'Would' : 'Will'} CANCEL (no payment)`);
        cancelledOrders.push(order);
      }
    }

    // ── STEP 2: Cancel zero-payment orders ──
    for (const order of cancelledOrders) {
      console.log(`\n${DRY_RUN ? '[DRY-RUN]' : ''} Cancelling order #${order.order_number}...`);

      if (!DRY_RUN) {
        // Cancel order items
        await connection.query(
          `UPDATE order_items SET status = 'cancelled', cancelled_by = 1, cancelled_at = NOW()
           WHERE order_id = ? AND status != 'cancelled'`,
          [order.id]
        );
        // Cancel KOT items
        await connection.query(
          `UPDATE kot_items ki JOIN kot_tickets kt ON ki.kot_id = kt.id
           SET ki.status = 'cancelled'
           WHERE kt.order_id = ? AND ki.status != 'cancelled'`,
          [order.id]
        );
        // Cancel KOTs
        await connection.query(
          `UPDATE kot_tickets SET status = 'cancelled'
           WHERE order_id = ? AND status NOT IN ('served', 'cancelled')`,
          [order.id]
        );
        // Cancel order
        await connection.query(
          `UPDATE orders SET status = 'cancelled', cancelled_by = 1, cancelled_at = NOW(),
           cancel_reason = 'System cleanup: ghost order cancelled via script'
           WHERE id = ?`,
          [order.id]
        );
      }

      // End session + free table if dine-in
      if (order.table_id) {
        console.log(`  ${DRY_RUN ? '[DRY-RUN]' : ''} Freeing table ${order.table_number}...`);
        if (!DRY_RUN) {
          await connection.query(
            `UPDATE table_sessions SET status = 'completed', ended_at = NOW(), ended_by = 1
             WHERE table_id = ? AND status = 'active'`,
            [order.table_id]
          );
          await connection.query(
            `UPDATE tables SET status = 'available' WHERE id = ?`,
            [order.table_id]
          );
        }
      }
    }

    // ── STEP 3: Complete orders that have payments ──
    for (const order of completedOrders) {
      console.log(`\n${DRY_RUN ? '[DRY-RUN]' : ''} Completing order #${order.order_number}...`);
      if (!DRY_RUN) {
        await connection.query(
          `UPDATE orders SET status = 'completed', payment_status = 'completed' WHERE id = ?`,
          [order.id]
        );
        if (order.table_id) {
          await connection.query(
            `UPDATE table_sessions SET status = 'completed', ended_at = NOW(), ended_by = 1
             WHERE table_id = ? AND status = 'active'`,
            [order.table_id]
          );
          await connection.query(
            `UPDATE tables SET status = 'available' WHERE id = ?`,
            [order.table_id]
          );
        }
      }
    }

    // ── STEP 4: Close open shifts for outlet 46 ──
    const [openShifts] = await connection.query(
      `SELECT id, cashier_id, opening_cash, opening_time, floor_id
       FROM day_sessions WHERE outlet_id = 46 AND status = 'open'
       ORDER BY id DESC`
    );

    console.log(`\nFound ${openShifts.length} open shift(s)`);

    for (const shift of openShifts) {
      console.log(`  Shift ${shift.id}: floor=${shift.floor_id}, cashier=${shift.cashier_id}, opened=${shift.opening_time}`);
      console.log(`  ACTION: ${DRY_RUN ? 'Would' : 'Will'} close shift`);

      if (!DRY_RUN) {
        // Get shift totals
        const [totals] = await connection.query(
          `SELECT COUNT(*) as total_orders, SUM(total_amount) as total_sales
           FROM orders WHERE outlet_id = 46 AND status IN ('completed','paid')
           AND created_at >= ?`,
          [shift.opening_time]
        );

        await connection.query(
          `UPDATE day_sessions SET
            closing_time = NOW(), closing_cash = ?, expected_cash = ?,
            cash_variance = 0, total_sales = ?, total_orders = ?,
            total_cash_sales = 0, total_card_sales = 0, total_upi_sales = 0,
            total_discounts = 0, status = 'closed', closed_by = 1,
            variance_notes = 'System closed via cleanup script'
           WHERE id = ?`,
          [shift.opening_cash, shift.opening_cash,
           totals[0].total_sales || 0, totals[0].total_orders || 0,
           shift.id]
        );
      }
    }

    // ── STEP 5: Verify ──
    const [verifyOrders] = await connection.query(
      `SELECT COUNT(*) as cnt FROM orders WHERE outlet_id = 46
       AND status NOT IN ('paid', 'completed', 'cancelled')`
    );
    const [verifyShifts] = await connection.query(
      `SELECT COUNT(*) as cnt FROM day_sessions WHERE outlet_id = 46 AND status = 'open'`
    );

    console.log(`\n=== VERIFICATION ===`);
    console.log(`Active orders remaining: ${verifyOrders[0].cnt}`);
    console.log(`Open shifts remaining: ${verifyShifts[0].cnt}`);

    if (!DRY_RUN) {
      if (verifyOrders[0].cnt === 0 && verifyShifts[0].cnt === 0) {
        await connection.commit();
        console.log('\nSUCCESS: All orders cancelled/completed and shifts closed. COMMITTED.');
      } else {
        await connection.rollback();
        console.log('\nWARNING: Some orders/shifts remain. ROLLED BACK. Review and re-run.');
      }
    } else {
      console.log('\n[DRY-RUN complete - no changes made]');
      console.log('Run with --execute to apply changes');
    }

  } catch (e) {
    console.error('\nERROR:', e.message);
    if (!DRY_RUN) {
      await connection.rollback();
      console.log('Transaction ROLLED BACK due to error.');
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
