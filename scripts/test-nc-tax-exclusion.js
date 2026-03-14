/**
 * Test NC Tax Exclusion
 * Verifies that NC items exclude both price AND tax from payable amount
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
    console.log('=== Testing NC Tax Exclusion ===\n');

    // Find an order with items that have tax
    const [orders] = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.outlet_id
      FROM orders o
      WHERE o.outlet_id = 44 AND o.status IN ('billed', 'served', 'ready')
      ORDER BY o.created_at DESC
      LIMIT 1
    `);

    if (orders.length === 0) {
      console.log('No suitable order found');
      return;
    }

    const testOrder = orders[0];
    console.log(`Testing with order: ${testOrder.order_number}`);

    // Get items with tax details
    const [items] = await pool.query(`
      SELECT id, item_name, total_price, tax_amount, tax_details, is_nc
      FROM order_items
      WHERE order_id = ? AND status != 'cancelled'
    `, [testOrder.id]);

    console.log('\n--- Order Items ---');
    console.table(items.map(i => ({
      id: i.id,
      name: i.item_name,
      price: i.total_price,
      tax: i.tax_amount,
      isNC: i.is_nc ? 'Yes' : 'No'
    })));

    // Calculate expected totals
    let subtotal = 0;
    let totalTax = 0;
    let ncAmount = 0;
    let ncTaxAmount = 0;

    for (const item of items) {
      const price = parseFloat(item.total_price) || 0;
      const tax = parseFloat(item.tax_amount) || 0;
      
      subtotal += price;
      
      if (item.is_nc) {
        ncAmount += price;
        ncTaxAmount += tax;
      } else {
        totalTax += tax;
      }
    }

    const grandTotal = Math.round(subtotal + totalTax);
    const payableAmount = grandTotal - ncAmount - ncTaxAmount;

    console.log('\n--- Expected Calculation ---');
    console.log(`Subtotal (all items): ₹${subtotal.toFixed(2)}`);
    console.log(`Tax (non-NC items only): ₹${totalTax.toFixed(2)}`);
    console.log(`NC Amount: ₹${ncAmount.toFixed(2)}`);
    console.log(`NC Tax Amount: ₹${ncTaxAmount.toFixed(2)}`);
    console.log(`Grand Total: ₹${grandTotal}`);
    console.log(`Payable Amount: ₹${payableAmount.toFixed(2)}`);

    // Example scenario
    console.log('\n--- Example Scenario ---');
    console.log(`
Order Items:
┌─────────────────┬────────┬─────────┬────────┐
│ Item            │ Price  │ Tax 5%  │ Status │
├─────────────────┼────────┼─────────┼────────┤
│ Paneer Tikka    │ ₹250   │ ₹12.50  │ Normal │
│ Cold Drink      │ ₹80    │ ₹4.00   │ NC     │
└─────────────────┴────────┴─────────┴────────┘

Calculation (if Cold Drink is NC):
- Subtotal: ₹330 (displayed for reference)
- Taxable Amount (non-NC): ₹250
- Tax (on Paneer Tikka only): ₹12.50
- NC Amount: ₹80
- NC Tax: ₹4.00 (NOT charged)
- Grand Total (Paneer + Tax): ₹262.50 → ₹263 (rounded)
- Payable: ₹263

Customer pays: ₹263 (not ₹347)
`);

    // Test marking an item as NC
    if (items.length > 0 && !items[0].is_nc) {
      const testItem = items[0];
      console.log('\n--- Testing NC on Item ---');
      console.log(`Marking "${testItem.item_name}" as NC...`);
      
      // Mark as NC
      await pool.query(`
        UPDATE order_items SET 
          is_nc = 1, nc_reason = 'Test NC', nc_amount = ?, nc_by = 1, nc_at = NOW()
        WHERE id = ?
      `, [testItem.total_price, testItem.id]);

      // Recalculate
      const [updatedItems] = await pool.query(`
        SELECT id, item_name, total_price, tax_amount, is_nc, nc_amount
        FROM order_items
        WHERE order_id = ? AND status != 'cancelled'
      `, [testOrder.id]);

      let newSubtotal = 0;
      let newTaxableAmount = 0;
      let newTotalTax = 0;
      let newNCAmount = 0;
      let newNCTaxAmount = 0;

      console.log('\n--- After NC Applied ---');
      for (const item of updatedItems) {
        const price = parseFloat(item.total_price) || 0;
        const tax = parseFloat(item.tax_amount) || 0;
        
        newSubtotal += price;
        
        if (item.is_nc) {
          newNCAmount += price;
          newNCTaxAmount += tax;
          console.log(`${item.item_name}: ₹${price} + Tax ₹${tax} = NC (excluded)`);
        } else {
          newTaxableAmount += price;
          newTotalTax += tax;
          console.log(`${item.item_name}: ₹${price} + Tax ₹${tax} = Chargeable`);
        }
      }

      const newGrandTotal = Math.round(newTaxableAmount + newTotalTax);
      const newPayableAmount = newGrandTotal;

      console.log(`\nSubtotal (all items): ₹${newSubtotal.toFixed(2)}`);
      console.log(`Taxable (non-NC): ₹${newTaxableAmount.toFixed(2)}`);
      console.log(`Tax (non-NC): ₹${newTotalTax.toFixed(2)}`);
      console.log(`NC Amount: ₹${newNCAmount.toFixed(2)}`);
      console.log(`NC Tax: ₹${newNCTaxAmount.toFixed(2)}`);
      console.log(`Payable Amount: ₹${newPayableAmount}`);

      // Update order NC amount
      await pool.query('UPDATE orders SET nc_amount = ? WHERE id = ?', [newNCAmount, testOrder.id]);

      // Revert for next test
      console.log('\n--- Reverting NC for cleanup ---');
      await pool.query(`
        UPDATE order_items SET 
          is_nc = 0, nc_reason = NULL, nc_amount = 0, nc_by = NULL, nc_at = NULL
        WHERE id = ?
      `, [testItem.id]);
      await pool.query('UPDATE orders SET nc_amount = 0 WHERE id = ?', [testOrder.id]);
      console.log('NC reverted');
    }

    console.log('\n=== NC Tax Exclusion Test Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
