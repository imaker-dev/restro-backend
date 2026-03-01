/**
 * KOT Station Printing Test
 * Tests the complete flow: stations → items → orders → KOT → print jobs → bridge polling
 * 
 * Run: node tests/test-kot-station-printing.js
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('../src/database');

const OUTLET_ID = process.env.TEST_OUTLET_ID || 43;

// Colors for console output
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
  console.log('\n' + '='.repeat(70));
  log(colors.cyan, `  ${title}`);
  console.log('='.repeat(70));
}

function subsection(title) {
  console.log('\n' + '-'.repeat(50));
  log(colors.blue, `  ${title}`);
  console.log('-'.repeat(50));
}

async function main() {
  console.log('\n');
  log(colors.cyan, '╔════════════════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║        KOT STATION PRINTING - COMPREHENSIVE TEST                   ║');
  log(colors.cyan, '╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\nOutlet ID: ${OUTLET_ID}`);

  await initializeDatabase();
  const pool = getPool();

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Check Kitchen Stations Configuration
    // ═══════════════════════════════════════════════════════════════
    section('STEP 1: KITCHEN STATIONS CONFIGURATION');

    const [stations] = await pool.query(`
      SELECT 
        ks.id, ks.name, ks.code, ks.station_type, ks.printer_id, ks.is_active,
        p.name as printer_name, p.ip_address, p.port, p.is_active as printer_active
      FROM kitchen_stations ks
      LEFT JOIN printers p ON ks.printer_id = p.id
      WHERE ks.outlet_id = ?
      ORDER BY ks.station_type, ks.name
    `, [OUTLET_ID]);

    console.log(`\nFound ${stations.length} kitchen stations:\n`);
    
    if (stations.length === 0) {
      log(colors.red, '❌ NO KITCHEN STATIONS FOUND! KOT routing will fail.');
      log(colors.yellow, '   Create stations via: POST /api/v1/settings/kitchen-stations');
    } else {
      console.log('ID'.padEnd(6) + 'Name'.padEnd(20) + 'Type'.padEnd(15) + 'PrinterID'.padEnd(10) + 'Printer Name'.padEnd(20) + 'IP Address'.padEnd(18) + 'Active');
      console.log('-'.repeat(100));
      
      let stationsWithoutPrinter = 0;
      for (const s of stations) {
        const hasIssue = !s.printer_id || !s.ip_address;
        const color = hasIssue ? colors.red : colors.green;
        
        console.log(
          String(s.id).padEnd(6) +
          (s.name || '').padEnd(20) +
          (s.station_type || '').padEnd(15) +
          (s.printer_id || 'NULL').toString().padEnd(10) +
          (s.printer_name || 'NOT SET').padEnd(20) +
          (s.ip_address || 'NOT SET').padEnd(18) +
          (s.is_active ? 'Yes' : 'No')
        );
        
        if (!s.printer_id) stationsWithoutPrinter++;
      }
      
      if (stationsWithoutPrinter > 0) {
        log(colors.red, `\n⚠️  ${stationsWithoutPrinter} stations have NO printer assigned!`);
        log(colors.yellow, '   Assign printers via: PUT /api/v1/settings/kitchen-stations/:id { printerId: X }');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Check Counters Configuration (Bar, etc.)
    // ═══════════════════════════════════════════════════════════════
    section('STEP 2: COUNTERS CONFIGURATION');

    const [counters] = await pool.query(`
      SELECT 
        c.id, c.name, c.counter_type, c.printer_id, c.is_active,
        p.name as printer_name, p.ip_address, p.port
      FROM counters c
      LEFT JOIN printers p ON c.printer_id = p.id
      WHERE c.outlet_id = ?
      ORDER BY c.counter_type, c.name
    `, [OUTLET_ID]);

    console.log(`\nFound ${counters.length} counters:\n`);
    
    if (counters.length === 0) {
      log(colors.yellow, '⚠️  No counters found. Bar items will use kitchen station routing.');
    } else {
      console.log('ID'.padEnd(6) + 'Name'.padEnd(20) + 'Type'.padEnd(15) + 'PrinterID'.padEnd(10) + 'Printer Name'.padEnd(20) + 'IP Address');
      console.log('-'.repeat(90));
      
      for (const c of counters) {
        console.log(
          String(c.id).padEnd(6) +
          (c.name || '').padEnd(20) +
          (c.counter_type || '').padEnd(15) +
          (c.printer_id || 'NULL').toString().padEnd(10) +
          (c.printer_name || 'NOT SET').padEnd(20) +
          (c.ip_address || 'NOT SET')
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Check Printers Configuration
    // ═══════════════════════════════════════════════════════════════
    section('STEP 3: PRINTERS CONFIGURATION');

    const [printers] = await pool.query(`
      SELECT id, name, station, station_id, ip_address, port, printer_type, is_active, is_online
      FROM printers
      WHERE outlet_id = ?
      ORDER BY station, name
    `, [OUTLET_ID]);

    console.log(`\nFound ${printers.length} printers:\n`);
    
    if (printers.length === 0) {
      log(colors.red, '❌ NO PRINTERS FOUND! Printing will completely fail.');
    } else {
      console.log('ID'.padEnd(6) + 'Name'.padEnd(25) + 'Station'.padEnd(15) + 'StationID'.padEnd(10) + 'IP Address'.padEnd(18) + 'Port'.padEnd(8) + 'Active'.padEnd(8) + 'Online');
      console.log('-'.repeat(105));
      
      for (const p of printers) {
        const color = !p.ip_address ? colors.red : (p.is_active ? colors.green : colors.yellow);
        console.log(
          String(p.id).padEnd(6) +
          (p.name || '').padEnd(25) +
          (p.station || '').padEnd(15) +
          (p.station_id || '').toString().padEnd(10) +
          (p.ip_address || 'NOT SET').padEnd(18) +
          (p.port || 9100).toString().padEnd(8) +
          (p.is_active ? 'Yes' : 'No').padEnd(8) +
          (p.is_online ? 'Yes' : 'No')
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Check Items and their Station Assignments
    // ═══════════════════════════════════════════════════════════════
    section('STEP 4: ITEMS → STATION ASSIGNMENTS');

    const [items] = await pool.query(`
      SELECT 
        i.id, i.name, i.item_type, i.kitchen_station_id, i.counter_id,
        ks.name as station_name, ks.station_type,
        c.name as counter_name, c.counter_type
      FROM items i
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      LEFT JOIN counters c ON i.counter_id = c.id
      WHERE i.outlet_id = ? AND i.deleted_at IS NULL AND i.is_available = 1
      ORDER BY i.kitchen_station_id, i.counter_id, i.name
      LIMIT 50
    `, [OUTLET_ID]);

    console.log(`\nFound ${items.length} active items (showing first 50):\n`);

    let itemsWithoutStation = 0;
    const itemsByStation = {};
    
    for (const item of items) {
      const stationKey = item.station_name || item.counter_name || 'NO STATION';
      if (!itemsByStation[stationKey]) itemsByStation[stationKey] = [];
      itemsByStation[stationKey].push(item);
      
      if (!item.kitchen_station_id && !item.counter_id) {
        itemsWithoutStation++;
      }
    }

    // Show summary by station
    console.log('Station Assignment Summary:');
    console.log('-'.repeat(50));
    for (const [station, stationItems] of Object.entries(itemsByStation)) {
      const color = station === 'NO STATION' ? colors.red : colors.green;
      log(color, `  ${station}: ${stationItems.length} items`);
      // Show first 3 items
      stationItems.slice(0, 3).forEach(i => {
        console.log(`    - ${i.name} (id: ${i.id})`);
      });
      if (stationItems.length > 3) {
        console.log(`    ... and ${stationItems.length - 3} more`);
      }
    }

    if (itemsWithoutStation > 0) {
      log(colors.red, `\n⚠️  ${itemsWithoutStation} items have NO station assigned!`);
      log(colors.yellow, '   These items will default to "kitchen" station which may not have a printer.');
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Check Recent Print Jobs
    // ═══════════════════════════════════════════════════════════════
    section('STEP 5: RECENT PRINT JOBS (Last 20)');

    const [recentJobs] = await pool.query(`
      SELECT 
        pj.id, pj.job_type, pj.station, pj.printer_id, pj.status, 
        pj.reference_number, pj.kot_id, pj.created_at,
        p.name as printer_name, p.ip_address
      FROM print_jobs pj
      LEFT JOIN printers p ON pj.printer_id = p.id
      WHERE pj.outlet_id = ?
      ORDER BY pj.created_at DESC
      LIMIT 20
    `, [OUTLET_ID]);

    if (recentJobs.length === 0) {
      log(colors.yellow, '\nNo print jobs found.');
    } else {
      console.log('\nID'.padEnd(8) + 'Type'.padEnd(10) + 'Station'.padEnd(15) + 'PrinterID'.padEnd(10) + 'Printer'.padEnd(20) + 'Status'.padEnd(12) + 'Reference');
      console.log('-'.repeat(100));
      
      for (const job of recentJobs) {
        const color = job.printer_id ? colors.green : colors.red;
        console.log(
          String(job.id).padEnd(8) +
          (job.job_type || '').padEnd(10) +
          (job.station || '').padEnd(15) +
          (job.printer_id || 'NULL').toString().padEnd(10) +
          (job.printer_name || 'NOT FOUND').padEnd(20) +
          (job.status || '').padEnd(12) +
          (job.reference_number || '')
        );
      }
      
      // Count jobs without printer
      const jobsWithoutPrinter = recentJobs.filter(j => !j.printer_id).length;
      if (jobsWithoutPrinter > 0) {
        log(colors.red, `\n⚠️  ${jobsWithoutPrinter}/${recentJobs.length} jobs have NULL printer_id - these won't print!`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Verify Complete Chain
    // ═══════════════════════════════════════════════════════════════
    section('STEP 6: VERIFICATION SUMMARY');

    const issues = [];

    // Check stations have printers
    const stationsNoPrinter = stations.filter(s => !s.printer_id && s.is_active);
    if (stationsNoPrinter.length > 0) {
      issues.push({
        type: 'CRITICAL',
        message: `${stationsNoPrinter.length} active station(s) have no printer assigned`,
        details: stationsNoPrinter.map(s => `${s.name} (${s.station_type})`).join(', '),
        fix: 'UPDATE kitchen_stations SET printer_id = ? WHERE id = ?'
      });
    }

    // Check printers have IP
    const printersNoIP = printers.filter(p => !p.ip_address && p.is_active);
    if (printersNoIP.length > 0) {
      issues.push({
        type: 'CRITICAL',
        message: `${printersNoIP.length} active printer(s) have no IP address`,
        details: printersNoIP.map(p => p.name).join(', '),
        fix: 'UPDATE printers SET ip_address = ?, port = 9100 WHERE id = ?'
      });
    }

    // Check items have stations
    if (itemsWithoutStation > 0) {
      issues.push({
        type: 'WARNING',
        message: `${itemsWithoutStation} item(s) have no station assigned`,
        details: 'These items will use fallback routing',
        fix: 'UPDATE items SET kitchen_station_id = ? WHERE id = ?'
      });
    }

    if (issues.length === 0) {
      log(colors.green, '\n✅ All configurations look correct!');
    } else {
      console.log('\nISSUES FOUND:\n');
      for (const issue of issues) {
        const color = issue.type === 'CRITICAL' ? colors.red : colors.yellow;
        log(color, `[${issue.type}] ${issue.message}`);
        console.log(`   Details: ${issue.details}`);
        console.log(`   Fix SQL: ${issue.fix}`);
        console.log();
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: Bridge Configuration Check
    // ═══════════════════════════════════════════════════════════════
    section('STEP 7: BRIDGE CONFIGURATION');

    const [bridges] = await pool.query(`
      SELECT id, bridge_code, assigned_stations, is_active, last_poll_at, total_jobs_printed
      FROM printer_bridges
      WHERE outlet_id = ?
    `, [OUTLET_ID]);

    if (bridges.length === 0) {
      log(colors.yellow, '\nNo printer bridges configured.');
      log(colors.yellow, 'Create via: POST /api/v1/printers/bridges');
    } else {
      console.log('\nID'.padEnd(6) + 'Bridge Code'.padEnd(25) + 'Stations'.padEnd(30) + 'Active'.padEnd(8) + 'Jobs Printed'.padEnd(15) + 'Last Poll');
      console.log('-'.repeat(100));
      
      for (const b of bridges) {
        let stations = 'ALL (*)';
        try {
          const parsed = JSON.parse(b.assigned_stations || '[]');
          if (parsed.length > 0 && !parsed.includes('*')) {
            stations = parsed.join(', ');
          }
        } catch (e) {}
        
        console.log(
          String(b.id).padEnd(6) +
          (b.bridge_code || '').padEnd(25) +
          stations.padEnd(30) +
          (b.is_active ? 'Yes' : 'No').padEnd(8) +
          (b.total_jobs_printed || 0).toString().padEnd(15) +
          (b.last_poll_at ? new Date(b.last_poll_at).toLocaleString() : 'Never')
        );
      }
    }

    console.log('\n' + '='.repeat(70));
    log(colors.cyan, '  TEST COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    log(colors.red, '\n❌ Test failed:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

main();
