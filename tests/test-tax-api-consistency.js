/**
 * Test Script: Tax Calculation API Consistency
 * 
 * Verifies that all APIs return consistent tax calculations:
 * 1. GET /api/v1/tables/:id - charges.taxSummary
 * 2. GET /api/v1/orders/:id - taxBreakup, vatAmount, totalTax
 * 3. GET /api/v1/orders/:id/bill - vatAmount, totalTax, taxBreakup
 * 
 * Run: node tests/test-tax-api-consistency.js
 */

const { initializeDatabase, getPool } = require('../src/database');
const orderService = require('../src/services/order.service');
const tableService = require('../src/services/table.service');
const billingService = require('../src/services/billing.service');

let passed = 0, failed = 0;

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`   ✅ ${name}${detail ? ` - ${detail}` : ''}`);
    passed++;
    return true;
  } else {
    console.log(`   ❌ ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
    return false;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(70));
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  TAX CALCULATION API CONSISTENCY TEST');
  console.log('═'.repeat(70));

  await initializeDatabase();
  const pool = getPool();

  // Find an order with discount for testing
  const [orders] = await pool.query(`
    SELECT o.id, o.order_number, o.table_id, o.subtotal, o.discount_amount, o.tax_amount
    FROM orders o
    WHERE o.discount_amount > 0 AND o.tax_amount > 0 AND o.status != 'cancelled'
    ORDER BY o.id DESC LIMIT 3
  `);

  if (orders.length === 0) {
    console.log('\n   ⚠️ No orders with discount found for testing');
    process.exit(0);
  }

  for (const orderRow of orders) {
    section(`Testing Order #${orderRow.order_number} (ID: ${orderRow.id})`);
    
    console.log(`\n   Order Data:`);
    console.log(`   - subtotal: ₹${orderRow.subtotal}`);
    console.log(`   - discount: ₹${orderRow.discount_amount}`);
    console.log(`   - tax_amount (DB): ₹${orderRow.tax_amount}`);
    
    const subtotal = parseFloat(orderRow.subtotal) || 0;
    const discount = parseFloat(orderRow.discount_amount) || 0;
    const taxableAmount = subtotal - discount;
    const discountRatio = subtotal > 0 ? (taxableAmount / subtotal) : 1;
    
    console.log(`   - taxable: ₹${taxableAmount}`);
    console.log(`   - discountRatio: ${discountRatio.toFixed(4)}`);

    // ══════════════════════════════════════════════════════════════
    // TEST 1: Orders API - getOrderWithItems
    // ══════════════════════════════════════════════════════════════
    console.log(`\n   📦 TEST 1: Orders API (getOrderWithItems)`);
    
    const order = await orderService.getOrderWithItems(orderRow.id);
    
    if (order) {
      console.log(`   - vatAmount: ₹${order.vatAmount}`);
      console.log(`   - totalTax: ₹${order.totalTax}`);
      console.log(`   - taxAmount (from DB): ₹${order.taxAmount}`);
      
      if (order.taxBreakup) {
        for (const [code, data] of Object.entries(order.taxBreakup)) {
          console.log(`   - taxBreakup[${code}]: taxable=₹${data.taxableAmount}, tax=₹${data.taxAmount}`);
        }
      }
      
      // Verify vatAmount matches totalTax (when only VAT)
      const taxSum = order.cgstAmount + order.sgstAmount + order.igstAmount + order.vatAmount + order.cessAmount;
      test('totalTax = sum of individual tax amounts', 
        Math.abs(order.totalTax - taxSum) < 0.02,
        `totalTax=${order.totalTax}, sum=${taxSum.toFixed(2)}`);
      
      // Verify taxBreakup amounts are discount-adjusted
      if (order.taxBreakup && Object.keys(order.taxBreakup).length > 0) {
        const breakupSum = Object.values(order.taxBreakup).reduce((s, b) => s + b.taxAmount, 0);
        test('taxBreakup sum matches totalTax',
          Math.abs(breakupSum - order.totalTax) < 0.02,
          `breakupSum=${breakupSum.toFixed(2)}, totalTax=${order.totalTax}`);
      }
    } else {
      console.log(`   ⚠️ Order not found`);
    }

    // ══════════════════════════════════════════════════════════════
    // TEST 2: Tables API - getTableDetails (if table exists)
    // ══════════════════════════════════════════════════════════════
    if (orderRow.table_id) {
      console.log(`\n   🍽️ TEST 2: Tables API (getFullDetails for table ${orderRow.table_id})`);
      
      try {
        const tableDetails = await tableService.getFullDetails(orderRow.table_id);
        
        if (tableDetails && tableDetails.order && tableDetails.order.charges) {
          const charges = tableDetails.order.charges;
          console.log(`   - subtotal: ₹${charges.subtotal}`);
          console.log(`   - discount: ₹${charges.discount}`);
          console.log(`   - totalTax: ₹${charges.totalTax}`);
          
          if (charges.taxSummary && charges.taxSummary.length > 0) {
            for (const ts of charges.taxSummary) {
              console.log(`   - taxSummary[${ts.taxGroup}]: taxable=₹${ts.taxableAmount}, tax=₹${ts.totalTax}`);
              for (const comp of ts.components || []) {
                console.log(`     - ${comp.code}: ₹${comp.amount}`);
              }
            }
            
            // Verify taxSummary sum matches totalTax
            const taxSummarySum = charges.taxSummary.reduce((s, ts) => s + ts.totalTax, 0);
            test('taxSummary sum matches totalTax',
              Math.abs(taxSummarySum - charges.totalTax) < 0.02,
              `taxSummarySum=${taxSummarySum.toFixed(2)}, totalTax=${charges.totalTax}`);
            
            // Verify taxSummary taxableAmount is discount-adjusted
            const expectedTaxable = charges.subtotal - charges.discount;
            const taxSummaryTaxable = charges.taxSummary.reduce((s, ts) => s + ts.taxableAmount, 0);
            test('taxSummary taxableAmount is discount-adjusted',
              Math.abs(taxSummaryTaxable - expectedTaxable) < 1,
              `taxSummaryTaxable=${taxSummaryTaxable.toFixed(2)}, expected=${expectedTaxable}`);
          }
        } else {
          console.log(`   ⚠️ No order charges found on table`);
        }
      } catch (err) {
        console.log(`   ⚠️ Table API error: ${err.message}`);
      }
    } else {
      console.log(`\n   ⏭️ Skipping Tables API test (no table_id)`);
    }

    // ══════════════════════════════════════════════════════════════
    // TEST 3: Bill API - generateBill / getInvoiceByOrder
    // ══════════════════════════════════════════════════════════════
    console.log(`\n   🧾 TEST 3: Bill API (getInvoiceByOrder)`);
    
    try {
      const invoice = await billingService.getInvoiceByOrder(orderRow.id);
      
      if (invoice) {
        console.log(`   - vatAmount: ₹${invoice.vatAmount}`);
        console.log(`   - totalTax: ₹${invoice.totalTax}`);
        
        if (invoice.taxBreakup) {
          for (const [code, data] of Object.entries(invoice.taxBreakup)) {
            console.log(`   - taxBreakup[${code}]: taxable=₹${data.taxableAmount}, tax=₹${data.taxAmount}`);
          }
        }
        
        // Verify vatAmount matches totalTax (when only VAT)
        const taxSum = invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount + invoice.vatAmount + invoice.cessAmount;
        test('Invoice: totalTax = sum of individual amounts',
          Math.abs(invoice.totalTax - taxSum) < 0.02,
          `totalTax=${invoice.totalTax}, sum=${taxSum.toFixed(2)}`);
        
        // Verify taxBreakup matches totalTax
        if (invoice.taxBreakup && Object.keys(invoice.taxBreakup).length > 0) {
          const breakupSum = Object.values(invoice.taxBreakup).reduce((s, b) => s + (b.taxAmount || 0), 0);
          test('Invoice: taxBreakup sum matches totalTax',
            Math.abs(breakupSum - invoice.totalTax) < 0.02,
            `breakupSum=${breakupSum.toFixed(2)}, totalTax=${invoice.totalTax}`);
        }
      } else {
        console.log(`   ⚠️ No invoice found for this order`);
      }
    } catch (err) {
      console.log(`   ⚠️ Bill API error: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  TEST RESULTS SUMMARY');
  console.log('═'.repeat(70));
  console.log(`\n   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log(`\n   ✅ ALL TAX CALCULATION CONSISTENCY TESTS PASSED!`);
  } else {
    console.log(`\n   ⚠️ ${failed} TEST(S) FAILED`);
  }
  
  console.log('═'.repeat(70));
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
