/**
 * Verify daily sales calculations after IST fix and data corrections
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

  const OUTLET = 44;
  const DATE = '2026-03-14';

  try {
    console.log(`\n=== Daily Sales Verification for outlet ${OUTLET}, date ${DATE} ===\n`);

    // 1. Count orders with correct DATE() (IST-native)
    const [orders] = await pool.query(`
      SELECT id, order_number, status, order_type, is_nc,
        subtotal, tax_amount, discount_amount, total_amount,
        nc_amount, paid_amount, due_amount, created_at
      FROM orders
      WHERE outlet_id = ? AND DATE(created_at) = ? AND status != 'cancelled'
      ORDER BY id
    `, [OUTLET, DATE]);

    console.log(`Orders for ${DATE}: ${orders.length}`);
    orders.forEach(o => {
      console.log(`  ${o.order_number}: type=${o.order_type} status=${o.status} is_nc=${o.is_nc} subtotal=${o.subtotal} tax=${o.tax_amount} disc=${o.discount_amount} total=${o.total_amount} nc=${o.nc_amount} paid=${o.paid_amount} due=${o.due_amount}`);
    });

    // 2. Calculate expected report values
    let totalOrders = orders.length;
    let grossSales = 0, netSales = 0, totalDiscount = 0, totalTax = 0;
    let ncAmount = 0, dueAmount = 0, paidAmount = 0;
    let ncOrders = 0;

    for (const o of orders) {
      const sub = parseFloat(o.subtotal) || 0;
      const tax = parseFloat(o.tax_amount) || 0;
      const disc = parseFloat(o.discount_amount) || 0;
      const nc = parseFloat(o.nc_amount) || 0;
      const paid = parseFloat(o.paid_amount) || 0;
      const due = parseFloat(o.due_amount) || 0;

      grossSales += sub + tax;
      netSales += sub - disc;
      totalDiscount += disc;
      totalTax += tax;
      ncAmount += nc;
      dueAmount += due;
      paidAmount += paid;
      if (o.is_nc) ncOrders++;
    }

    console.log('\n── Expected Report Values ──');
    console.log(`  total_orders   : ${totalOrders}`);
    console.log(`  nc_orders      : ${ncOrders}`);
    console.log(`  gross_sales    : ${grossSales.toFixed(2)} (= SUM(subtotal + tax))`);
    console.log(`  net_sales      : ${netSales.toFixed(2)} (= SUM(subtotal - discount))`);
    console.log(`  discount       : ${totalDiscount.toFixed(2)}`);
    console.log(`  tax_amount     : ${totalTax.toFixed(2)}`);
    console.log(`  nc_amount      : ${ncAmount.toFixed(2)}`);
    console.log(`  due_amount     : ${dueAmount.toFixed(2)}`);
    console.log(`  paid_amount    : ${paidAmount.toFixed(2)}`);

    // 3. Cross-check relationships
    console.log('\n── Cross-Check ──');
    console.log(`  gross_sales - tax = subtotal = ${(grossSales - totalTax).toFixed(2)}`);
    console.log(`  net_sales + discount = subtotal = ${(netSales + totalDiscount).toFixed(2)}`);
    console.log(`  paid + due should ≈ total_amount for completed orders`);

    let totalAmount = 0;
    for (const o of orders) {
      totalAmount += parseFloat(o.total_amount) || 0;
    }
    console.log(`  SUM(total_amount) = ${totalAmount.toFixed(2)}`);
    console.log(`  paid + due        = ${(paidAmount + dueAmount).toFixed(2)}`);
    
    const paidDueDiff = Math.abs(totalAmount - (paidAmount + dueAmount));
    console.log(`  Difference        = ${paidDueDiff.toFixed(2)} ${paidDueDiff < 1 ? '✅' : '⚠️  (orders may be in-progress)'}`);

    // 4. Verify NC items are excluded from subtotal
    console.log('\n── NC Verification ──');
    for (const o of orders.filter(o => parseFloat(o.nc_amount) > 0)) {
      const [items] = await pool.query(`
        SELECT 
          SUM(CASE WHEN is_nc = 1 THEN 0 ELSE total_price END) as calc_subtotal,
          SUM(CASE WHEN is_nc = 1 THEN COALESCE(nc_amount, total_price) ELSE 0 END) as calc_nc
        FROM order_items WHERE order_id = ? AND status != 'cancelled'
      `, [o.id]);
      const calcSub = parseFloat(items[0].calc_subtotal) || 0;
      const calcNC = parseFloat(items[0].calc_nc) || 0;
      const subMatch = Math.abs(parseFloat(o.subtotal) - calcSub) < 0.5;
      const ncMatch = Math.abs(parseFloat(o.nc_amount) - calcNC) < 0.5;
      console.log(`  ${o.order_number}: subtotal=${o.subtotal} calc=${calcSub.toFixed(2)} ${subMatch ? '✅' : '❌'} | nc=${o.nc_amount} calc=${calcNC.toFixed(2)} ${ncMatch ? '✅' : '❌'}`);
    }

    // 5. Compare with OLD date filter (CONVERT_TZ - the bug)
    const [oldCount] = await pool.query(`
      SELECT COUNT(*) as cnt FROM orders 
      WHERE outlet_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = ? AND status != 'cancelled'
    `, [OUTLET, DATE]);
    console.log(`\n── Date Filter Comparison ──`);
    console.log(`  DATE(created_at) = '${DATE}'                     : ${orders.length} orders ✅ (correct)`);
    console.log(`  DATE(CONVERT_TZ(created_at, UTC, IST)) = '${DATE}': ${oldCount[0].cnt} orders ❌ (old buggy)`);

    console.log('\nDone!');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
