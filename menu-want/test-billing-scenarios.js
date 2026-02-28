/**
 * Comprehensive Billing Scenarios Test
 * Based on user's report data - verifies tax calculation on discounted subtotal
 * 
 * Formula:
 * 1. Taxable Amount = Subtotal - Discount
 * 2. Tax = 5% of Taxable Amount (CGST 2.5% + SGST 2.5%)
 * 3. Pre-round Total = Taxable Amount + Tax + Delivery + Container
 * 4. Grand Total = round(Pre-round Total)
 * 5. Round Off = Grand Total - Pre-round Total
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const billingService = require('../src/services/billing.service');

// Test scenarios from user's report
const testScenarios = [
  {
    name: 'Chicken Malai Tikka, Chilli Chicken Dry, Masala Peanut, Mineral Water',
    subtotal: 846.00,
    discount: 84.60,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 38.08,
    expectedRoundOff: -0.48,
    expectedGrandTotal: 799.00,
    paymentType: 'Card'
  },
  {
    name: 'Veg Noodles',
    subtotal: 219.00,
    discount: 0.00,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 10.96,
    expectedRoundOff: 0.04,
    expectedGrandTotal: 230.00,
    paymentType: 'Cash'
  },
  {
    name: 'Veg Chilli Garlic Fried Rice',
    subtotal: 269.00,
    discount: 53.80,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 10.76,
    expectedRoundOff: 0.04,
    expectedGrandTotal: 226.00,
    paymentType: 'Cash'
  },
  {
    name: 'Blue Lagoon, Cold Coffee With Ice Cream, Dal Tadka, Hot N Sour Soup, Jeera A',
    subtotal: 3180.00,
    discount: 318.00,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 143.10,
    expectedRoundOff: -0.10,
    expectedGrandTotal: 3005.00,
    paymentType: 'Cash'
  },
  {
    name: 'Dal Fry, Garlic Naan, Hot N Sour Soup, Masala Papad, Mineral Water, Mushro',
    subtotal: 1768.00,
    discount: 265.20,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 75.14,
    expectedRoundOff: 0.06,
    expectedGrandTotal: 1578.00,
    paymentType: 'Card'
  },
  {
    name: 'Butter Chicken (Single), Garlic Naan, Jeera Rice, Mineral Water',
    subtotal: 637.00,
    discount: 127.40,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 25.48,
    expectedRoundOff: -0.08,
    expectedGrandTotal: 535.00,
    paymentType: 'Cash'
  },
  {
    name: 'Jeera Rice, Mineral Water, Tandoori Roti',
    subtotal: 307.00,
    discount: 0.00,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 15.36,
    expectedRoundOff: -0.36,
    expectedGrandTotal: 322.00,
    paymentType: 'Cash'
  },
  {
    name: 'Butter Naan, Crispy Honey Chilli Potato, Dahi Ke Shole, Kadhai Paneer, Manch',
    subtotal: 1214.00,
    discount: 0.00,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 60.70,
    expectedRoundOff: 0.30,
    expectedGrandTotal: 1275.00,
    paymentType: 'Cash'
  },
  {
    name: 'Chicken Bagheli (Single), Chilli Chicken Dry, Mutton Bagheli (Single), Tandoori',
    subtotal: 1077.00,
    discount: 0.00,
    deliveryCharge: 0.00,
    containerCharge: 0.00,
    expectedTax: 53.86,
    expectedRoundOff: 0.14,
    expectedGrandTotal: 1131.00,
    paymentType: 'Cash'
  }
];

function createMockOrder(scenario) {
  // Tax rate is 5% (CGST 2.5% + SGST 2.5%)
  const taxRate = 5;
  const cgstRate = 2.5;
  const sgstRate = 2.5;
  
  // Calculate item-level tax (on full price, will be adjusted by billing service)
  const itemTax = scenario.subtotal * (taxRate / 100);
  const cgstAmount = scenario.subtotal * (cgstRate / 100);
  const sgstAmount = scenario.subtotal * (sgstRate / 100);
  
  return {
    id: Math.floor(Math.random() * 10000),
    outlet_id: 43,
    order_type: 'dine_in',
    discount_amount: scenario.discount,
    packaging_charge: scenario.containerCharge,
    delivery_charge: scenario.deliveryCharge,
    items: [
      {
        id: 1,
        item_name: scenario.name,
        quantity: 1,
        unit_price: scenario.subtotal,
        total_price: scenario.subtotal,
        status: 'served',
        tax_details: [
          { componentCode: 'CGST', componentName: 'CGST 2.5%', rate: cgstRate, amount: cgstAmount },
          { componentCode: 'SGST', componentName: 'SGST 2.5%', rate: sgstRate, amount: sgstAmount }
        ]
      }
    ]
  };
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('BILLING SCENARIOS TEST - Tax on Discounted Subtotal');
  console.log('='.repeat(80));
  console.log('\nFormula:');
  console.log('  Taxable Amount = Subtotal - Discount');
  console.log('  Tax = 5% of Taxable Amount (CGST 2.5% + SGST 2.5%)');
  console.log('  Grand Total = round(Taxable Amount + Tax + Delivery + Container)');
  console.log('  Round Off = Grand Total - Pre-round Total');
  console.log('');

  try {
    await initializeDatabase();
    
    let passed = 0;
    let failed = 0;
    const results = [];

    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`Scenario ${i + 1}: ${scenario.name.substring(0, 60)}...`);
      console.log(`${'─'.repeat(80)}`);
      
      // Create mock order
      const mockOrder = createMockOrder(scenario);
      
      // Calculate using billing service
      const billDetails = await billingService.calculateBillDetails(mockOrder, {
        applyServiceCharge: false,
        isInterstate: false
      });

      // Expected calculations
      const expectedTaxable = scenario.subtotal - scenario.discount;
      const expectedPreRound = expectedTaxable + scenario.expectedTax + scenario.deliveryCharge + scenario.containerCharge;
      
      console.log('\n  INPUT:');
      console.log(`    Subtotal:        ₹${scenario.subtotal.toFixed(2)}`);
      console.log(`    Discount:        ₹${scenario.discount.toFixed(2)} (${((scenario.discount / scenario.subtotal) * 100).toFixed(0)}%)`);
      console.log(`    Delivery:        ₹${scenario.deliveryCharge.toFixed(2)}`);
      console.log(`    Container:       ₹${scenario.containerCharge.toFixed(2)}`);
      
      console.log('\n  EXPECTED (from report):');
      console.log(`    Taxable Amount:  ₹${expectedTaxable.toFixed(2)}`);
      console.log(`    Total Tax:       ₹${scenario.expectedTax.toFixed(2)}`);
      console.log(`    Round Off:       ₹${scenario.expectedRoundOff.toFixed(2)}`);
      console.log(`    Grand Total:     ₹${scenario.expectedGrandTotal.toFixed(2)}`);
      
      console.log('\n  CALCULATED (by billing service):');
      console.log(`    Taxable Amount:  ₹${billDetails.taxableAmount.toFixed(2)}`);
      console.log(`    CGST:            ₹${billDetails.cgstAmount.toFixed(2)}`);
      console.log(`    SGST:            ₹${billDetails.sgstAmount.toFixed(2)}`);
      console.log(`    Total Tax:       ₹${billDetails.totalTax.toFixed(2)}`);
      console.log(`    Round Off:       ₹${billDetails.roundOff.toFixed(2)}`);
      console.log(`    Grand Total:     ₹${billDetails.grandTotal.toFixed(2)}`);
      
      // Verify each field
      const taxableMatch = Math.abs(billDetails.taxableAmount - expectedTaxable) < 0.01;
      const taxMatch = Math.abs(billDetails.totalTax - scenario.expectedTax) < 0.02;
      const roundOffMatch = Math.abs(billDetails.roundOff - scenario.expectedRoundOff) < 0.02;
      const grandTotalMatch = billDetails.grandTotal === scenario.expectedGrandTotal;
      
      const allMatch = taxableMatch && taxMatch && roundOffMatch && grandTotalMatch;
      
      console.log('\n  VERIFICATION:');
      console.log(`    Taxable Amount:  ${taxableMatch ? '✅' : '❌'} (diff: ${(billDetails.taxableAmount - expectedTaxable).toFixed(2)})`);
      console.log(`    Total Tax:       ${taxMatch ? '✅' : '❌'} (diff: ${(billDetails.totalTax - scenario.expectedTax).toFixed(2)})`);
      console.log(`    Round Off:       ${roundOffMatch ? '✅' : '❌'} (diff: ${(billDetails.roundOff - scenario.expectedRoundOff).toFixed(2)})`);
      console.log(`    Grand Total:     ${grandTotalMatch ? '✅' : '❌'} (diff: ${billDetails.grandTotal - scenario.expectedGrandTotal})`);
      
      console.log(`\n  RESULT: ${allMatch ? '✅ PASSED' : '❌ FAILED'}`);
      
      if (allMatch) {
        passed++;
      } else {
        failed++;
      }
      
      results.push({
        scenario: scenario.name.substring(0, 40),
        expected: { taxable: expectedTaxable, tax: scenario.expectedTax, grandTotal: scenario.expectedGrandTotal },
        calculated: { taxable: billDetails.taxableAmount, tax: billDetails.totalTax, grandTotal: billDetails.grandTotal },
        passed: allMatch
      });
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n  Total Scenarios: ${testScenarios.length}`);
    console.log(`  Passed:          ${passed} ✅`);
    console.log(`  Failed:          ${failed} ❌`);
    console.log(`\n  Success Rate:    ${((passed / testScenarios.length) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Tax calculation on discounted subtotal is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Review the differences above.');
    }

    // Detailed comparison table
    console.log('\n' + '─'.repeat(80));
    console.log('COMPARISON TABLE');
    console.log('─'.repeat(80));
    console.log('| # | Subtotal | Discount | Expected Tax | Calc Tax | Match |');
    console.log('|---|----------|----------|--------------|----------|-------|');
    for (let i = 0; i < testScenarios.length; i++) {
      const s = testScenarios[i];
      const r = results[i];
      console.log(`| ${i+1} | ${s.subtotal.toString().padStart(8)} | ${s.discount.toString().padStart(8)} | ${s.expectedTax.toString().padStart(12)} | ${r.calculated.tax.toFixed(2).padStart(8)} | ${r.passed ? '  ✅  ' : '  ❌  '} |`);
    }

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

runTests();
