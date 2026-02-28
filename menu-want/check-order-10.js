require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function check() {
  await initializeDatabase();
  const pool = getPool();
  
  // Check order ORD2602280010
  const [orders] = await pool.query(`
    SELECT id, order_number, subtotal, discount_amount, tax_amount, 
           round_off, total_amount, paid_amount, status 
    FROM orders 
    WHERE order_number = 'ORD2602280010'
  `);
  
  console.log('Order ORD2602280010 from Database:');
  console.log(JSON.stringify(orders[0], null, 2));
  
  // Check what APIs return
  const orderService = require('../src/services/order.service');
  const reportsService = require('../src/services/reports.service');
  
  // getById
  const orderById = await orderService.getById(orders[0].id);
  console.log('\ngetById() returns:');
  console.log('  total_amount:', orderById.total_amount);
  console.log('  paid_amount:', orderById.paid_amount);
  console.log('  display_amount:', orderById.display_amount);
  
  // Captain history
  const history = await orderService.getCaptainOrderHistory(180, 43, { page: 1, limit: 20, viewAllFloorOrders: true });
  const histOrder = history.orders.find(o => o.order_number === 'ORD2602280010');
  console.log('\nCaptain History returns:');
  if (histOrder) {
    console.log('  total_amount:', histOrder.total_amount);
    console.log('  paid_amount:', histOrder.paid_amount);
    console.log('  display_amount:', histOrder.display_amount);
  } else {
    console.log('  Order not found');
  }
  
  // Daily sales detail
  const detail = await reportsService.getDailySalesDetail(43, '2026-02-28', '2026-02-28', { limit: 50 });
  const detailOrder = detail.orders.find(o => o.orderNumber === 'ORD2602280010');
  console.log('\nDaily Sales Detail returns:');
  if (detailOrder) {
    console.log('  totalAmount:', detailOrder.totalAmount);
    console.log('  paidAmount:', detailOrder.paidAmount);
    console.log('  displayAmount:', detailOrder.displayAmount);
  } else {
    console.log('  Order not found');
  }
  
  console.log('\n=== CONCLUSION ===');
  console.log('Expected displayAmount: ' + orders[0].paid_amount + ' (not ' + orders[0].total_amount + ')');
  
  process.exit(0);
}

check();
