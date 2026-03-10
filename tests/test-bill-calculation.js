/**
 * Test Script: Bill Calculation Verification
 * 
 * Verifies that bill calculation is accurate:
 * - totalTax = sum of all tax components (cgst + sgst + igst + vat + cess)
 * - grandTotal = taxableAmount + totalTax + serviceCharge + packagingCharge + deliveryCharge + roundOff
 * 
 * Run: node tests/test-bill-calculation.js
 */

const { initializeDatabase, getPool } = require('../src/database');

let passed = 0, failed = 0;

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`   ✅ ${name}${detail ? ` - ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`   ❌ ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(60));
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  BILL CALCULATION VERIFICATION TEST');
  console.log('═'.repeat(60));

  await initializeDatabase();
  const pool = getPool();

  // Find recent invoices with tax data
  section('1. Finding recent invoices with tax data');
  
  const [invoices] = await pool.query(`
    SELECT i.*, o.order_number, o.discount_amount as order_discount
    FROM invoices i
    JOIN orders o ON i.order_id = o.id
    WHERE i.is_cancelled = 0 
      AND (i.vat_amount > 0 OR i.cgst_amount > 0 OR i.total_tax > 0)
    ORDER BY i.created_at DESC
    LIMIT 5
  `);

  console.log(`   Found ${invoices.length} invoices with tax data`);

  for (const inv of invoices) {
    section(`2. Invoice #${inv.invoice_number} (Order ID: ${inv.order_id})`);
    
    // Get order items with tax details
    const [items] = await pool.query(`
      SELECT oi.*, i.name as item_name
      FROM order_items oi
      LEFT JOIN items i ON oi.item_id = i.id
      WHERE oi.order_id = ? AND oi.status != 'cancelled'
    `, [inv.order_id]);

    console.log(`\n   📦 Order Items (${items.length}):`);
    
    let calculatedSubtotal = 0;
    let calculatedCgst = 0;
    let calculatedSgst = 0;
    let calculatedIgst = 0;
    let calculatedVat = 0;
    let calculatedCess = 0;
    const taxBreakupFromItems = {};

    for (const item of items) {
      const itemTotal = parseFloat(item.total_price) || 0;
      calculatedSubtotal += itemTotal;
      
      let taxDetails = null;
      if (item.tax_details) {
        try {
          taxDetails = typeof item.tax_details === 'string' 
            ? JSON.parse(item.tax_details) 
            : item.tax_details;
        } catch (e) {
          console.log(`      ⚠️ Invalid tax_details JSON for item ${item.id}`);
        }
      }

      console.log(`      - ${item.item_name || item.item_id}: ₹${itemTotal} | qty: ${item.quantity}`);
      
      if (taxDetails && Array.isArray(taxDetails)) {
        for (const tax of taxDetails) {
          const taxCode = tax.componentCode || tax.code || tax.componentName || tax.name || 'TAX';
          const taxAmt = parseFloat(tax.amount) || 0;
          const taxRate = parseFloat(tax.rate) || 0;
          
          console.log(`        Tax: ${taxCode} @ ${taxRate}% = ₹${taxAmt}`);
          
          // Add to breakup
          if (!taxBreakupFromItems[taxCode]) {
            taxBreakupFromItems[taxCode] = { rate: taxRate, amount: 0 };
          }
          taxBreakupFromItems[taxCode].amount += taxAmt;
          
          // Categorize
          const codeUpper = taxCode.toUpperCase();
          if (codeUpper.includes('CGST')) calculatedCgst += taxAmt;
          else if (codeUpper.includes('SGST')) calculatedSgst += taxAmt;
          else if (codeUpper.includes('IGST')) calculatedIgst += taxAmt;
          else if (codeUpper.includes('VAT')) calculatedVat += taxAmt;
          else if (codeUpper.includes('CESS')) calculatedCess += taxAmt;
        }
      }
    }

    // Calculate with discount ratio
    const subtotal = parseFloat(inv.subtotal) || 0;
    const discountAmount = parseFloat(inv.discount_amount) || 0;
    const taxableAmount = parseFloat(inv.taxable_amount) || 0;
    const discountRatio = subtotal > 0 ? (taxableAmount / subtotal) : 1;

    console.log(`\n   📊 Invoice Stored Values:`);
    console.log(`      subtotal: ₹${subtotal}`);
    console.log(`      discountAmount: ₹${discountAmount}`);
    console.log(`      taxableAmount: ₹${taxableAmount}`);
    console.log(`      discountRatio: ${discountRatio.toFixed(4)}`);
    console.log(`      cgstAmount: ₹${inv.cgst_amount}`);
    console.log(`      sgstAmount: ₹${inv.sgst_amount}`);
    console.log(`      igstAmount: ₹${inv.igst_amount}`);
    console.log(`      vatAmount: ₹${inv.vat_amount}`);
    console.log(`      cessAmount: ₹${inv.cess_amount}`);
    console.log(`      totalTax: ₹${inv.total_tax}`);
    console.log(`      serviceCharge: ₹${inv.service_charge}`);
    console.log(`      roundOff: ₹${inv.round_off}`);
    console.log(`      grandTotal: ₹${inv.grand_total}`);

    // Calculate expected values
    const expectedCgstAfterDiscount = parseFloat((calculatedCgst * discountRatio).toFixed(2));
    const expectedSgstAfterDiscount = parseFloat((calculatedSgst * discountRatio).toFixed(2));
    const expectedIgstAfterDiscount = parseFloat((calculatedIgst * discountRatio).toFixed(2));
    const expectedVatAfterDiscount = parseFloat((calculatedVat * discountRatio).toFixed(2));
    const expectedCessAfterDiscount = parseFloat((calculatedCess * discountRatio).toFixed(2));
    
    const expectedTotalTax = expectedCgstAfterDiscount + expectedSgstAfterDiscount + 
                             expectedIgstAfterDiscount + expectedVatAfterDiscount + 
                             expectedCessAfterDiscount;

    const storedTotalTax = parseFloat(inv.total_tax) || 0;
    const storedIndividualSum = (parseFloat(inv.cgst_amount) || 0) + 
                                (parseFloat(inv.sgst_amount) || 0) + 
                                (parseFloat(inv.igst_amount) || 0) + 
                                (parseFloat(inv.vat_amount) || 0) + 
                                (parseFloat(inv.cess_amount) || 0);

    console.log(`\n   🧮 Calculated from Items (before discount):`);
    console.log(`      subtotal: ₹${calculatedSubtotal.toFixed(2)}`);
    console.log(`      cgst: ₹${calculatedCgst.toFixed(2)}`);
    console.log(`      sgst: ₹${calculatedSgst.toFixed(2)}`);
    console.log(`      igst: ₹${calculatedIgst.toFixed(2)}`);
    console.log(`      vat: ₹${calculatedVat.toFixed(2)}`);
    console.log(`      cess: ₹${calculatedCess.toFixed(2)}`);

    console.log(`\n   🧮 Expected (after discount ratio ${discountRatio.toFixed(4)}):`);
    console.log(`      cgst: ₹${expectedCgstAfterDiscount}`);
    console.log(`      sgst: ₹${expectedSgstAfterDiscount}`);
    console.log(`      vat: ₹${expectedVatAfterDiscount}`);
    console.log(`      expectedTotalTax: ₹${expectedTotalTax.toFixed(2)}`);

    console.log(`\n   🔍 Verification:`);
    
    // Check if stored totalTax matches sum of individual amounts
    const taxSumDiff = Math.abs(storedTotalTax - storedIndividualSum);
    test('totalTax = sum of individual tax amounts', taxSumDiff < 0.1, 
      `totalTax=${storedTotalTax}, sum=${storedIndividualSum.toFixed(2)}, diff=${taxSumDiff.toFixed(2)}`);

    // Check grandTotal calculation
    const packagingCharge = parseFloat(inv.packaging_charge) || 0;
    const deliveryCharge = parseFloat(inv.delivery_charge) || 0;
    const serviceCharge = parseFloat(inv.service_charge) || 0;
    const roundOff = parseFloat(inv.round_off) || 0;
    const grandTotal = parseFloat(inv.grand_total) || 0;

    const expectedGrandTotal = taxableAmount + storedTotalTax + serviceCharge + packagingCharge + deliveryCharge + roundOff;
    const gtDiff = Math.abs(grandTotal - expectedGrandTotal);
    
    test('grandTotal = taxableAmount + totalTax + charges + roundOff', gtDiff < 0.1,
      `grandTotal=${grandTotal}, expected=${expectedGrandTotal.toFixed(2)}, diff=${gtDiff.toFixed(2)}`);

    // Verify roundOff is correct
    const preRoundTotal = taxableAmount + storedTotalTax + serviceCharge + packagingCharge + deliveryCharge;
    const expectedRoundOff = grandTotal - preRoundTotal;
    const roundOffDiff = Math.abs(roundOff - expectedRoundOff);
    
    test('roundOff is correct', roundOffDiff < 0.01,
      `roundOff=${roundOff}, expected=${expectedRoundOff.toFixed(2)}`);

    // Show tax breakup from invoice
    if (inv.tax_breakup) {
      const taxBreakup = typeof inv.tax_breakup === 'string' 
        ? JSON.parse(inv.tax_breakup) 
        : inv.tax_breakup;
      console.log(`\n   📋 Stored Tax Breakup:`);
      let breakupSum = 0;
      for (const [code, data] of Object.entries(taxBreakup)) {
        console.log(`      ${code}: rate=${data.rate}%, taxable=₹${data.taxableAmount}, tax=₹${data.taxAmount}`);
        breakupSum += parseFloat(data.taxAmount) || 0;
      }
      console.log(`      Sum of breakup: ₹${breakupSum.toFixed(2)}`);
      
      test('totalTax matches taxBreakup sum', Math.abs(storedTotalTax - breakupSum) < 0.1,
        `totalTax=${storedTotalTax}, breakupSum=${breakupSum.toFixed(2)}`);
    }

    // If there's a mismatch, show detailed analysis
    if (taxSumDiff >= 0.1) {
      console.log(`\n   ⚠️ TAX MISMATCH DETECTED!`);
      console.log(`      Stored totalTax: ₹${storedTotalTax}`);
      console.log(`      Sum of stored individual amounts: ₹${storedIndividualSum.toFixed(2)}`);
      console.log(`      Difference: ₹${taxSumDiff.toFixed(2)}`);
      console.log(`\n   This means totalTax is NOT equal to cgst + sgst + igst + vat + cess!`);
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  TEST RESULTS: ✅ ${passed} passed, ❌ ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n  ⚠️ ISSUES FOUND - The bill calculation has discrepancies!');
  } else {
    console.log('\n  ✅ All bill calculations are accurate!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
