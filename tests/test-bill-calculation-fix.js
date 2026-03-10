/**
 * Test Script: Bill Calculation Fix Verification
 * 
 * Verifies that the bill calculation fix works correctly:
 * 1. totalTax = cgstAmount + sgstAmount + igstAmount + vatAmount + cessAmount
 * 2. grandTotal = taxableAmount + totalTax + serviceCharge + packagingCharge + deliveryCharge + roundOff
 * 3. Individual tax amounts are correctly adjusted for discount
 * 
 * Run: node tests/test-bill-calculation-fix.js
 */

const { initializeDatabase, getPool } = require('../src/database');
const billingService = require('../src/services/billing.service');
const orderService = require('../src/services/order.service');

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
  console.log('  BILL CALCULATION FIX VERIFICATION TEST');
  console.log('═'.repeat(60));

  await initializeDatabase();
  const pool = getPool();

  // Test 1: Verify the problematic invoice (Order 746)
  section('1. Verify Order 746 calculation (the bug case)');
  
  const [order746] = await pool.query('SELECT * FROM orders WHERE id = 746');
  
  if (order746[0]) {
    const order = order746[0];
    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ? AND status != ?',
      [746, 'cancelled']
    );
    order.items = items;
    
    console.log(`\n   Order #${order.order_number}:`);
    console.log(`   - subtotal: ₹${order.subtotal}`);
    console.log(`   - discount_amount: ₹${order.discount_amount}`);
    
    // Calculate bill details
    const billDetails = await billingService.calculateBillDetails(order, { 
      applyServiceCharge: false, 
      isInterstate: false 
    });
    
    console.log(`\n   Calculated Bill Details:`);
    console.log(`   - subtotal: ₹${billDetails.subtotal}`);
    console.log(`   - discountAmount: ₹${billDetails.discountAmount}`);
    console.log(`   - taxableAmount: ₹${billDetails.taxableAmount}`);
    console.log(`   - cgstAmount: ₹${billDetails.cgstAmount}`);
    console.log(`   - sgstAmount: ₹${billDetails.sgstAmount}`);
    console.log(`   - igstAmount: ₹${billDetails.igstAmount}`);
    console.log(`   - vatAmount: ₹${billDetails.vatAmount}`);
    console.log(`   - cessAmount: ₹${billDetails.cessAmount}`);
    console.log(`   - totalTax: ₹${billDetails.totalTax}`);
    console.log(`   - grandTotal: ₹${billDetails.grandTotal}`);
    
    // Verify totalTax = sum of individual amounts
    const sumOfTaxes = billDetails.cgstAmount + billDetails.sgstAmount + 
                       billDetails.igstAmount + billDetails.vatAmount + 
                       billDetails.cessAmount;
    
    test('totalTax = sum of individual tax amounts', 
      Math.abs(billDetails.totalTax - sumOfTaxes) < 0.01,
      `totalTax=${billDetails.totalTax}, sum=${sumOfTaxes.toFixed(2)}`);
    
    // Verify grandTotal calculation
    const expectedGrandTotal = Math.round(
      billDetails.taxableAmount + billDetails.totalTax + 
      billDetails.serviceCharge + billDetails.packagingCharge + 
      billDetails.deliveryCharge
    );
    
    test('grandTotal calculation correct',
      billDetails.grandTotal === expectedGrandTotal,
      `grandTotal=${billDetails.grandTotal}, expected=${expectedGrandTotal}`);
    
    // Verify VAT is correctly adjusted for discount
    const discountRatio = billDetails.taxableAmount / billDetails.subtotal;
    console.log(`\n   Discount ratio: ${discountRatio.toFixed(4)}`);
    
    // Calculate expected VAT from items
    let rawVat = 0;
    for (const item of order.items) {
      if (item.status === 'cancelled') continue;
      if (item.tax_details) {
        const td = typeof item.tax_details === 'string' 
          ? JSON.parse(item.tax_details) 
          : item.tax_details;
        for (const tax of td) {
          const code = (tax.componentCode || tax.name || '').toUpperCase();
          if (code.includes('VAT')) {
            rawVat += parseFloat(tax.amount) || 0;
          }
        }
      }
    }
    
    const expectedVat = parseFloat((rawVat * discountRatio).toFixed(2));
    test('VAT correctly adjusted for discount',
      Math.abs(billDetails.vatAmount - expectedVat) < 0.01,
      `vatAmount=${billDetails.vatAmount}, expected=${expectedVat}`);
  } else {
    console.log('   Order 746 not found - skipping');
  }

  // Test 2: Find any order with VAT and discount
  section('2. Test with any VAT order with discount');
  
  const [vatOrders] = await pool.query(`
    SELECT o.id, o.order_number, o.subtotal, o.discount_amount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.discount_amount > 0 
      AND oi.tax_details LIKE '%VAT%'
      AND o.status NOT IN ('cancelled')
    GROUP BY o.id
    LIMIT 1
  `);
  
  if (vatOrders[0]) {
    const orderId = vatOrders[0].id;
    const order = await orderService.getOrderWithItems(orderId);
    
    console.log(`\n   Testing Order #${order.orderNumber}:`);
    console.log(`   - subtotal: ₹${order.subtotal}`);
    console.log(`   - discount: ₹${order.discount_amount || order.discountAmount}`);
    
    const billDetails = await billingService.calculateBillDetails({
      ...order,
      discount_amount: order.discount_amount || order.discountAmount,
      items: order.items
    }, { applyServiceCharge: false });
    
    const sumOfTaxes = billDetails.cgstAmount + billDetails.sgstAmount + 
                       billDetails.igstAmount + billDetails.vatAmount + 
                       billDetails.cessAmount;
    
    test('totalTax = sum of taxes for VAT order',
      Math.abs(billDetails.totalTax - sumOfTaxes) < 0.01,
      `totalTax=${billDetails.totalTax}, sum=${sumOfTaxes.toFixed(2)}`);
  }

  // Test 3: Test GST order (CGST + SGST)
  section('3. Test with GST order (CGST + SGST)');
  
  const [gstOrders] = await pool.query(`
    SELECT o.id, o.order_number, o.subtotal, o.discount_amount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.tax_details LIKE '%CGST%'
      AND o.status NOT IN ('cancelled')
    GROUP BY o.id
    LIMIT 1
  `);
  
  if (gstOrders[0]) {
    const orderId = gstOrders[0].id;
    const order = await orderService.getOrderWithItems(orderId);
    
    console.log(`\n   Testing Order #${order.orderNumber}:`);
    
    const billDetails = await billingService.calculateBillDetails({
      ...order,
      discount_amount: order.discount_amount || order.discountAmount || 0,
      items: order.items
    }, { applyServiceCharge: false });
    
    console.log(`   - cgstAmount: ₹${billDetails.cgstAmount}`);
    console.log(`   - sgstAmount: ₹${billDetails.sgstAmount}`);
    console.log(`   - totalTax: ₹${billDetails.totalTax}`);
    
    const sumOfTaxes = billDetails.cgstAmount + billDetails.sgstAmount + 
                       billDetails.igstAmount + billDetails.vatAmount + 
                       billDetails.cessAmount;
    
    test('totalTax = sum of taxes for GST order',
      Math.abs(billDetails.totalTax - sumOfTaxes) < 0.01,
      `totalTax=${billDetails.totalTax}, sum=${sumOfTaxes.toFixed(2)}`);
    
    // Verify CGST = SGST for intrastate
    test('CGST equals SGST (intrastate)',
      Math.abs(billDetails.cgstAmount - billDetails.sgstAmount) < 0.01,
      `cgst=${billDetails.cgstAmount}, sgst=${billDetails.sgstAmount}`);
  }

  // Test 4: Test mixed tax order (GST + VAT items)
  section('4. Test with mixed tax order (GST + VAT)');
  
  const [mixedOrders] = await pool.query(`
    SELECT o.id
    FROM orders o
    WHERE o.id IN (
      SELECT order_id FROM order_items WHERE tax_details LIKE '%CGST%'
    ) AND o.id IN (
      SELECT order_id FROM order_items WHERE tax_details LIKE '%VAT%'
    )
    AND o.status NOT IN ('cancelled')
    LIMIT 1
  `);
  
  if (mixedOrders[0]) {
    const order = await orderService.getOrderWithItems(mixedOrders[0].id);
    
    console.log(`\n   Testing Mixed Order #${order.orderNumber}:`);
    
    const billDetails = await billingService.calculateBillDetails({
      ...order,
      discount_amount: order.discount_amount || order.discountAmount || 0,
      items: order.items
    }, { applyServiceCharge: false });
    
    console.log(`   - cgstAmount: ₹${billDetails.cgstAmount}`);
    console.log(`   - sgstAmount: ₹${billDetails.sgstAmount}`);
    console.log(`   - vatAmount: ₹${billDetails.vatAmount}`);
    console.log(`   - totalTax: ₹${billDetails.totalTax}`);
    
    const sumOfTaxes = billDetails.cgstAmount + billDetails.sgstAmount + 
                       billDetails.igstAmount + billDetails.vatAmount + 
                       billDetails.cessAmount;
    
    test('totalTax = sum of taxes for mixed order',
      Math.abs(billDetails.totalTax - sumOfTaxes) < 0.01,
      `totalTax=${billDetails.totalTax}, sum=${sumOfTaxes.toFixed(2)}`);
  } else {
    console.log('   No mixed tax orders found - skipping');
  }

  // Test 5: Verify formula: grandTotal = taxableAmount + totalTax + charges
  section('5. Verify grandTotal formula');
  
  const [recentOrders] = await pool.query(`
    SELECT o.id FROM orders o 
    WHERE o.status NOT IN ('cancelled', 'pending')
    ORDER BY o.created_at DESC LIMIT 3
  `);
  
  for (const row of recentOrders) {
    const order = await orderService.getOrderWithItems(row.id);
    if (!order || !order.items || order.items.length === 0) continue;
    
    const billDetails = await billingService.calculateBillDetails({
      ...order,
      discount_amount: order.discount_amount || order.discountAmount || 0,
      items: order.items
    }, { applyServiceCharge: false });
    
    const preRoundTotal = billDetails.taxableAmount + billDetails.totalTax + 
                          billDetails.serviceCharge + billDetails.packagingCharge + 
                          billDetails.deliveryCharge;
    const expectedGrandTotal = Math.round(preRoundTotal);
    const expectedRoundOff = expectedGrandTotal - preRoundTotal;
    
    const gtCorrect = billDetails.grandTotal === expectedGrandTotal;
    const roCorrect = Math.abs(billDetails.roundOff - expectedRoundOff) < 0.01;
    
    test(`Order ${order.orderNumber}: grandTotal correct`, gtCorrect,
      `gt=${billDetails.grandTotal}, expected=${expectedGrandTotal}`);
    test(`Order ${order.orderNumber}: roundOff correct`, roCorrect,
      `ro=${billDetails.roundOff.toFixed(2)}, expected=${expectedRoundOff.toFixed(2)}`);
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  TEST RESULTS: ✅ ${passed} passed, ❌ ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n  ⚠️ Some tests failed!');
  } else {
    console.log('\n  ✅ All bill calculation tests passed!');
  }

  console.log(`
  📋 BILL CALCULATION FORMULA:
  ─────────────────────────────────────────────────────
  subtotal       = sum of item total_price
  taxableAmount  = subtotal - discountAmount
  discountRatio  = taxableAmount / subtotal
  
  cgstAmount     = sum(item CGST) × discountRatio
  sgstAmount     = sum(item SGST) × discountRatio
  vatAmount      = sum(item VAT) × discountRatio
  
  totalTax       = cgstAmount + sgstAmount + igstAmount + vatAmount + cessAmount
  
  preRoundTotal  = taxableAmount + totalTax + serviceCharge + packagingCharge + deliveryCharge
  grandTotal     = Math.round(preRoundTotal)
  roundOff       = grandTotal - preRoundTotal
  ─────────────────────────────────────────────────────
  `);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
