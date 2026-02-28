/**
 * Fix Existing Invoices with Discounts
 * Recalculates all invoices that have discounts to apply correct tax on discounted subtotal
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const billingService = require('../src/services/billing.service');
const orderService = require('../src/services/order.service');

async function fixExistingInvoices() {
  console.log('='.repeat(80));
  console.log('FIX EXISTING INVOICES - Tax on Discounted Subtotal');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Find all invoices with discounts
    const [invoicesWithDiscount] = await pool.query(`
      SELECT 
        i.id, i.order_id, i.invoice_number,
        i.subtotal, i.discount_amount, i.taxable_amount, i.total_tax,
        i.cgst_amount, i.sgst_amount, i.grand_total, i.tax_breakup
      FROM invoices i
      WHERE i.discount_amount > 0 AND i.is_cancelled = 0
      ORDER BY i.created_at DESC
    `);

    console.log(`\nFound ${invoicesWithDiscount.length} invoices with discounts`);

    let fixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;

    for (const inv of invoicesWithDiscount) {
      const subtotal = parseFloat(inv.subtotal);
      const discount = parseFloat(inv.discount_amount);
      const currentTax = parseFloat(inv.total_tax);
      
      // Expected tax on discounted amount
      const expectedTaxable = subtotal - discount;
      const expectedTax = parseFloat((expectedTaxable * 0.05).toFixed(2));
      
      // Check if already correct (within tolerance)
      const isCorrect = Math.abs(currentTax - expectedTax) < 0.5;
      
      if (isCorrect) {
        alreadyCorrect++;
        continue;
      }

      console.log(`\n  ${inv.invoice_number}:`);
      console.log(`    Subtotal: ₹${subtotal}, Discount: ₹${discount}`);
      console.log(`    Current Tax: ₹${currentTax} (wrong - on full subtotal)`);
      console.log(`    Expected Tax: ₹${expectedTax} (correct - on discounted)`);

      try {
        // Recalculate the invoice
        await billingService.recalculateInvoiceAfterDiscount(inv.order_id);
        
        // Verify the update
        const [updated] = await pool.query(
          'SELECT total_tax, grand_total FROM invoices WHERE id = ?',
          [inv.id]
        );
        
        if (updated[0]) {
          const newTax = parseFloat(updated[0].total_tax);
          const newGrandTotal = parseFloat(updated[0].grand_total);
          console.log(`    ✅ Fixed: Tax now ₹${newTax}, Grand Total ₹${newGrandTotal}`);
          fixed++;
        }
      } catch (err) {
        console.log(`    ❌ Error: ${err.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`  Total invoices with discounts: ${invoicesWithDiscount.length}`);
    console.log(`  Already correct: ${alreadyCorrect}`);
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Errors: ${errors}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nError:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

fixExistingInvoices();
