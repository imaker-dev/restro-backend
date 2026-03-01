/**
 * End-to-End KOT Multi-Station Test
 * Tests: Order creation → KOT send → Print job verification → Bridge polling
 * 
 * Run: node tests/test-kot-multi-station.js
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('../src/database');
const orderService = require('../src/services/order.service');
const kotService = require('../src/services/kot.service');
const printerService = require('../src/services/printer.service');

const OUTLET_ID = 43;
const USER_ID = 15;

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function section(title) {
  console.log('\n' + '═'.repeat(70));
  log(colors.cyan, `  ${title}`);
  console.log('═'.repeat(70));
}

function test(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? colors.green : colors.red;
  log(color, `  ${icon} ${name}` + (details ? ` (${details})` : ''));
  return passed;
}

async function main() {
  console.log('\n');
  log(colors.cyan, '╔══════════════════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║         KOT MULTI-STATION END-TO-END TEST                            ║');
  log(colors.cyan, '╚══════════════════════════════════════════════════════════════════════╝');

  await initializeDatabase();
  const pool = getPool();

  let testsPassed = 0;
  let testsFailed = 0;
  let createdOrderId = null;

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Get items from different stations
    // ═══════════════════════════════════════════════════════════════
    section('STEP 1: GET ITEMS FROM DIFFERENT STATIONS');

    // Get items from Kitchen station (id=55, type=main_kitchen)
    const [kitchenItems] = await pool.query(`
      SELECT i.id, i.name, i.base_price, ks.name as station_name, ks.station_type, ks.printer_id
      FROM items i
      JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = ? AND i.kitchen_station_id = 55 AND i.deleted_at IS NULL AND i.is_available = 1
      LIMIT 2
    `, [OUTLET_ID]);

    // Get items from Bar station (id=58, type=bar)
    const [barItems] = await pool.query(`
      SELECT i.id, i.name, i.base_price, ks.name as station_name, ks.station_type, ks.printer_id
      FROM items i
      JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = ? AND i.kitchen_station_id = 58 AND i.deleted_at IS NULL AND i.is_available = 1
      LIMIT 2
    `, [OUTLET_ID]);

    // Get items from Tandoor station (id=57, type=tandoor)
    const [tandoorItems] = await pool.query(`
      SELECT i.id, i.name, i.base_price, ks.name as station_name, ks.station_type, ks.printer_id
      FROM items i
      JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = ? AND i.kitchen_station_id = 57 AND i.deleted_at IS NULL AND i.is_available = 1
      LIMIT 1
    `, [OUTLET_ID]);

    console.log('\nItems for test order:');
    console.log('Kitchen items:', kitchenItems.map(i => `${i.name} (printer:${i.printer_id})`).join(', ') || 'NONE');
    console.log('Bar items:', barItems.map(i => `${i.name} (printer:${i.printer_id})`).join(', ') || 'NONE');
    console.log('Tandoor items:', tandoorItems.map(i => `${i.name} (printer:${i.printer_id})`).join(', ') || 'NONE');

    const allItems = [...kitchenItems, ...barItems, ...tandoorItems];
    
    if (allItems.length < 3) {
      log(colors.red, '\n❌ Not enough items from different stations for testing!');
      log(colors.yellow, '   Need items assigned to Kitchen (55), Bar (58), and Tandoor (57) stations.');
      process.exit(1);
    }

    if (test('Items from Kitchen station', kitchenItems.length > 0, `${kitchenItems.length} items`)) testsPassed++; else testsFailed++;
    if (test('Items from Bar station', barItems.length > 0, `${barItems.length} items`)) testsPassed++; else testsFailed++;
    if (test('Items from Tandoor station', tandoorItems.length > 0, `${tandoorItems.length} items`)) testsPassed++; else testsFailed++;

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Create Order with multi-station items
    // ═══════════════════════════════════════════════════════════════
    section('STEP 2: CREATE ORDER WITH MULTI-STATION ITEMS');

    // Use takeaway order to avoid shift requirements
    const orderData = {
      outletId: OUTLET_ID,
      orderType: 'takeaway',
      tableId: null,
      floorId: null,
      customerName: 'KOT Test Customer',
      items: allItems.map(item => ({
        itemId: item.id,
        quantity: 1,
        unitPrice: parseFloat(item.base_price) || 100,
        specialInstructions: `Test item from ${item.station_name}`
      })),
      createdBy: USER_ID
    };

    console.log(`\nCreating order with ${allItems.length} items from ${new Set(allItems.map(i => i.station_type)).size} different stations...`);

    // Step 1: Create order (without items)
    const order = await orderService.createOrder({
      outletId: OUTLET_ID,
      orderType: 'takeaway',
      customerName: 'KOT Test Customer',
      createdBy: USER_ID
    });
    createdOrderId = order.id;

    if (test('Order created', !!order.id, `Order #${order.orderNumber}, ID: ${order.id}`)) testsPassed++; else testsFailed++;

    // Step 2: Add items to order
    console.log(`   Adding ${allItems.length} items to order...`);
    const itemsToAdd = allItems.map(item => ({
      itemId: item.id,
      quantity: 1,
      specialInstructions: `Test item from ${item.station_name}`
    }));

    await orderService.addItems(order.id, itemsToAdd, USER_ID);
    console.log(`   Items added: ${allItems.map(i => i.name).join(', ')}`);

    // Debug: Check order items status
    const [orderItems] = await pool.query(
      'SELECT id, item_name, status, kot_id FROM order_items WHERE order_id = ?',
      [order.id]
    );
    console.log(`\n   Order items (${orderItems.length}):`);
    orderItems.forEach(i => console.log(`     - ${i.item_name}: status=${i.status}, kot_id=${i.kot_id}`));

    const pendingCount = orderItems.filter(i => i.status === 'pending').length;
    if (test('Order items in pending status', pendingCount > 0, `${pendingCount}/${orderItems.length} pending`)) testsPassed++; else testsFailed++;

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Send KOT
    // ═══════════════════════════════════════════════════════════════
    section('STEP 3: SEND KOT');

    console.log('\nSending KOT for order...');
    const kotResult = await kotService.sendKot(order.id, USER_ID);

    console.log(`\nKOT Result: ${kotResult.tickets.length} ticket(s) created`);
    
    const expectedStations = new Set(allItems.map(i => i.station_type));
    if (test('Multiple KOT tickets created', kotResult.tickets.length >= expectedStations.size, 
        `${kotResult.tickets.length} tickets for ${expectedStations.size} stations`)) testsPassed++; else testsFailed++;

    console.log('\nKOT Tickets:');
    for (const ticket of kotResult.tickets) {
      console.log(`  - ${ticket.kotNumber}: station="${ticket.station}", stationId=${ticket.stationId}, items=${ticket.itemCount}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Verify Print Jobs Created Per Station
    // ═══════════════════════════════════════════════════════════════
    section('STEP 4: VERIFY PRINT JOBS PER STATION');

    // Get print jobs created for this order
    const [printJobs] = await pool.query(`
      SELECT pj.id, pj.job_type, pj.station, pj.printer_id, pj.kot_id, pj.reference_number, pj.status,
             p.name as printer_name, p.ip_address, p.station as printer_station
      FROM print_jobs pj
      LEFT JOIN printers p ON pj.printer_id = p.id
      WHERE pj.order_id = ? AND pj.job_type IN ('kot', 'bot')
      ORDER BY pj.id DESC
    `, [order.id]);

    console.log(`\nPrint jobs for order ${order.id}:`);
    console.log('ID'.padEnd(6) + 'Type'.padEnd(6) + 'Station'.padEnd(15) + 'PrinterID'.padEnd(10) + 'Printer'.padEnd(20) + 'IP'.padEnd(16) + 'Status');
    console.log('-'.repeat(90));

    let allJobsHavePrinter = true;
    let stationPrinterMap = {};

    for (const job of printJobs) {
      const hasIssue = !job.printer_id || !job.ip_address;
      if (hasIssue) allJobsHavePrinter = false;
      
      stationPrinterMap[job.station] = {
        printerId: job.printer_id,
        printerName: job.printer_name
      };

      const color = hasIssue ? colors.red : colors.green;
      log(color,
        String(job.id).padEnd(6) +
        (job.job_type || '').padEnd(6) +
        (job.station || '').padEnd(15) +
        (job.printer_id || 'NULL').toString().padEnd(10) +
        (job.printer_name || 'NOT FOUND').padEnd(20) +
        (job.ip_address || 'NOT SET').padEnd(16) +
        (job.status || '')
      );
    }

    if (test('All print jobs have printer_id', allJobsHavePrinter)) testsPassed++; else testsFailed++;
    if (test('Print job count matches KOT count', printJobs.length === kotResult.tickets.length, 
        `${printJobs.length} jobs, ${kotResult.tickets.length} tickets`)) testsPassed++; else testsFailed++;

    // Verify each station got correct printer
    console.log('\nStation → Printer mapping:');
    
    // Expected: main_kitchen → printer 15, bar → printer 16, tandoor → printer 15
    const expectedMapping = {
      'main_kitchen': 15,
      'bar': 16,
      'tandoor': 15
    };

    for (const [station, info] of Object.entries(stationPrinterMap)) {
      const expected = expectedMapping[station];
      const correct = info.printerId === expected;
      if (test(`${station} → printer ${info.printerId}`, correct, 
          correct ? 'correct' : `expected ${expected}`)) testsPassed++; else testsFailed++;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Test Bridge Polling
    // ═══════════════════════════════════════════════════════════════
    section('STEP 5: TEST BRIDGE POLLING');

    // Simulate what bridge does - get pending jobs
    const pendingJob = await printerService.getNextPendingJobAny(OUTLET_ID);
    
    if (pendingJob) {
      console.log('\nBridge would receive job:');
      console.log(`  ID: ${pendingJob.id}`);
      console.log(`  Type: ${pendingJob.job_type}`);
      console.log(`  Station: ${pendingJob.station}`);
      console.log(`  Printer IP: ${pendingJob.ip_address || 'NOT SET'}`);
      console.log(`  Reference: ${pendingJob.reference_number}`);
      
      if (test('Bridge receives job with IP address', !!pendingJob.ip_address, pendingJob.ip_address)) testsPassed++; else testsFailed++;
      
      // Reset job status for cleanup
      await pool.query('UPDATE print_jobs SET status = ? WHERE id = ?', ['pending', pendingJob.id]);
    } else {
      log(colors.yellow, '\nNo pending jobs for bridge (jobs may have been processed)');
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Summary
    // ═══════════════════════════════════════════════════════════════
    section('TEST SUMMARY');

    console.log(`\n  Total tests: ${testsPassed + testsFailed}`);
    log(colors.green, `  Passed: ${testsPassed}`);
    if (testsFailed > 0) log(colors.red, `  Failed: ${testsFailed}`);
    
    if (testsFailed === 0) {
      log(colors.green, '\n🎉 ALL TESTS PASSED! KOT multi-station printing is working correctly.');
    } else {
      log(colors.red, '\n⚠️  Some tests failed. Check the output above for details.');
    }

  } catch (error) {
    log(colors.red, '\n❌ Test error:', error.message);
    console.error(error);
    testsFailed++;
  } finally {
    // Cleanup: Cancel test order
    if (createdOrderId) {
      try {
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', createdOrderId]);
        console.log(`\n[Cleanup] Test order ${createdOrderId} cancelled.`);
      } catch (e) {
        console.log(`\n[Cleanup] Could not cancel order: ${e.message}`);
      }
    }

    console.log('\n' + '═'.repeat(70));
    log(colors.cyan, '  TEST COMPLETE');
    console.log('═'.repeat(70) + '\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

main();
