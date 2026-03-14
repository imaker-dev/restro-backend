/**
 * Fix NC data corruption:
 * 1. Orders with is_nc=1 but only partial items NC → set is_nc=0
 * 2. Recalculate subtotals for ALL orders with NC items (subtotal should exclude NC items)
 * 
 * Usage: node scripts/fix-nc-data.js
 * Add --dry-run to preview without making changes
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log(`\n=== NC Data Fix Script ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  try {
    // ── Step 1: Find orders with is_nc=1 but NOT all items are NC ──
    const [partialNC] = await pool.query(`
      SELECT o.id, o.order_number, o.is_nc, o.nc_amount, o.subtotal,
        COUNT(oi.id) as total_items,
        SUM(CASE WHEN oi.is_nc = 1 THEN 1 ELSE 0 END) as nc_items,
        SUM(CASE WHEN oi.is_nc = 0 THEN 1 ELSE 0 END) as non_nc_items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
      WHERE o.is_nc = 1
      GROUP BY o.id
      HAVING non_nc_items > 0
    `);

    console.log(`Found ${partialNC.length} orders with is_nc=1 but partial NC items:`);
    for (const o of partialNC) {
      console.log(`  ${o.order_number}: ${o.nc_items}/${o.total_items} NC items → will set is_nc=0`);
    }

    if (!DRY_RUN && partialNC.length > 0) {
      const ids = partialNC.map(o => o.id);
      await pool.query('UPDATE orders SET is_nc = 0 WHERE id IN (?)', [ids]);
      console.log(`  ✅ Fixed is_nc flag for ${partialNC.length} orders\n`);
    } else if (partialNC.length > 0) {
      console.log(`  (dry run — no changes made)\n`);
    }

    // ── Step 2: Find ALL orders with NC items where subtotal is wrong ──
    const [badSubtotals] = await pool.query(`
      SELECT o.id, o.order_number, o.subtotal as db_subtotal, o.nc_amount as db_nc,
        COALESCE(SUM(CASE WHEN oi.is_nc = 1 THEN 0 ELSE oi.total_price END), 0) as calc_subtotal,
        COALESCE(SUM(CASE WHEN oi.is_nc = 1 THEN COALESCE(oi.nc_amount, oi.total_price) ELSE 0 END), 0) as calc_nc,
        COALESCE(SUM(CASE WHEN oi.is_nc = 1 THEN 0 ELSE oi.tax_amount END), 0) as calc_tax
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
      WHERE o.nc_amount > 0 OR o.is_nc = 1
      GROUP BY o.id
      HAVING ABS(db_subtotal - calc_subtotal) > 0.5 OR ABS(db_nc - calc_nc) > 0.5
    `);

    console.log(`Found ${badSubtotals.length} orders with subtotal/nc_amount mismatch:`);
    for (const o of badSubtotals) {
      console.log(`  ${o.order_number}: subtotal ${o.db_subtotal} → ${o.calc_subtotal}, nc ${o.db_nc} → ${o.calc_nc}`);
    }

    if (!DRY_RUN && badSubtotals.length > 0) {
      let fixed = 0;
      for (const o of badSubtotals) {
        const subtotal = parseFloat(o.calc_subtotal) || 0;
        const ncAmount = parseFloat(o.calc_nc) || 0;
        const taxAmount = parseFloat(o.calc_tax) || 0;

        // Get discount
        const [discounts] = await pool.query(
          'SELECT COALESCE(SUM(discount_amount), 0) as total FROM order_discounts WHERE order_id = ?',
          [o.id]
        );
        const discountAmount = parseFloat(discounts[0].total) || 0;

        const taxableAmount = subtotal - discountAmount;
        const discountRatio = subtotal > 0 ? (taxableAmount / subtotal) : 1;
        const adjustedTax = parseFloat((taxAmount * discountRatio).toFixed(2));

        const preRound = taxableAmount + adjustedTax;
        const totalAmount = Math.round(preRound);
        const roundOff = totalAmount - preRound;

        await pool.query(
          `UPDATE orders SET 
            subtotal = ?, nc_amount = ?, tax_amount = ?,
            discount_amount = ?, round_off = ?, total_amount = ?,
            updated_at = NOW()
           WHERE id = ?`,
          [subtotal, ncAmount, adjustedTax, discountAmount, roundOff, totalAmount, o.id]
        );
        fixed++;
      }
      console.log(`  ✅ Recalculated totals for ${fixed} orders\n`);
    } else if (badSubtotals.length > 0) {
      console.log(`  (dry run — no changes made)\n`);
    }

    // ── Step 3: Verify results ──
    console.log('── Verification ──');
    const [verify1] = await pool.query(`
      SELECT COUNT(*) as count FROM orders o
      JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
      WHERE o.is_nc = 1
      GROUP BY o.id
      HAVING SUM(CASE WHEN oi.is_nc = 0 THEN 1 ELSE 0 END) > 0
    `);
    console.log(`  Partial-NC orders with is_nc=1: ${verify1.length} ${verify1.length === 0 ? '✅' : '❌'}`);

    const [verify2] = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT o.id, o.subtotal,
          COALESCE(SUM(CASE WHEN oi.is_nc = 1 THEN 0 ELSE oi.total_price END), 0) as calc
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
        WHERE o.nc_amount > 0 OR o.is_nc = 1
        GROUP BY o.id
        HAVING ABS(o.subtotal - calc) > 0.5
      ) t
    `);
    const mismatchCount = verify2[0]?.count || 0;
    console.log(`  Orders with subtotal mismatch: ${mismatchCount} ${mismatchCount === 0 ? '✅' : '❌'}`);

    console.log('\nDone!');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
