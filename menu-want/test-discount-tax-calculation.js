/**
 * Test Discount + Tax Calculation Fix
 * Verifies that tax is calculated on discounted subtotal, not full subtotal
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const billingService = require('../src/services/billing.service');

async function testDiscountTaxCalculation() {
  console.log('='.repeat(70));
  console.log('DISCOUNT + TAX CALCULATION TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Mock order with items and discount
    const mockOrder = {
      id: 999,
      outlet_id: 43,
      order_type: 'dine_in',
      discount_amount: 33.90, // 10% discount on 339
      packaging_charge: 0,
      delivery_charge: 0,
      items: [
        {
          id: 1,
          item_name: 'Drums Of Heaven',
          quantity: 1,
          unit_price: 339.00,
          total_price: 339.00,
          status: 'served',
          tax_details: [
            { componentCode: 'CGST', componentName: 'CGST 2.5%', rate: 2.5, amount: 8.475 },
            { componentCode: 'SGST', componentName: 'SGST 2.5%', rate: 2.5, amount: 8.475 }
          ]
        }
      ]
    };

    console.log('\n--- Test Case: ₹339 item with 10% discount (₹33.90) ---');
    console.log('Expected behavior:');
    console.log('  1. Subtotal: ₹339.00');
    console.log('  2. Discount: ₹33.90');
    console.log('  3. Taxable Amount (discounted): ₹305.10');
    console.log('  4. Tax (5% of ₹305.10): ₹15.26 (NOT ₹16.95)');
    console.log('');

    // Calculate bill details
    const billDetails = await billingService.calculateBillDetails(mockOrder, {
      applyServiceCharge: false,
      isInterstate: false
    });

    console.log('Actual Calculation:');
    console.log(`  Subtotal: ₹${billDetails.subtotal}`);
    console.log(`  Discount: ₹${billDetails.discountAmount}`);
    console.log(`  Taxable Amount: ₹${billDetails.taxableAmount}`);
    console.log(`  CGST: ₹${billDetails.cgstAmount}`);
    console.log(`  SGST: ₹${billDetails.sgstAmount}`);
    console.log(`  Total Tax: ₹${billDetails.totalTax}`);
    console.log(`  Grand Total: ₹${billDetails.grandTotal}`);

    // Validate calculations
    const expectedTaxableAmount = 339 - 33.90; // 305.10
    const expectedTax = parseFloat((expectedTaxableAmount * 0.05).toFixed(2)); // 15.26
    const expectedGrandTotal = Math.round(expectedTaxableAmount + expectedTax); // 320

    console.log('\n--- Validation ---');
    
    const taxableOk = Math.abs(billDetails.taxableAmount - expectedTaxableAmount) < 0.01;
    console.log(`  Taxable Amount: ${taxableOk ? '✅' : '❌'} (expected: ${expectedTaxableAmount}, got: ${billDetails.taxableAmount})`);
    
    const taxOk = Math.abs(billDetails.totalTax - expectedTax) < 0.1;
    console.log(`  Total Tax: ${taxOk ? '✅' : '❌'} (expected: ~${expectedTax}, got: ${billDetails.totalTax})`);
    
    // Tax should be ~15.26, NOT 16.95 (which would be 5% of 339)
    const wrongTax = parseFloat((339 * 0.05).toFixed(2)); // 16.95
    const notWrongTax = Math.abs(billDetails.totalTax - wrongTax) > 0.5;
    console.log(`  Tax NOT on full subtotal: ${notWrongTax ? '✅' : '❌'} (should NOT be ${wrongTax})`);

    // Test with multiple items
    console.log('\n--- Test Case: Multiple items with different tax rates ---');
    
    const mockOrder2 = {
      id: 1000,
      outlet_id: 43,
      order_type: 'dine_in',
      discount_amount: 100, // Fixed discount
      packaging_charge: 0,
      delivery_charge: 0,
      items: [
        {
          id: 1,
          item_name: 'Item A',
          quantity: 2,
          unit_price: 200,
          total_price: 400,
          status: 'served',
          tax_details: [
            { componentCode: 'CGST', rate: 2.5, amount: 10 },
            { componentCode: 'SGST', rate: 2.5, amount: 10 }
          ]
        },
        {
          id: 2,
          item_name: 'Item B',
          quantity: 1,
          unit_price: 600,
          total_price: 600,
          status: 'served',
          tax_details: [
            { componentCode: 'CGST', rate: 9, amount: 54 },
            { componentCode: 'SGST', rate: 9, amount: 54 }
          ]
        }
      ]
    };

    const billDetails2 = await billingService.calculateBillDetails(mockOrder2, {
      applyServiceCharge: false,
      isInterstate: false
    });

    console.log('Order: ₹400 (5% GST) + ₹600 (18% GST) - ₹100 discount');
    console.log(`  Subtotal: ₹${billDetails2.subtotal}`);
    console.log(`  Discount: ₹${billDetails2.discountAmount}`);
    console.log(`  Taxable Amount: ₹${billDetails2.taxableAmount}`);
    console.log(`  CGST: ₹${billDetails2.cgstAmount}`);
    console.log(`  SGST: ₹${billDetails2.sgstAmount}`);
    console.log(`  Total Tax: ₹${billDetails2.totalTax}`);
    console.log(`  Grand Total: ₹${billDetails2.grandTotal}`);

    // Full tax would be 20+108 = 128, but with 10% discount (100/1000), it should be ~115.2
    const discountRatio2 = 900 / 1000; // 0.9
    const expectedTax2 = parseFloat(((20 + 108) * discountRatio2).toFixed(2));
    const taxOk2 = Math.abs(billDetails2.totalTax - expectedTax2) < 0.5;
    console.log(`  Tax adjusted for discount: ${taxOk2 ? '✅' : '❌'} (expected: ~${expectedTax2}, got: ${billDetails2.totalTax})`);

    // Test with no discount
    console.log('\n--- Test Case: No discount (tax on full subtotal) ---');
    
    const mockOrder3 = { ...mockOrder, discount_amount: 0 };
    const billDetails3 = await billingService.calculateBillDetails(mockOrder3, {
      applyServiceCharge: false,
      isInterstate: false
    });

    console.log(`  Subtotal: ₹${billDetails3.subtotal}`);
    console.log(`  Total Tax: ₹${billDetails3.totalTax}`);
    
    const fullTaxOk = Math.abs(billDetails3.totalTax - 16.95) < 0.1;
    console.log(`  Full tax (5% of 339): ${fullTaxOk ? '✅' : '❌'} (expected: 16.95, got: ${billDetails3.totalTax})`);

    console.log('\n' + '='.repeat(70));
    console.log('DISCOUNT + TAX CALCULATION TEST COMPLETE');
    console.log('='.repeat(70));

    // Summary
    const allPass = taxableOk && taxOk && notWrongTax && taxOk2 && fullTaxOk;
    console.log(`\nOverall: ${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testDiscountTaxCalculation();
