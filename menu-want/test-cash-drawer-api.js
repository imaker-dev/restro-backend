/**
 * Test Cash Drawer Status API - Comprehensive verification
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase } = require('../src/database');
const paymentService = require('../src/services/payment.service');

async function test() {
  await initializeDatabase();
  
  console.log('='.repeat(70));
  console.log('CASH DRAWER STATUS API - COMPREHENSIVE TEST');
  console.log('='.repeat(70));

  // Test for cashier 180 on outlet 43
  const status = await paymentService.getCashDrawerStatus(43, null, 180);

  console.log('\n1. SESSION INFO:');
  if (status.session) {
    console.log(`   Status: ${status.session.status}`);
    console.log(`   Floor: ${status.session.floorName} (ID: ${status.session.floorId})`);
    console.log(`   Cashier: ${status.session.cashierName} (ID: ${status.session.cashierId})`);
    console.log(`   Opening Cash: ₹${status.session.openingCash}`);
    console.log(`   Opening Time: ${status.session.openingTime}`);
  } else {
    console.log('   No active session');
  }

  console.log('\n2. ASSIGNED FLOOR:');
  if (status.assignedFloor) {
    console.log(`   Floor: ${status.assignedFloor.name} (ID: ${status.assignedFloor.id})`);
    console.log(`   Floor Number: ${status.assignedFloor.floorNumber}`);
  } else {
    console.log('   No floor assigned');
  }

  console.log('\n3. CASH BALANCE:');
  console.log(`   Current Balance: ₹${status.currentBalance}`);
  console.log(`   Expected Cash: ₹${status.expectedCash}`);

  console.log('\n4. SALES DATA (Today):');
  console.log(`   Total Orders: ${status.sales.totalOrders}`);
  console.log(`   Completed: ${status.sales.completedOrders}`);
  console.log(`   Active: ${status.sales.activeOrders}`);
  console.log(`   Total Guests: ${status.sales.totalGuests}`);
  console.log(`   Total Collected: ₹${status.sales.totalCollected}`);
  console.log(`   Orders Paid Today: ${status.sales.ordersPaidToday}`);
  console.log(`   Pending Amount: ₹${status.sales.pendingAmount}`);

  console.log('\n5. PAYMENT BREAKDOWN:');
  console.log(`   Cash: ₹${status.paymentBreakdown.cash}`);
  console.log(`   Card: ₹${status.paymentBreakdown.card}`);
  console.log(`   UPI: ₹${status.paymentBreakdown.upi}`);
  console.log(`   Wallet: ₹${status.paymentBreakdown.wallet}`);
  console.log(`   Other: ₹${status.paymentBreakdown.other}`);
  console.log(`   TOTAL: ₹${status.paymentBreakdown.total}`);

  console.log('\n6. PAYMENT DETAILS:');
  status.paymentDetails.forEach(p => {
    console.log(`   ${p.mode}: ${p.count} transactions, ₹${p.amount}`);
  });

  console.log('\n7. CASH MOVEMENTS:');
  console.log(`   Opening Cash: ₹${status.cashMovements.openingCash}`);
  console.log(`   Cash Sales: ₹${status.cashMovements.cashSales}`);
  console.log(`   Cash In: ₹${status.cashMovements.cashIn}`);
  console.log(`   Cash Out: ₹${status.cashMovements.cashOut}`);
  console.log(`   Refunds: ₹${status.cashMovements.refunds}`);
  console.log(`   Expenses: ₹${status.cashMovements.expenses}`);
  console.log(`   Expected Cash: ₹${status.cashMovements.expectedCash}`);

  console.log('\n8. RECENT TRANSACTIONS:');
  status.recentTransactions.slice(0, 5).forEach(t => {
    console.log(`   ${t.type}: ₹${t.amount} by ${t.userName} at ${t.createdAt}`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION:');
  console.log('='.repeat(70));
  
  // Verify consistency
  const checks = [
    {
      name: 'Sales collected = Payment breakdown total',
      pass: status.sales.totalCollected === status.paymentBreakdown.total,
      expected: status.paymentBreakdown.total,
      actual: status.sales.totalCollected
    },
    {
      name: 'Floor ID matches session floor',
      pass: status.floorId === status.session?.floorId,
      expected: status.session?.floorId,
      actual: status.floorId
    },
    {
      name: 'Assigned floor matches session floor',
      pass: status.assignedFloor?.id === status.session?.floorId,
      expected: status.session?.floorId,
      actual: status.assignedFloor?.id
    }
  ];

  let allPassed = true;
  checks.forEach(c => {
    const status = c.pass ? '✅' : '❌';
    console.log(`${status} ${c.name}: expected=${c.expected}, actual=${c.actual}`);
    if (!c.pass) allPassed = false;
  });

  console.log('\n' + (allPassed ? '✅ ALL CHECKS PASSED!' : '❌ SOME CHECKS FAILED'));
  
  process.exit(0);
}

test();
