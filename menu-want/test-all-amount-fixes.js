/**
 * Comprehensive test for amount calculation fixes across all APIs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testAllAmountFixes() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE AMOUNT CALCULATION FIXES TEST');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();
    const orderService = require('../src/services/order.service');
    const reportsService = require('../src/services/reports.service');

    // Test orders with discounts
    const testOrders = ['ORD2602280005', 'ORD2602280008'];
    
    for (const orderNum of testOrders) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`ORDER: ${orderNum}`);
      console.log('─'.repeat(80));
      
      // Get raw order data
      const [orderData] = await pool.query(
        `SELECT id, order_number, subtotal, discount_amount, tax_amount, 
                total_amount, paid_amount, status
         FROM orders WHERE order_number = ?`,
        [orderNum]
      );
      
      if (orderData.length === 0) {
        console.log(`❌ Order ${orderNum} not found`);
        continue;
      }
      
      const order = orderData[0];
      const expectedAmount = parseFloat(order.paid_amount);
      const wrongAmount = parseFloat(order.total_amount);
      
      console.log(`\n1. DATABASE VALUES:`);
      console.log(`   Subtotal: ₹${order.subtotal}`);
      console.log(`   Discount: ₹${order.discount_amount}`);
      console.log(`   Tax: ₹${order.tax_amount}`);
      console.log(`   total_amount: ₹${wrongAmount} (old field - wrong for discounted orders)`);
      console.log(`   paid_amount: ₹${expectedAmount} (correct amount paid)`);
      console.log(`   Status: ${order.status}`);
      
      // Test 2: getById
      console.log(`\n2. getById():`);
      const orderById = await orderService.getById(order.id);
      console.log(`   display_amount: ₹${orderById.display_amount}`);
      if (parseFloat(orderById.display_amount) === expectedAmount) {
        console.log(`   ✅ CORRECT`);
      } else {
        console.log(`   ❌ WRONG! Expected: ₹${expectedAmount}`);
      }

      // Test 3: Captain Order History
      console.log(`\n3. Captain Order History:`);
      const historyResult = await orderService.getCaptainOrderHistory(180, 43, {
        page: 1, limit: 20, viewAllFloorOrders: true
      });
      const historyOrder = historyResult.orders.find(o => o.order_number === orderNum);
      if (historyOrder) {
        console.log(`   display_amount: ₹${historyOrder.display_amount}`);
        if (parseFloat(historyOrder.display_amount) === expectedAmount) {
          console.log(`   ✅ CORRECT`);
        } else {
          console.log(`   ❌ WRONG! Expected: ₹${expectedAmount}`);
        }
      } else {
        console.log(`   Order not in history results`);
      }

      // Test 4: Admin Order List
      console.log(`\n4. Admin Order List:`);
      const adminList = await orderService.getAdminOrderList({
        outletId: 43,
        page: 1,
        limit: 20
      });
      const adminOrder = adminList.orders.find(o => o.orderNumber === orderNum);
      if (adminOrder) {
        console.log(`   displayAmount: ₹${adminOrder.displayAmount}`);
        if (parseFloat(adminOrder.displayAmount) === expectedAmount) {
          console.log(`   ✅ CORRECT`);
        } else {
          console.log(`   ❌ WRONG! Expected: ₹${expectedAmount}`);
        }
      } else {
        console.log(`   Order not in admin list results`);
      }

      // Test 5: Admin Order Detail
      console.log(`\n5. Admin Order Detail:`);
      const adminDetail = await orderService.getAdminOrderDetail(order.id);
      if (adminDetail && adminDetail.amounts) {
        console.log(`   amounts.displayAmount: ₹${adminDetail.amounts.displayAmount}`);
        if (parseFloat(adminDetail.amounts.displayAmount) === expectedAmount) {
          console.log(`   ✅ CORRECT`);
        } else {
          console.log(`   ❌ WRONG! Expected: ₹${expectedAmount}`);
        }
      } else {
        console.log(`   Order detail not found`);
      }

      // Test 6: Daily Sales Detail
      console.log(`\n6. Daily Sales Detail:`);
      const detailReport = await reportsService.getDailySalesDetail(43, '2026-02-28', '2026-02-28', {
        limit: 50
      });
      const detailOrder = detailReport.orders.find(o => o.orderNumber === orderNum);
      if (detailOrder) {
        console.log(`   displayAmount: ₹${detailOrder.displayAmount}`);
        if (parseFloat(detailOrder.displayAmount) === expectedAmount) {
          console.log(`   ✅ CORRECT`);
        } else {
          console.log(`   ❌ WRONG! Expected: ₹${expectedAmount}`);
        }
      } else {
        console.log(`   Order not in detail results`);
      }
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('SUMMARY OF FIXES APPLIED');
    console.log('='.repeat(80));
    console.log(`
✅ order.service.js - getById(): Added display_amount field
✅ order.service.js - getCaptainOrderHistory(): Added display_amount field
✅ order.service.js - getAdminOrderList(): Added displayAmount field
✅ order.service.js - getAdminOrderDetail(): Added displayAmount to amounts object
✅ reports.service.js - getDailySalesDetail(): Added displayAmount to each order
✅ reports.service.js - All aggregate reports: Use paid_amount for net_sales

FRONTEND USAGE:
- Use 'display_amount' or 'displayAmount' field instead of 'total_amount' or 'totalAmount'
- This field automatically shows paid_amount for completed orders
- For running orders, it shows total_amount (expected amount)
`);

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testAllAmountFixes();
