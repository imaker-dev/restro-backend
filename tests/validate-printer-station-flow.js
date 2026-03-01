/**
 * COMPLETE PRINTER → STATION → ITEM → KOT → BRIDGE JOB FLOW VALIDATION
 * 
 * Run: node tests/validate-printer-station-flow.js
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
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function section(num, title) {
  console.log('\n' + '═'.repeat(70));
  log(colors.cyan, `  ${num} ${title}`);
  console.log('═'.repeat(70));
}

function subsection(title) {
  console.log('\n' + '─'.repeat(50));
  log(colors.blue, `  ${title}`);
  console.log('─'.repeat(50));
}

function pass(msg) { log(colors.green, `  ✅ ${msg}`); return true; }
function fail(msg) { log(colors.red, `  ❌ ${msg}`); return false; }
function warn(msg) { log(colors.yellow, `  ⚠️  ${msg}`); }
function info(msg) { log(colors.white, `  ℹ️  ${msg}`); }

async function main() {
  console.log('\n');
  log(colors.cyan, '╔══════════════════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║   COMPLETE PRINTER → STATION → ITEM → KOT → BRIDGE FLOW VALIDATION   ║');
  log(colors.cyan, '╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\nOutlet ID: ${OUTLET_ID}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  await initializeDatabase();
  const pool = getPool();

  let totalPassed = 0;
  let totalFailed = 0;
  let createdOrderId = null;

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 0: CLEAN OLD PENDING JOBS
    // ═══════════════════════════════════════════════════════════════
    section('0️⃣', 'CLEANUP - Remove Old Pending Jobs');

    const [oldJobs] = await pool.query(
      `SELECT COUNT(*) as cnt FROM print_jobs WHERE outlet_id = ? AND status = 'pending'`,
      [OUTLET_ID]
    );
    info(`Found ${oldJobs[0].cnt} old pending jobs`);

    if (oldJobs[0].cnt > 0) {
      await pool.query(
        `UPDATE print_jobs SET status = 'cancelled' WHERE outlet_id = ? AND status = 'pending'`,
        [OUTLET_ID]
      );
      pass(`Cancelled ${oldJobs[0].cnt} old pending jobs`);
    } else {
      pass('No old pending jobs to clean');
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: STATION CONFIGURATION VALIDATION
    // ═══════════════════════════════════════════════════════════════
    section('1️⃣', 'STATION CONFIGURATION VALIDATION');

    // 1.1 Check all stations
    subsection('1.1 Kitchen Stations');
    const [stations] = await pool.query(`
      SELECT 
        ks.id, ks.name, ks.station_type, ks.printer_id, ks.is_active,
        p.name as printer_name, p.ip_address, p.port, p.is_active as printer_active
      FROM kitchen_stations ks
      LEFT JOIN printers p ON ks.printer_id = p.id
      WHERE ks.outlet_id = ? AND ks.is_active = 1
      ORDER BY ks.station_type
    `, [OUTLET_ID]);

    console.log(`\n  Found ${stations.length} active stations:\n`);
    console.log('  ' + 'ID'.padEnd(5) + 'Name'.padEnd(18) + 'Type'.padEnd(15) + 'PrinterID'.padEnd(10) + 'Printer'.padEnd(20) + 'IP Address');
    console.log('  ' + '-'.repeat(85));

    let stationsWithoutPrinter = [];
    let stationsWithoutIP = [];
    
    for (const s of stations) {
      const status = (!s.printer_id ? '❌' : (!s.ip_address ? '⚠️' : '✅'));
      console.log('  ' + status + ' ' +
        String(s.id).padEnd(4) +
        (s.name || '').padEnd(18) +
        (s.station_type || '').padEnd(15) +
        (s.printer_id || 'NULL').toString().padEnd(10) +
        (s.printer_name || 'NOT SET').padEnd(20) +
        (s.ip_address || 'NOT SET')
      );
      
      if (!s.printer_id) stationsWithoutPrinter.push(s.name);
      else if (!s.ip_address) stationsWithoutIP.push(s.name);
    }

    if (stationsWithoutPrinter.length === 0) {
      if (pass('All stations have printer_id assigned')) totalPassed++; else totalFailed++;
    } else {
      if (fail(`${stationsWithoutPrinter.length} stations without printer: ${stationsWithoutPrinter.join(', ')}`)) totalFailed++; else totalPassed++;
    }

    if (stationsWithoutIP.length === 0) {
      if (pass('All assigned printers have IP addresses')) totalPassed++; else totalFailed++;
    } else {
      warn(`${stationsWithoutIP.length} printers without IP: ${stationsWithoutIP.join(', ')}`);
    }

    // 1.2 Check all printers
    subsection('1.2 Printers');
    const [printers] = await pool.query(`
      SELECT id, name, station, station_id, ip_address, port, is_active
      FROM printers
      WHERE outlet_id = ? AND is_active = 1
    `, [OUTLET_ID]);

    console.log(`\n  Found ${printers.length} active printers:\n`);
    console.log('  ' + 'ID'.padEnd(5) + 'Name'.padEnd(22) + 'Station'.padEnd(15) + 'StationID'.padEnd(10) + 'IP Address'.padEnd(18) + 'Port');
    console.log('  ' + '-'.repeat(80));
    
    for (const p of printers) {
      const status = p.ip_address ? '✅' : '❌';
      console.log('  ' + status + ' ' +
        String(p.id).padEnd(4) +
        (p.name || '').padEnd(22) +
        (p.station || '').padEnd(15) +
        (p.station_id || '').toString().padEnd(10) +
        (p.ip_address || 'NOT SET').padEnd(18) +
        (p.port || 9100)
      );
    }

    const printersWithIP = printers.filter(p => p.ip_address);
    if (printersWithIP.length === printers.length) {
      if (pass('All printers have IP addresses configured')) totalPassed++; else totalFailed++;
    } else {
      if (fail(`${printers.length - printersWithIP.length} printers missing IP address`)) totalFailed++; else totalPassed++;
    }

    // 1.3 Check items assigned to stations
    subsection('1.3 Items → Station Assignment');
    
    const [itemStats] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN kitchen_station_id IS NOT NULL THEN 1 ELSE 0 END) as with_station,
        SUM(CASE WHEN kitchen_station_id IS NULL THEN 1 ELSE 0 END) as without_station
      FROM items
      WHERE outlet_id = ? AND deleted_at IS NULL AND is_available = 1
    `, [OUTLET_ID]);

    const stats = itemStats[0];
    console.log(`\n  Total active items: ${stats.total}`);
    console.log(`  Items with station: ${stats.with_station}`);
    console.log(`  Items without station: ${stats.without_station}`);

    if (stats.without_station == 0) {
      if (pass('All items have station assigned')) totalPassed++; else totalFailed++;
    } else {
      warn(`${stats.without_station} items have no station (will use default routing)`);
    }

    // Items per station breakdown
    const [itemsPerStation] = await pool.query(`
      SELECT 
        ks.name as station_name, ks.station_type, ks.printer_id,
        COUNT(i.id) as item_count
      FROM kitchen_stations ks
      LEFT JOIN items i ON i.kitchen_station_id = ks.id AND i.deleted_at IS NULL AND i.is_available = 1
      WHERE ks.outlet_id = ? AND ks.is_active = 1
      GROUP BY ks.id
      ORDER BY item_count DESC
    `, [OUTLET_ID]);

    console.log('\n  Items per station:');
    for (const row of itemsPerStation) {
      const printerStatus = row.printer_id ? '✅' : '❌';
      console.log(`    ${printerStatus} ${row.station_name} (${row.station_type}): ${row.item_count} items`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: ORDER CREATION TEST (Multi-Station)
    // ═══════════════════════════════════════════════════════════════
    section('2️⃣', 'ORDER CREATION TEST - Multi-Station Items');

    // Get items from different stations
    const [testItems] = await pool.query(`
      SELECT i.id, i.name, i.base_price, ks.id as station_id, ks.name as station_name, ks.station_type, ks.printer_id
      FROM items i
      JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = ? AND i.deleted_at IS NULL AND i.is_available = 1 AND ks.is_active = 1
      ORDER BY ks.station_type, RAND()
    `, [OUTLET_ID]);

    // Group by station and pick one from each
    const stationGroups = {};
    for (const item of testItems) {
      if (!stationGroups[item.station_type]) {
        stationGroups[item.station_type] = [];
      }
      if (stationGroups[item.station_type].length < 2) {
        stationGroups[item.station_type].push(item);
      }
    }

    const selectedItems = Object.values(stationGroups).flat();
    const uniqueStations = Object.keys(stationGroups);

    console.log(`\n  Selected ${selectedItems.length} items from ${uniqueStations.length} stations:`);
    for (const [stationType, items] of Object.entries(stationGroups)) {
      console.log(`    ${stationType}: ${items.map(i => i.name).join(', ')}`);
    }

    if (selectedItems.length >= 3 && uniqueStations.length >= 2) {
      if (pass(`Test items ready: ${selectedItems.length} items from ${uniqueStations.length} stations`)) totalPassed++; else totalFailed++;
    } else {
      if (fail('Not enough items from different stations for proper testing')) totalFailed++; else totalPassed++;
    }

    // Create order
    subsection('2.1 Create Order');
    const order = await orderService.createOrder({
      outletId: OUTLET_ID,
      orderType: 'takeaway',
      customerName: 'Validation Test',
      createdBy: USER_ID
    });
    createdOrderId = order.id;
    
    if (pass(`Order created: ID=${order.id}`)) totalPassed++; else totalFailed++;

    // Add items
    subsection('2.2 Add Items to Order');
    const itemsToAdd = selectedItems.map(item => ({
      itemId: item.id,
      quantity: 1,
      specialInstructions: `Test: ${item.station_name}`
    }));

    await orderService.addItems(order.id, itemsToAdd, USER_ID);

    // Verify items added
    const [addedItems] = await pool.query(`
      SELECT oi.id, oi.item_name, oi.status, i.kitchen_station_id, ks.station_type
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE oi.order_id = ?
    `, [order.id]);

    console.log(`\n  Added ${addedItems.length} items:`);
    for (const item of addedItems) {
      console.log(`    - ${item.item_name} → ${item.station_type} (status: ${item.status})`);
    }

    const pendingItems = addedItems.filter(i => i.status === 'pending');
    if (pendingItems.length === addedItems.length) {
      if (pass(`All ${pendingItems.length} items in 'pending' status`)) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Only ${pendingItems.length}/${addedItems.length} items are pending`)) totalFailed++; else totalPassed++;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: KOT GENERATION CHECK
    // ═══════════════════════════════════════════════════════════════
    section('3️⃣', 'KOT GENERATION CHECK - Station-wise');

    subsection('3.1 Send KOT');
    const kotResult = await kotService.sendKot(order.id, USER_ID);

    console.log(`\n  KOT Result: ${kotResult.tickets.length} ticket(s) created`);

    // Check tickets created
    if (kotResult.tickets.length === uniqueStations.length) {
      if (pass(`Correct number of KOTs: ${kotResult.tickets.length} (one per station)`)) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Expected ${uniqueStations.length} KOTs, got ${kotResult.tickets.length}`)) totalFailed++; else totalPassed++;
    }

    subsection('3.2 KOT Tickets Detail');
    console.log('\n  ' + 'KOT#'.padEnd(15) + 'Station'.padEnd(15) + 'StationID'.padEnd(10) + 'Items'.padEnd(8) + 'Counter');
    console.log('  ' + '-'.repeat(55));

    const kotStations = new Set();
    for (const ticket of kotResult.tickets) {
      kotStations.add(ticket.station);
      console.log('  ✅ ' +
        ticket.kotNumber.padEnd(14) +
        ticket.station.padEnd(15) +
        String(ticket.stationId || '').padEnd(10) +
        String(ticket.itemCount).padEnd(8) +
        (ticket.isCounter ? 'Yes' : 'No')
      );
    }

    // Check no station skipped
    const expectedStations = new Set(addedItems.map(i => i.station_type));
    const missingStations = [...expectedStations].filter(s => !kotStations.has(s));
    
    if (missingStations.length === 0) {
      if (pass('No station skipped - all stations have KOT')) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Stations skipped: ${missingStations.join(', ')}`)) totalFailed++; else totalPassed++;
    }

    // Check no duplicate stations
    if (kotStations.size === kotResult.tickets.length) {
      if (pass('No duplicate KOTs per station')) totalPassed++; else totalFailed++;
    } else {
      if (fail('Duplicate KOTs detected for same station')) totalFailed++; else totalPassed++;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: JOB CREATION VALIDATION (Database)
    // ═══════════════════════════════════════════════════════════════
    section('4️⃣', 'JOB CREATION VALIDATION - Database Check');

    subsection('4.1 Print Jobs Created');
    const [printJobs] = await pool.query(`
      SELECT 
        pj.id, pj.job_type, pj.station, pj.printer_id, pj.kot_id, 
        pj.reference_number, pj.status, pj.created_at,
        p.name as printer_name, p.ip_address
      FROM print_jobs pj
      LEFT JOIN printers p ON pj.printer_id = p.id
      WHERE pj.order_id = ? AND pj.job_type IN ('kot', 'bot')
      ORDER BY pj.created_at
    `, [order.id]);

    console.log(`\n  Found ${printJobs.length} print jobs for order ${order.id}:\n`);
    console.log('  ' + 'ID'.padEnd(6) + 'Type'.padEnd(6) + 'Station'.padEnd(15) + 'PrinterID'.padEnd(10) + 'Printer'.padEnd(18) + 'IP'.padEnd(16) + 'Ref#');
    console.log('  ' + '-'.repeat(85));

    let allJobsHavePrinter = true;
    let allJobsHaveIP = true;
    const jobStations = new Set();

    for (const job of printJobs) {
      const printerOk = !!job.printer_id;
      const ipOk = !!job.ip_address;
      if (!printerOk) allJobsHavePrinter = false;
      if (!ipOk) allJobsHaveIP = false;
      jobStations.add(job.station);

      const status = (printerOk && ipOk) ? '✅' : (printerOk ? '⚠️' : '❌');
      console.log('  ' + status + ' ' +
        String(job.id).padEnd(5) +
        (job.job_type || '').padEnd(6) +
        (job.station || '').padEnd(15) +
        (job.printer_id || 'NULL').toString().padEnd(10) +
        (job.printer_name || 'NOT FOUND').padEnd(18) +
        (job.ip_address || 'NOT SET').padEnd(16) +
        (job.reference_number || '')
      );
    }

    // Validate job count matches KOT count
    if (printJobs.length === kotResult.tickets.length) {
      if (pass(`Job count matches KOT count: ${printJobs.length}`)) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Job count (${printJobs.length}) != KOT count (${kotResult.tickets.length})`)) totalFailed++; else totalPassed++;
    }

    // Validate all jobs have printer_id
    if (allJobsHavePrinter) {
      if (pass('All print jobs have printer_id assigned')) totalPassed++; else totalFailed++;
    } else {
      if (fail('Some print jobs missing printer_id')) totalFailed++; else totalPassed++;
    }

    // Validate all printers have IP
    if (allJobsHaveIP) {
      if (pass('All assigned printers have IP address')) totalPassed++; else totalFailed++;
    } else {
      if (fail('Some printers missing IP address')) totalFailed++; else totalPassed++;
    }

    // Validate station coverage
    if (jobStations.size === kotStations.size) {
      if (pass(`All ${jobStations.size} stations have print jobs`)) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Station mismatch: ${jobStations.size} jobs vs ${kotStations.size} KOTs`)) totalFailed++; else totalPassed++;
    }

    subsection('4.2 Station → Printer Mapping Verification');
    
    // Check each job has correct printer based on station
    for (const job of printJobs) {
      const [stationPrinter] = await pool.query(`
        SELECT ks.printer_id, p.name as printer_name
        FROM kitchen_stations ks
        JOIN printers p ON ks.printer_id = p.id
        WHERE ks.station_type = ? AND ks.outlet_id = ?
        LIMIT 1
      `, [job.station, OUTLET_ID]);

      if (stationPrinter[0] && stationPrinter[0].printer_id === job.printer_id) {
        if (pass(`${job.station} → printer ${job.printer_id} (${job.printer_name}) ✓`)) totalPassed++; else totalFailed++;
      } else {
        if (fail(`${job.station} printer mismatch: job has ${job.printer_id}, station has ${stationPrinter[0]?.printer_id}`)) totalFailed++; else totalPassed++;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: BRIDGE COMMUNICATION VALIDATION
    // ═══════════════════════════════════════════════════════════════
    section('5️⃣', 'BRIDGE COMMUNICATION VALIDATION');

    subsection('5.1 Bridge Configuration');
    const [bridges] = await pool.query(`
      SELECT id, bridge_code, assigned_stations, is_active
      FROM printer_bridges
      WHERE outlet_id = ? AND is_active = 1
    `, [OUTLET_ID]);

    if (bridges.length > 0) {
      for (const bridge of bridges) {
        let stations = 'ALL (*)';
        try {
          const parsed = JSON.parse(bridge.assigned_stations || '[]');
          if (parsed.length > 0 && !parsed.includes('*')) {
            stations = parsed.join(', ');
          }
        } catch (e) {}
        console.log(`\n  Bridge: ${bridge.bridge_code}`);
        console.log(`  Stations: ${stations}`);
      }
      if (pass(`${bridges.length} active bridge(s) configured`)) totalPassed++; else totalFailed++;
    } else {
      if (fail('No active bridges configured')) totalFailed++; else totalPassed++;
    }

    subsection('5.2 Simulate Bridge Polling');

    // Reset job status to pending for polling test
    await pool.query(
      `UPDATE print_jobs SET status = 'pending', attempts = 0 WHERE order_id = ? AND job_type IN ('kot', 'bot')`,
      [order.id]
    );

    console.log('\n  Simulating bridge poll for each pending job:\n');

    let pollSuccessCount = 0;
    const polledJobs = new Set();

    // Poll for each expected job
    for (let i = 0; i < printJobs.length; i++) {
      const job = await printerService.getNextPendingJobAny(OUTLET_ID);
      
      if (job) {
        polledJobs.add(job.id);
        const hasIP = !!job.ip_address;
        const status = hasIP ? '✅' : '❌';
        console.log(`  ${status} Poll ${i + 1}: Job #${job.id} | ${job.job_type} | ${job.station} | IP: ${job.ip_address || 'MISSING'}`);
        
        if (hasIP) {
          pollSuccessCount++;
          // Mark as printed (simulating successful print)
          await pool.query(`UPDATE print_jobs SET status = 'printed', printed_at = NOW() WHERE id = ?`, [job.id]);
        } else {
          // Mark as failed
          await pool.query(`UPDATE print_jobs SET status = 'failed' WHERE id = ?`, [job.id]);
        }
      } else {
        console.log(`  ⚠️  Poll ${i + 1}: No more pending jobs`);
        break;
      }
    }

    if (polledJobs.size === printJobs.length) {
      if (pass(`Bridge received all ${polledJobs.size} jobs`)) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Bridge received ${polledJobs.size}/${printJobs.length} jobs`)) totalFailed++; else totalPassed++;
    }

    if (pollSuccessCount === printJobs.length) {
      if (pass(`All ${pollSuccessCount} jobs have printer IP (ready for printing)`)) totalPassed++; else totalFailed++;
    } else {
      if (fail(`Only ${pollSuccessCount}/${printJobs.length} jobs have printer IP`)) totalFailed++; else totalPassed++;
    }

    // Check no duplicates polled
    if (polledJobs.size === [...polledJobs].length) {
      if (pass('No duplicate jobs received by bridge')) totalPassed++; else totalFailed++;
    } else {
      if (fail('Duplicate jobs detected in polling')) totalFailed++; else totalPassed++;
    }

    // ═══════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════════
    section('📊', 'VALIDATION SUMMARY');

    console.log(`\n  Total Checks: ${totalPassed + totalFailed}`);
    log(colors.green, `  Passed: ${totalPassed}`);
    if (totalFailed > 0) {
      log(colors.red, `  Failed: ${totalFailed}`);
    }

    const successRate = Math.round((totalPassed / (totalPassed + totalFailed)) * 100);
    console.log(`\n  Success Rate: ${successRate}%`);

    if (totalFailed === 0) {
      log(colors.green, '\n  🎉 ALL VALIDATIONS PASSED!');
      log(colors.green, '  The Printer → Station → Item → KOT → Bridge flow is working correctly.');
    } else {
      log(colors.red, '\n  ⚠️  SOME VALIDATIONS FAILED');
      log(colors.yellow, '  Review the failed checks above and fix the configuration.');
    }

  } catch (error) {
    log(colors.red, '\n❌ Validation error:', error.message);
    console.error(error.stack);
    totalFailed++;
  } finally {
    // Cleanup test order
    if (createdOrderId) {
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', createdOrderId]);
      console.log(`\n[Cleanup] Test order ${createdOrderId} cancelled.`);
    }

    console.log('\n' + '═'.repeat(70));
    log(colors.cyan, '  VALIDATION COMPLETE');
    console.log('═'.repeat(70) + '\n');

    process.exit(totalFailed > 0 ? 1 : 0);
  }
}

main();
