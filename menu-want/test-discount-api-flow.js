/**
 * Test: Discount API Flow
 * Verifies that applying discount correctly recalculates tax on discounted subtotal
 * and the pending bills API shows correct values
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const billingService = require('../src/services/billing.service');
const orderService = require('../src/services/order.service');

async function testDiscountApiFlow() {
  console.log('='.repeat(80));
  console.log('DISCOUNT API FLOW TEST');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Find a recent order with discount and invoice
    console.log('\n--- Finding orders with discounts ---');
    
    const [ordersWithDiscount] = await pool.query(`
      SELECT 
        o.id, o.order_number, o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
        i.id as invoice_id, i.invoice_number, 
        i.subtotal as inv_subtotal, i.discount_amount as inv_discount,
        i.taxable_amount as inv_taxable, i.total_tax as inv_total_tax,
        i.cgst_amount as inv_cgst, i.sgst_amount as inv_sgst,
        i.grand_total as inv_grand_total, i.tax_breakup as inv_tax_breakup
      FROM orders o
      JOIN invoices i ON o.id = i.order_id
      WHERE o.discount_amount > 0 AND i.is_cancelled = 0
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    if (ordersWithDiscount.length === 0) {
      console.log('No orders with discounts and invoices found.');
    } else {
      console.log(`Found ${ordersWithDiscount.length} orders with discounts`);
      
      for (const order of ordersWithDiscount) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`Order: ${order.order_number} (ID: ${order.id})`);
        console.log(`Invoice: ${order.invoice_number}`);
        console.log(`${'─'.repeat(70)}`);
        
        // Calculate expected values
        const subtotal = parseFloat(order.inv_subtotal);
        const discount = parseFloat(order.inv_discount);
        const expectedTaxable = subtotal - discount;
        const expectedTax = parseFloat((expectedTaxable * 0.05).toFixed(2));
        
        // Actual values from invoice
        const actualTaxable = parseFloat(order.inv_taxable);
        const actualTax = parseFloat(order.inv_total_tax);
        const actualCgst = parseFloat(order.inv_cgst);
        const actualSgst = parseFloat(order.inv_sgst);
        
        console.log('\n  Invoice Values:');
        console.log(`    Subtotal:        ₹${subtotal.toFixed(2)}`);
        console.log(`    Discount:        ₹${discount.toFixed(2)}`);
        console.log(`    Taxable Amount:  ₹${actualTaxable.toFixed(2)}`);
        console.log(`    CGST:            ₹${actualCgst.toFixed(2)}`);
        console.log(`    SGST:            ₹${actualSgst.toFixed(2)}`);
        console.log(`    Total Tax:       ₹${actualTax.toFixed(2)}`);
        console.log(`    Grand Total:     ₹${parseFloat(order.inv_grand_total).toFixed(2)}`);
        
        console.log('\n  Expected (tax on discounted amount):');
        console.log(`    Taxable Amount:  ₹${expectedTaxable.toFixed(2)}`);
        console.log(`    Total Tax (5%):  ₹${expectedTax.toFixed(2)}`);
        
        // Check if tax is calculated correctly
        const taxableMatch = Math.abs(actualTaxable - expectedTaxable) < 0.1;
        const taxMatch = Math.abs(actualTax - expectedTax) < 0.5;
        
        // Calculate what the OLD (wrong) tax would be
        const wrongTax = parseFloat((subtotal * 0.05).toFixed(2));
        const isOldCalculation = Math.abs(actualTax - wrongTax) < 0.5;
        
        console.log('\n  Verification:');
        console.log(`    Taxable correct:     ${taxableMatch ? '✅' : '❌'}`);
        console.log(`    Tax on discounted:   ${taxMatch ? '✅' : '❌'}`);
        
        if (isOldCalculation && !taxMatch) {
          console.log(`    ⚠️  Tax appears to be on FULL subtotal (${wrongTax}) - needs recalculation`);
        }
        
        // Parse and show tax breakup
        if (order.inv_tax_breakup) {
          const breakup = typeof order.inv_tax_breakup === 'string' 
            ? JSON.parse(order.inv_tax_breakup) 
            : order.inv_tax_breakup;
          console.log('\n  Tax Breakup:');
          for (const [code, data] of Object.entries(breakup)) {
            console.log(`    ${code}: ₹${data.taxAmount} (${data.rate}% on ₹${data.taxableAmount})`);
          }
        }
      }
    }

    // Test recalculation function
    console.log('\n\n' + '='.repeat(80));
    console.log('TESTING RECALCULATION ON EXISTING ORDER');
    console.log('='.repeat(80));
    
    if (ordersWithDiscount.length > 0) {
      const testOrder = ordersWithDiscount[0];
      console.log(`\nRecalculating order ${testOrder.order_number}...`);
      
      // Get order with items
      const orderWithItems = await orderService.getOrderWithItems(testOrder.id);
      
      if (orderWithItems) {
        // Recalculate using the fixed function
        const newBillDetails = await billingService.calculateBillDetails(orderWithItems, {
          applyServiceCharge: false,
          isInterstate: false
        });
        
        console.log('\n  NEW Calculation (with fix):');
        console.log(`    Subtotal:        ₹${newBillDetails.subtotal}`);
        console.log(`    Discount:        ₹${newBillDetails.discountAmount}`);
        console.log(`    Taxable Amount:  ₹${newBillDetails.taxableAmount}`);
        console.log(`    CGST:            ₹${newBillDetails.cgstAmount}`);
        console.log(`    SGST:            ₹${newBillDetails.sgstAmount}`);
        console.log(`    Total Tax:       ₹${newBillDetails.totalTax}`);
        console.log(`    Grand Total:     ₹${newBillDetails.grandTotal}`);
        
        // Verify the new calculation
        const expectedTaxable = newBillDetails.subtotal - newBillDetails.discountAmount;
        const expectedTax = parseFloat((expectedTaxable * 0.05).toFixed(2));
        
        const taxableMatch = Math.abs(newBillDetails.taxableAmount - expectedTaxable) < 0.01;
        const taxMatch = Math.abs(newBillDetails.totalTax - expectedTax) < 0.1;
        
        console.log('\n  Verification:');
        console.log(`    Taxable correct: ${taxableMatch ? '✅' : '❌'} (${newBillDetails.taxableAmount} vs ${expectedTaxable})`);
        console.log(`    Tax correct:     ${taxMatch ? '✅' : '❌'} (${newBillDetails.totalTax} vs ${expectedTax})`);
        
        // Now trigger recalculation in database
        console.log('\n  Updating invoice in database...');
        await billingService.recalculateInvoiceAfterDiscount(testOrder.id);
        
        // Read back the updated invoice
        const [updatedInv] = await pool.query(
          'SELECT taxable_amount, total_tax, cgst_amount, sgst_amount, grand_total, tax_breakup FROM invoices WHERE id = ?',
          [testOrder.invoice_id]
        );
        
        if (updatedInv[0]) {
          console.log('\n  Updated Invoice Values:');
          console.log(`    Taxable Amount:  ₹${updatedInv[0].taxable_amount}`);
          console.log(`    Total Tax:       ₹${updatedInv[0].total_tax}`);
          console.log(`    CGST:            ₹${updatedInv[0].cgst_amount}`);
          console.log(`    SGST:            ₹${updatedInv[0].sgst_amount}`);
          console.log(`    Grand Total:     ₹${updatedInv[0].grand_total}`);
          
          const finalTaxMatch = Math.abs(parseFloat(updatedInv[0].total_tax) - newBillDetails.totalTax) < 0.01;
          console.log(`\n  Invoice updated correctly: ${finalTaxMatch ? '✅' : '❌'}`);
        }
      }
    }

    // Test pending bills API format
    console.log('\n\n' + '='.repeat(80));
    console.log('TESTING PENDING BILLS API');
    console.log('='.repeat(80));
    
    const pendingBillsResult = await billingService.getPendingBills(43, { status: 'all', limit: 5 }, { roles: ['admin'] });
    
    console.log(`\nFound ${pendingBillsResult.data.length} bills`);
    
    for (const bill of pendingBillsResult.data.slice(0, 3)) {
      console.log(`\n  Invoice ${bill.invoiceNumber}:`);
      console.log(`    Subtotal:     ₹${bill.subtotal}`);
      console.log(`    Discount:     ₹${bill.discountAmount}`);
      console.log(`    Taxable:      ₹${bill.taxableAmount}`);
      console.log(`    Total Tax:    ₹${bill.totalTax}`);
      console.log(`    Grand Total:  ₹${bill.grandTotal}`);
      
      if (bill.discountAmount > 0) {
        const expectedTax = parseFloat(((bill.subtotal - bill.discountAmount) * 0.05).toFixed(2));
        const taxOk = Math.abs(bill.totalTax - expectedTax) < 0.5;
        console.log(`    Tax Check:    ${taxOk ? '✅' : '❌'} (expected ~${expectedTax})`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testDiscountApiFlow();
