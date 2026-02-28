/**
 * Comprehensive verification of Cash Drawer Status API calculations
 * Tests all scenarios: cashier-wise, floor-wise, payment accuracy
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const paymentService = require('../src/services/payment.service');

async function verify() {
  await initializeDatabase();
  const pool = getPool();
  const today = '2026-02-28';
  const outletId = 43;

  console.log('='.repeat(70));
  console.log('COMPREHENSIVE CASH DRAWER VERIFICATION');
  console.log('='.repeat(70));

  // 1. Get all sessions for today
  const [sessions] = await pool.query(`
    SELECT ds.*, u.name as cashier_name, f.name as floor_name
    FROM day_sessions ds
    LEFT JOIN users u ON ds.cashier_id = u.id
    LEFT JOIN floors f ON ds.floor_id = f.id
    WHERE ds.outlet_id = ? AND ds.session_date = ?
  `, [outletId, today]);

  console.log('\n1. ALL SESSIONS TODAY:');
  sessions.forEach(s => {
    console.log(`   Floor: ${s.floor_name} (${s.floor_id}) | Cashier: ${s.cashier_name} (${s.cashier_id}) | Status: ${s.status}`);
  });

  // 2. For each floor, verify calculations
  for (const session of sessions) {
    const floorId = session.floor_id;
    const cashierId = session.cashier_id;
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`FLOOR: ${session.floor_name} (ID: ${floorId}) | CASHIER: ${session.cashier_name}`);
    console.log('='.repeat(70));

    // 2a. Get all orders for this floor today
    const [orders] = await pool.query(`
      SELECT o.id, o.order_number, o.status, o.total_amount, o.paid_amount, 
             o.guest_count, o.order_type, t.floor_id, o.created_at
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.outlet_id = ? AND DATE(o.created_at) = ?
      AND (t.floor_id = ? OR (o.table_id IS NULL AND o.order_type != 'dine_in'))
      AND o.status != 'cancelled'
      ORDER BY o.id
    `, [outletId, today, floorId]);

    console.log('\n2a. ORDERS ON THIS FLOOR TODAY:');
    let totalOrders = 0, completedOrders = 0, activeOrders = 0;
    let totalGuests = 0, pendingAmount = 0;
    orders.forEach(o => {
      totalOrders++;
      totalGuests += parseInt(o.guest_count) || 0;
      if (['paid', 'completed'].includes(o.status)) {
        completedOrders++;
      } else {
        activeOrders++;
        pendingAmount += parseFloat(o.total_amount) || 0;
      }
      console.log(`   ${o.order_number}: status=${o.status}, total=${o.total_amount}, paid=${o.paid_amount}, floor=${o.floor_id}`);
    });
    console.log(`   CALCULATED: totalOrders=${totalOrders}, completed=${completedOrders}, active=${activeOrders}, guests=${totalGuests}, pending=₹${pendingAmount}`);

    // 2b. Get all payments for this floor today
    const [payments] = await pool.query(`
      SELECT p.id, p.order_id, p.amount, p.payment_mode, p.status as pay_status,
             o.order_number, t.floor_id, p.created_at
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE p.outlet_id = ? AND DATE(p.created_at) = ? AND p.status = 'completed'
      AND (t.floor_id = ? OR (o.table_id IS NULL AND o.order_type != 'dine_in'))
      ORDER BY p.id
    `, [outletId, today, floorId]);

    console.log('\n2b. PAYMENTS ON THIS FLOOR TODAY:');
    let totalCollected = 0, ordersPaidToday = new Set();
    let cashTotal = 0, cardTotal = 0, upiTotal = 0;
    payments.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      totalCollected += amt;
      ordersPaidToday.add(p.order_id);
      if (p.payment_mode === 'cash') cashTotal += amt;
      else if (['card', 'credit_card', 'debit_card'].includes(p.payment_mode)) cardTotal += amt;
      else if (p.payment_mode === 'upi') upiTotal += amt;
      console.log(`   ${p.order_number}: ₹${p.amount} via ${p.payment_mode}, floor=${p.floor_id}`);
    });
    console.log(`   CALCULATED: totalCollected=₹${totalCollected}, ordersPaid=${ordersPaidToday.size}`);
    console.log(`   BREAKDOWN: cash=₹${cashTotal}, card=₹${cardTotal}, upi=₹${upiTotal}`);

    // 2c. Get cash drawer movements
    const [movements] = await pool.query(`
      SELECT transaction_type, SUM(amount) as total
      FROM cash_drawer
      WHERE outlet_id = ? AND DATE(created_at) = ? AND floor_id = ?
      GROUP BY transaction_type
    `, [outletId, today, floorId]);

    console.log('\n2c. CASH DRAWER MOVEMENTS:');
    let openingCash = 0, cashSales = 0, cashIn = 0, cashOut = 0, refunds = 0, expenses = 0;
    movements.forEach(m => {
      const amt = parseFloat(m.total) || 0;
      console.log(`   ${m.transaction_type}: ₹${amt}`);
      switch(m.transaction_type) {
        case 'opening': openingCash = amt; break;
        case 'sale': cashSales = amt; break;
        case 'cash_in': cashIn = amt; break;
        case 'cash_out': cashOut = Math.abs(amt); break;
        case 'refund': refunds = Math.abs(amt); break;
        case 'expense': expenses = Math.abs(amt); break;
      }
    });
    const expectedCash = openingCash + cashSales + cashIn - cashOut - refunds - expenses;
    console.log(`   EXPECTED CASH: ${openingCash} + ${cashSales} + ${cashIn} - ${cashOut} - ${refunds} - ${expenses} = ₹${expectedCash}`);

    // 2d. Get running tables (occupied tables with active orders)
    const [tables] = await pool.query(`
      SELECT t.id, t.table_number, t.status, o.id as order_id, o.order_number, 
             o.status as order_status, o.total_amount, o.guest_count
      FROM tables t
      LEFT JOIN orders o ON o.table_id = t.id 
        AND o.status NOT IN ('paid', 'completed', 'cancelled')
        AND DATE(o.created_at) = ?
      WHERE t.floor_id = ? AND t.status = 'occupied'
    `, [today, floorId]);

    console.log('\n2d. RUNNING TABLES:');
    let runningTableCount = 0, runningAmount = 0, runningGuests = 0;
    tables.forEach(t => {
      runningTableCount++;
      runningAmount += parseFloat(t.total_amount) || 0;
      runningGuests += parseInt(t.guest_count) || 0;
      console.log(`   ${t.table_number}: ${t.order_number}, status=${t.order_status}, amount=₹${t.total_amount}`);
    });
    console.log(`   TOTAL: ${runningTableCount} tables, ₹${runningAmount}, ${runningGuests} guests`);

    // 2e. Now call the API and compare
    console.log('\n2e. API RESPONSE vs CALCULATED:');
    const apiResult = await paymentService.getCashDrawerStatus(outletId, floorId, cashierId);
    
    const checks = [
      { name: 'totalOrders', api: apiResult.sales.totalOrders, calc: totalOrders },
      { name: 'completedOrders', api: apiResult.sales.completedOrders, calc: completedOrders },
      { name: 'activeOrders', api: apiResult.sales.activeOrders, calc: activeOrders },
      { name: 'totalGuests', api: apiResult.sales.totalGuests, calc: totalGuests },
      { name: 'totalCollected', api: apiResult.sales.totalCollected, calc: totalCollected },
      { name: 'ordersPaidToday', api: apiResult.sales.ordersPaidToday, calc: ordersPaidToday.size },
      { name: 'pendingAmount', api: apiResult.sales.pendingAmount, calc: pendingAmount },
      { name: 'paymentBreakdown.cash', api: apiResult.paymentBreakdown.cash, calc: cashTotal },
      { name: 'paymentBreakdown.total', api: apiResult.paymentBreakdown.total, calc: totalCollected },
      { name: 'expectedCash', api: apiResult.expectedCash, calc: expectedCash },
    ];

    let allMatch = true;
    checks.forEach(c => {
      const match = c.api === c.calc;
      if (!match) allMatch = false;
      console.log(`   ${match ? '✅' : '❌'} ${c.name}: API=${c.api}, CALC=${c.calc}`);
    });

    console.log(allMatch ? '\n   ✅ ALL CALCULATIONS MATCH!' : '\n   ❌ SOME CALCULATIONS DO NOT MATCH!');
  }

  process.exit(0);
}

verify();
