/**
 * Fix existing orders with incorrect total_amount
 * Updates total_amount to match the correct calculation (with discount ratio applied to tax)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function fixOrderTotals() {
  console.log('='.repeat(80));
  console.log('FIXING ORDER TOTALS - Applying Discount Ratio to Tax');
  console.log('='.repeat(80));

  await initializeDatabase();
  const pool = getPool();

  // Find orders with discounts where total_amount != paid_amount
  const [ordersToFix] = await pool.query(`
    SELECT o.id, o.order_number, o.subtotal, o.discount_amount, o.tax_amount,
           o.total_amount, o.paid_amount, o.status
    FROM orders o
    WHERE o.discount_amount > 0 
      AND o.status IN ('paid', 'completed', 'billed')
      AND o.total_amount != o.paid_amount
      AND o.paid_amount > 0
    ORDER BY o.id DESC
  `);

  console.log(`\nFound ${ordersToFix.length} orders to fix:\n`);

  for (const order of ordersToFix) {
    // Get actual item totals
    const [items] = await pool.query(`
      SELECT SUM(total_price) as subtotal, SUM(tax_amount) as tax_total
      FROM order_items WHERE order_id = ? AND status != 'cancelled'
    `, [order.id]);

    const subtotal = parseFloat(items[0].subtotal) || 0;
    const originalTax = parseFloat(items[0].tax_total) || 0;

    // Get discount
    const [discounts] = await pool.query(
      'SELECT SUM(discount_amount) as total FROM order_discounts WHERE order_id = ?',
      [order.id]
    );
    const discountAmount = parseFloat(discounts[0].total) || 0;

    // Calculate with discount ratio
    const taxableAmount = subtotal - discountAmount;
    const discountRatio = subtotal > 0 ? (taxableAmount / subtotal) : 1;
    const adjustedTax = parseFloat((originalTax * discountRatio).toFixed(2));
    const preRoundTotal = taxableAmount + adjustedTax;
    const newTotalAmount = Math.round(preRoundTotal);
    const roundOff = newTotalAmount - preRoundTotal;

    console.log(`${order.order_number}:`);
    console.log(`  Subtotal: ${subtotal}, Discount: ${discountAmount}, Original Tax: ${originalTax}`);
    console.log(`  Old total_amount: ${order.total_amount} (WRONG)`);
    console.log(`  New total_amount: ${newTotalAmount} (adjusted tax: ${adjustedTax})`);
    console.log(`  paid_amount: ${order.paid_amount}`);
    
    if (newTotalAmount === parseFloat(order.paid_amount)) {
      console.log(`  ✅ Will match paid_amount`);
    } else {
      console.log(`  ⚠️ Still differs from paid_amount (rounding or other charges)`);
    }

    // Update the order
    await pool.query(`
      UPDATE orders SET 
        tax_amount = ?, round_off = ?, total_amount = ?, updated_at = NOW()
      WHERE id = ?
    `, [adjustedTax, roundOff, newTotalAmount, order.id]);

    console.log(`  → Updated!\n`);
  }

  console.log('='.repeat(80));
  console.log('VERIFICATION');
  console.log('='.repeat(80));

  // Verify the fixes
  const [verifyOrders] = await pool.query(`
    SELECT order_number, total_amount, paid_amount, status
    FROM orders 
    WHERE order_number IN ('ORD2602280005', 'ORD2602280008', 'ORD2602280010')
  `);

  for (const o of verifyOrders) {
    const match = parseFloat(o.total_amount) === parseFloat(o.paid_amount);
    console.log(`${o.order_number}: total=${o.total_amount}, paid=${o.paid_amount} ${match ? '✅' : '⚠️'}`);
  }

  process.exit(0);
}

fixOrderTotals();
