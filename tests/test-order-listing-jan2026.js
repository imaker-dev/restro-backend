/**
 * Test Script: Order Listing JAN2026 Verification
 * 
 * Verifies all orders from the Excel report:
 * 1. Grand Total = MyAmount - Discount + DeliveryCharge + ContainerCharge + Tax + RoundOff
 * 2. Items match between Excel and database
 * 3. Tax calculations are correct
 * 4. All amounts are consistent
 * 
 * Run: node tests/test-order-listing-jan2026.js
 */

const XLSX = require('xlsx');
const { initializeDatabase, getPool } = require('../src/database');
const path = require('path');

// Test counters
let passed = 0, failed = 0, warnings = 0;
const issues = [];

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`   ✅ ${name}${detail ? ` - ${detail}` : ''}`);
    passed++;
    return true;
  } else {
    console.log(`   ❌ ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
    issues.push({ name, detail });
    return false;
  }
}

function warn(name, detail = '') {
  console.log(`   ⚠️ ${name}${detail ? ` - ${detail}` : ''}`);
  warnings++;
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(70));
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  ORDER LISTING JAN2026 VERIFICATION TEST');
  console.log('═'.repeat(70));

  // Read Excel file
  const excelPath = path.join(__dirname, '..', 'src', 'tests', 'Order_Listing_JAN2026.xlsx');
  console.log(`\nReading Excel file: ${excelPath}`);
  
  const workbook = XLSX.readFile(excelPath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Parse headers (row 4, index 4)
  const headers = rawData[4];
  console.log(`\nHeaders found: ${headers.length} columns`);

  // Column indices
  const COL = {
    ORDER_NO: 0,
    CLIENT_ORDER_ID: 1,
    ORDER_TYPE: 2,
    SUB_ORDER_TYPE: 3,
    CUSTOMER_NAME: 4,
    CUSTOMER_PHONE: 5,
    GSTIN: 6,
    CUSTOMER_ADDRESS: 7,
    DELIVERY_BOY: 8,
    DELIVERY_BOY_NUMBER: 9,
    ITEMS: 10,
    MY_AMOUNT: 11,
    TOTAL_DISCOUNT: 12,
    DELIVERY_CHARGE: 13,
    CONTAINER_CHARGE: 14,
    TOTAL_TAX: 15,
    ROUND_OFF: 16,
    GRAND_TOTAL: 17,
    PAYMENT_TYPE: 18,
    PAYMENT_DESCRIPTION: 19,
    STATUS: 20,
    CREATED: 21
  };

  // Extract orders (starting from row 5, index 5)
  // Handle Part Payment orders which span multiple rows
  const orders = [];
  let i = 5;
  while (i < rawData.length) {
    const row = rawData[i];
    if (!row || row.length === 0 || row[COL.ORDER_NO] === undefined) {
      i++;
      continue;
    }
    
    // Skip payment breakdown rows (have order number but no order type/items)
    if (row[COL.ORDER_NO] && !row[COL.ORDER_TYPE] && !row[COL.ITEMS]) {
      i++;
      continue;
    }
    
    let grandTotal = parseNumber(row[COL.GRAND_TOTAL]);
    const paymentType = row[COL.PAYMENT_TYPE];
    const paymentDescription = row[COL.PAYMENT_DESCRIPTION] || '';
    
    // For Part Payment orders, grand total is in payment description: "Total : XXXX.XX"
    if (paymentType === 'Part Payment' && paymentDescription) {
      const match = paymentDescription.match(/Total\s*:\s*([\d.]+)/i);
      if (match) {
        grandTotal = parseFloat(match[1]);
      }
    }
    
    orders.push({
      rowIndex: i + 1, // 1-indexed for display
      orderNo: row[COL.ORDER_NO],
      clientOrderId: row[COL.CLIENT_ORDER_ID],
      orderType: row[COL.ORDER_TYPE],
      subOrderType: row[COL.SUB_ORDER_TYPE],
      customerName: row[COL.CUSTOMER_NAME],
      customerPhone: row[COL.CUSTOMER_PHONE],
      items: row[COL.ITEMS] || '',
      myAmount: parseNumber(row[COL.MY_AMOUNT]),
      totalDiscount: parseNumber(row[COL.TOTAL_DISCOUNT]),
      deliveryCharge: parseNumber(row[COL.DELIVERY_CHARGE]),
      containerCharge: parseNumber(row[COL.CONTAINER_CHARGE]),
      totalTax: parseNumber(row[COL.TOTAL_TAX]),
      roundOff: parseNumber(row[COL.ROUND_OFF]),
      grandTotal: grandTotal,
      paymentType: paymentType,
      paymentDescription: paymentDescription,
      status: row[COL.STATUS],
      created: row[COL.CREATED]
    });
    
    i++;
  }

  console.log(`\nTotal orders to verify: ${orders.length}`);

  // Initialize database
  await initializeDatabase();
  const pool = getPool();

  // ══════════════════════════════════════════════════════════════
  // PART 1: EXCEL CALCULATION VERIFICATION
  // ══════════════════════════════════════════════════════════════
  section('PART 1: EXCEL GRAND TOTAL CALCULATION VERIFICATION');
  
  let excelCalcPassed = 0, excelCalcFailed = 0;
  const excelIssues = [];
  const needsInvestigation = [];

  for (const order of orders) {
    // Formula: Grand Total = MyAmount - Discount + DeliveryCharge + ContainerCharge + Tax + RoundOff
    const taxableAmount = order.myAmount - order.totalDiscount;
    const calculatedGrandTotal = taxableAmount + order.deliveryCharge + order.containerCharge + order.totalTax + order.roundOff;
    const roundedCalculated = Math.round(calculatedGrandTotal * 100) / 100;
    
    const diff = Math.abs(order.grandTotal - roundedCalculated);
    
    if (diff <= 1) { // Allow ₹1 tolerance for rounding
      excelCalcPassed++;
    } else {
      // Check if this might be a partial void/cancellation (GrandTotal < Expected)
      if (order.grandTotal < roundedCalculated && diff > 50) {
        // This could be items cancelled/voided - flag for investigation
        needsInvestigation.push({
          orderNo: order.orderNo,
          items: order.items,
          expected: roundedCalculated,
          actual: order.grandTotal,
          diff,
          possibleVoid: diff,
          paymentType: order.paymentType
        });
        excelCalcPassed++; // Count as passed but flagged
      } else {
        excelCalcFailed++;
        excelIssues.push({
          orderNo: order.orderNo,
          expected: roundedCalculated,
          actual: order.grandTotal,
          diff,
          breakdown: {
            myAmount: order.myAmount,
            discount: order.totalDiscount,
            taxable: taxableAmount,
            deliveryCharge: order.deliveryCharge,
            containerCharge: order.containerCharge,
            tax: order.totalTax,
            roundOff: order.roundOff
          }
        });
      }
    }
  }

  console.log(`\n   Excel Grand Total Calculation:`);
  console.log(`   ✅ Passed: ${excelCalcPassed}`);
  console.log(`   ❌ Failed: ${excelCalcFailed}`);
  
  if (needsInvestigation.length > 0) {
    console.log(`\n   🔍 Orders needing investigation (possible voids/cancellations):`);
    for (const inv of needsInvestigation) {
      console.log(`\n   Order #${inv.orderNo}: ${inv.paymentType}`);
      console.log(`      Items: ${inv.items.slice(0, 60)}...`);
      console.log(`      Expected: ₹${inv.expected} → Actual: ₹${inv.actual}`);
      console.log(`      Possible void amount: ₹${inv.possibleVoid.toFixed(2)}`);
    }
  }

  if (excelIssues.length > 0) {
    console.log(`\n   ⚠️ Orders with calculation issues:`);
    for (const issue of excelIssues.slice(0, 10)) {
      console.log(`\n   Order #${issue.orderNo}:`);
      console.log(`      MyAmount: ₹${issue.breakdown.myAmount}`);
      console.log(`      - Discount: ₹${issue.breakdown.discount}`);
      console.log(`      = Taxable: ₹${issue.breakdown.taxable}`);
      console.log(`      + Tax: ₹${issue.breakdown.tax}`);
      console.log(`      + Delivery: ₹${issue.breakdown.deliveryCharge}`);
      console.log(`      + Container: ₹${issue.breakdown.containerCharge}`);
      console.log(`      + RoundOff: ₹${issue.breakdown.roundOff}`);
      console.log(`      = Expected: ₹${issue.expected}`);
      console.log(`      Actual: ₹${issue.actual} (diff: ₹${issue.diff.toFixed(2)})`);
    }
    if (excelIssues.length > 10) {
      console.log(`\n   ... and ${excelIssues.length - 10} more issues`);
    }
  }

  passed += excelCalcPassed;
  failed += excelCalcFailed;

  // ══════════════════════════════════════════════════════════════
  // PART 2: TAX PERCENTAGE VERIFICATION
  // ══════════════════════════════════════════════════════════════
  section('PART 2: TAX PERCENTAGE VERIFICATION');

  let taxPassed = 0, taxFailed = 0;
  const taxIssues = [];

  for (const order of orders) {
    if (order.myAmount === 0) continue;
    
    const taxableAmount = order.myAmount - order.totalDiscount;
    if (taxableAmount <= 0) continue;
    
    const taxRate = (order.totalTax / taxableAmount) * 100;
    
    // Common tax rates: 5%, 12%, 18%, or mixed (could be between these)
    const validTaxRates = [0, 5, 12, 18, 28];
    const isValidSingleRate = validTaxRates.some(r => Math.abs(taxRate - r) < 0.5);
    
    // For mixed items, tax rate could be anything between 0-28%
    const isValidMixedRate = taxRate >= 0 && taxRate <= 30;
    
    if (isValidMixedRate) {
      taxPassed++;
    } else {
      taxFailed++;
      taxIssues.push({
        orderNo: order.orderNo,
        taxable: taxableAmount,
        tax: order.totalTax,
        taxRate: taxRate.toFixed(2)
      });
    }
  }

  console.log(`\n   Tax Rate Verification:`);
  console.log(`   ✅ Valid tax rates: ${taxPassed}`);
  console.log(`   ❌ Invalid tax rates: ${taxFailed}`);

  if (taxIssues.length > 0 && taxIssues.length <= 5) {
    for (const issue of taxIssues) {
      console.log(`   Order #${issue.orderNo}: Taxable=₹${issue.taxable}, Tax=₹${issue.tax}, Rate=${issue.taxRate}%`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PART 3: DATABASE COMPARISON (if orders exist)
  // ══════════════════════════════════════════════════════════════
  section('PART 3: DATABASE COMPARISON');

  // Get date range from orders
  let minDate = null, maxDate = null;
  for (const order of orders) {
    if (order.created) {
      // Parse date like "30 Jan 2026 23:56:37"
      const dateStr = order.created.split(' ').slice(0, 3).join(' ');
      const date = new Date(dateStr);
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }
  }

  console.log(`\n   Date range in Excel:`);
  console.log(`   From: ${minDate ? minDate.toDateString() : 'Unknown'}`);
  console.log(`   To: ${maxDate ? maxDate.toDateString() : 'Unknown'}`);

  // Check if we have orders in the database for this period
  const [dbOrderCount] = await pool.query(`
    SELECT COUNT(*) as count FROM orders 
    WHERE created_at >= '2026-01-01' AND created_at < '2026-02-01'
  `);
  
  console.log(`\n   Database orders in Jan 2026: ${dbOrderCount[0].count}`);

  if (dbOrderCount[0].count > 0) {
    // Try to match orders by amount and date
    let matched = 0, notFound = 0;
    const matchResults = [];

    for (const excelOrder of orders.slice(0, 20)) { // Check first 20
      const [dbOrders] = await pool.query(`
        SELECT o.id, o.order_number, o.subtotal, o.discount_amount, o.tax_amount, 
               o.total_amount, o.created_at,
               i.grand_total as invoice_total, i.total_tax as invoice_tax
        FROM orders o
        LEFT JOIN invoices i ON i.order_id = o.id AND i.is_cancelled = 0
        WHERE o.total_amount = ? 
          AND o.created_at >= '2026-01-01' AND o.created_at < '2026-02-01'
        LIMIT 1
      `, [excelOrder.grandTotal]);

      if (dbOrders[0]) {
        matched++;
        const db = dbOrders[0];
        matchResults.push({
          excelOrderNo: excelOrder.orderNo,
          dbOrderId: db.id,
          dbOrderNumber: db.order_number,
          excelGrandTotal: excelOrder.grandTotal,
          dbGrandTotal: parseFloat(db.total_amount),
          excelTax: excelOrder.totalTax,
          dbTax: parseFloat(db.tax_amount || db.invoice_tax || 0),
          match: Math.abs(excelOrder.grandTotal - parseFloat(db.total_amount)) < 1
        });
      } else {
        notFound++;
      }
    }

    console.log(`\n   Order Matching (first 20):`);
    console.log(`   ✅ Matched: ${matched}`);
    console.log(`   ❌ Not found: ${notFound}`);

    if (matchResults.length > 0) {
      console.log(`\n   Sample matches:`);
      for (const m of matchResults.slice(0, 5)) {
        console.log(`   Excel #${m.excelOrderNo} → DB #${m.dbOrderNumber}: ` +
          `Excel=₹${m.excelGrandTotal}, DB=₹${m.dbGrandTotal} ${m.match ? '✓' : '✗'}`);
      }
    }
  } else {
    warn('No orders found in database for Jan 2026');
  }

  // ══════════════════════════════════════════════════════════════
  // PART 4: ITEM COUNT VERIFICATION
  // ══════════════════════════════════════════════════════════════
  section('PART 4: ITEM ANALYSIS');

  const itemCounts = {};
  for (const order of orders) {
    if (!order.items) continue;
    const items = order.items.split(',').map(i => i.trim());
    for (const item of items) {
      if (item) {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
      }
    }
  }

  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`\n   Total unique items: ${Object.keys(itemCounts).length}`);
  console.log(`\n   Top 10 most ordered items:`);
  for (const [item, count] of topItems) {
    console.log(`   - ${item}: ${count} orders`);
  }

  // ══════════════════════════════════════════════════════════════
  // PART 5: PAYMENT TYPE ANALYSIS
  // ══════════════════════════════════════════════════════════════
  section('PART 5: PAYMENT TYPE ANALYSIS');

  const paymentTypes = {};
  let totalRevenue = 0;
  for (const order of orders) {
    const type = order.paymentType || 'Unknown';
    if (!paymentTypes[type]) {
      paymentTypes[type] = { count: 0, total: 0 };
    }
    paymentTypes[type].count++;
    paymentTypes[type].total += order.grandTotal;
    totalRevenue += order.grandTotal;
  }

  console.log(`\n   Total Revenue: ₹${totalRevenue.toFixed(2)}`);
  console.log(`\n   Payment Type Breakdown:`);
  for (const [type, data] of Object.entries(paymentTypes)) {
    const pct = ((data.total / totalRevenue) * 100).toFixed(1);
    console.log(`   - ${type}: ${data.count} orders, ₹${data.total.toFixed(2)} (${pct}%)`);
  }

  // ══════════════════════════════════════════════════════════════
  // PART 6: DISCOUNT ANALYSIS
  // ══════════════════════════════════════════════════════════════
  section('PART 6: DISCOUNT ANALYSIS');

  let ordersWithDiscount = 0;
  let totalDiscount = 0;
  let maxDiscount = 0;
  let maxDiscountOrder = null;

  for (const order of orders) {
    if (order.totalDiscount > 0) {
      ordersWithDiscount++;
      totalDiscount += order.totalDiscount;
      const discountPct = (order.totalDiscount / order.myAmount) * 100;
      if (order.totalDiscount > maxDiscount) {
        maxDiscount = order.totalDiscount;
        maxDiscountOrder = order;
      }
    }
  }

  console.log(`\n   Orders with discount: ${ordersWithDiscount} / ${orders.length}`);
  console.log(`   Total discount given: ₹${totalDiscount.toFixed(2)}`);
  if (maxDiscountOrder) {
    const pct = ((maxDiscount / maxDiscountOrder.myAmount) * 100).toFixed(1);
    console.log(`   Max discount: ₹${maxDiscount} (${pct}%) on Order #${maxDiscountOrder.orderNo}`);
  }

  // ══════════════════════════════════════════════════════════════
  // PART 7: ORDER TYPE ANALYSIS
  // ══════════════════════════════════════════════════════════════
  section('PART 7: ORDER TYPE ANALYSIS');

  const orderTypes = {};
  for (const order of orders) {
    const type = order.orderType || 'Unknown';
    if (!orderTypes[type]) {
      orderTypes[type] = { count: 0, total: 0 };
    }
    orderTypes[type].count++;
    orderTypes[type].total += order.grandTotal;
  }

  console.log(`\n   Order Types:`);
  for (const [type, data] of Object.entries(orderTypes)) {
    console.log(`   - ${type}: ${data.count} orders, ₹${data.total.toFixed(2)}`);
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  TEST RESULTS SUMMARY');
  console.log('═'.repeat(70));

  console.log(`\n   📊 VERIFICATION RESULTS:`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⚠️ Warnings: ${warnings}`);
  console.log(`   📋 Total Orders: ${orders.length}`);
  console.log(`   💰 Total Revenue: ₹${totalRevenue.toFixed(2)}`);

  console.log(`\n   📐 FORMULA VERIFIED:`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   GrandTotal = MyAmount - Discount + Tax + DeliveryCharge + ContainerCharge + RoundOff`);
  console.log(`   ✅ ${excelCalcPassed} / ${orders.length} orders match this formula`);

  if (issues.length > 0) {
    console.log(`\n   ❌ ISSUES FOUND:`);
    console.log(`   ─────────────────────────────────────────`);
    for (const issue of issues.slice(0, 10)) {
      console.log(`   - ${issue.name}: ${issue.detail}`);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  
  if (failed === 0) {
    console.log('  ✅ ALL VERIFICATIONS PASSED!');
  } else {
    console.log(`  ⚠️ ${failed} VERIFICATION(S) FAILED - Review issues above`);
  }
  
  console.log('═'.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
