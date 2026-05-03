/**
 * PRECISE cleanup for Outlet 46 — 2 ghost orders + 1 open shift
 * Targets: orders 3187 (A12), 3182 (A4); shift 231
 * Usage: --dry-run | --execute
 */
const mysql = require('mysql2/promise');
const dbConfig = require('./src/config/database.config');

const DRY_RUN = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');
if (!DRY_RUN && !EXECUTE) { console.log('Use --dry-run or --execute'); process.exit(1); }

const ORDERS = [3187, 3182];
const SHIFT = 231;
const BY = 1;
const REASON = 'Ghost order cleanup: table/session mismatch';

async function main() {
  const pool = mysql.createPool({ host: dbConfig.host, port: 3306, database: dbConfig.database, user: dbConfig.user, password: dbConfig.password, connectionLimit: 2, dateStrings: true });
  const conn = await pool.getConnection();

  try {
    if (!DRY_RUN) await conn.beginTransaction();
    console.log(`\n========== ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'} ==========\n`);

    // Pre-check
    for (const id of ORDERS) {
      const [r] = await conn.query(`SELECT o.id, o.order_number, o.status, o.table_id, t.table_number, t.status ts, ts.status ss FROM orders o LEFT JOIN tables t ON o.table_id=t.id LEFT JOIN table_sessions ts ON o.table_session_id=ts.id WHERE o.id=?`, [id]);
      const o = r[0]; if (o) console.log(`Order ${o.order_number}(id=${o.id}): status=${o.status} table=${o.table_number}(${o.ts}) session=${o.ss||'NULL'}`);
    }
    const [sh] = await conn.query(`SELECT id,status,opening_time FROM day_sessions WHERE id=?`, [SHIFT]);
    if (sh[0]) console.log(`Shift ${SHIFT}: status=${sh[0].status} opened=${sh[0].opening_time}\n`);

    // 1. Cancel KOTs
    for (const id of ORDERS) {
      console.log(`[Order ${id}] Cancelling KOTs...`);
      if (!DRY_RUN) {
        await conn.query(`UPDATE kot_items ki JOIN kot_tickets kt ON ki.kot_id=kt.id SET ki.status='cancelled' WHERE kt.order_id=? AND ki.status!='cancelled'`, [id]);
        await conn.query(`UPDATE kot_tickets SET status='cancelled',cancel_reason=? WHERE order_id=? AND status NOT IN ('served','cancelled')`, [REASON, id]);
      }
    }

    // 2. Cancel items
    for (const id of ORDERS) {
      console.log(`[Order ${id}] Cancelling items...`);
      if (!DRY_RUN) {
        await conn.query(`UPDATE order_items SET status='cancelled',cancelled_by=?,cancelled_at=NOW(),cancel_reason=? WHERE order_id=? AND status!='cancelled'`, [BY, REASON, id]);
      }
    }

    // 3. Cancel orders
    for (const id of ORDERS) {
      console.log(`[Order ${id}] Cancelling order...`);
      if (!DRY_RUN) {
        await conn.query(`UPDATE orders SET status='cancelled',cancelled_by=?,cancelled_at=NOW(),cancel_reason=?,payment_status='cancelled' WHERE id=?`, [BY, REASON, id]);
      }
    }

    // 4. Release tables + sessions
    for (const id of ORDERS) {
      const [r] = await conn.query(`SELECT table_id,table_session_id FROM orders WHERE id=?`, [id]);
      const tid = r[0]?.table_id, sid = r[0]?.table_session_id;
      if (tid) {
        console.log(`[Order ${id}] Releasing table ${tid}, session ${sid||'none'}...`);
        if (!DRY_RUN) {
          await conn.query(`UPDATE table_sessions SET status='completed',ended_at=NOW(),ended_by=? WHERE table_id=? AND status='active'`, [BY, tid]);
          if (sid) await conn.query(`UPDATE table_sessions SET status='completed',ended_at=NOW(),ended_by=? WHERE id=? AND status!='completed'`, [BY, sid]);
          await conn.query(`UPDATE tables SET status='available' WHERE id=?`, [tid]);
        }
      }
    }

    // 5. Close shift
    console.log(`[Shift ${SHIFT}] Closing...`);
    if (!DRY_RUN) {
      await conn.query(`UPDATE day_sessions SET status='closed',closing_time=NOW(),closed_by=?,variance_notes='System closed: ghost order cleanup' WHERE id=?`, [BY, SHIFT]);
    }

    // 6. Verify
    console.log(`\n--- VERIFICATION ---`);
    for (const id of ORDERS) {
      const [r] = await conn.query(`SELECT status FROM orders WHERE id=?`, [id]);
      console.log(`Order ${id}: status=${r[0]?.status || 'NULL'}`);
    }
    const [t] = await conn.query(`SELECT COUNT(*) c FROM orders WHERE outlet_id=46 AND status NOT IN ('paid','completed','cancelled')`);
    const [s] = await conn.query(`SELECT COUNT(*) c FROM day_sessions WHERE outlet_id=46 AND status='open'`);
    console.log(`Active orders: ${t[0].c} | Open shifts: ${s[0].c}`);

    if (!DRY_RUN) {
      if (t[0].c == 0 && s[0].c == 0) {
        await conn.commit();
        console.log(`\nSUCCESS: Committed.`);
      } else {
        await conn.rollback();
        console.log(`\nROLLBACK: active_orders=${t[0].c} open_shifts=${s[0].c}`);
      }
    } else {
      console.log(`\n[DRY-RUN complete — no changes]`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    if (!DRY_RUN) { await conn.rollback(); console.log('Rolled back.'); }
  } finally {
    conn.release(); await pool.end();
  }
}
main();
