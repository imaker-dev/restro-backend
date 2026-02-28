/**
 * Test: Printer Configuration Diagnostic
 * Checks:
 * 1. Printer table configuration
 * 2. Station mapping for KOT printing
 * 3. Bill printer floor-based routing
 * 4. Print job queue status
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testPrinterConfig() {
  console.log('='.repeat(80));
  console.log('PRINTER CONFIGURATION DIAGNOSTIC');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Get an outlet to test
    const [outlets] = await pool.query('SELECT id, name FROM outlets WHERE is_active = 1 LIMIT 1');
    if (outlets.length === 0) {
      console.log('❌ No active outlets found');
      process.exit(1);
    }
    const outletId = outlets[0].id;
    console.log(`\nTesting outlet: ${outlets[0].name} (ID: ${outletId})`);

    // 1. Check all printers for this outlet
    console.log('\n--- 1. All Printers for Outlet ---');
    const [printers] = await pool.query(
      `SELECT id, name, station, station_id, printer_type, ip_address, port, is_active, is_online
       FROM printers WHERE outlet_id = ? ORDER BY station, name`,
      [outletId]
    );
    
    if (printers.length === 0) {
      console.log('❌ No printers configured for this outlet!');
    } else {
      console.log(`Found ${printers.length} printers:`);
      for (const p of printers) {
        const status = p.is_active ? (p.is_online ? '🟢' : '🟡') : '🔴';
        console.log(`  ${status} ${p.name}: station="${p.station}", type=${p.printer_type}, IP=${p.ip_address}:${p.port}`);
      }
    }

    // 2. Check KOT station mapping
    console.log('\n--- 2. KOT Station Mapping Check ---');
    const kotService = require('../src/services/kot.service');
    
    const stationTypes = ['kitchen', 'bar', 'dessert', 'mocktail'];
    for (const station of stationTypes) {
      const printer = await kotService.getPrinterForStation(outletId, station);
      if (printer) {
        console.log(`  ✅ Station "${station}" → Printer: ${printer.name} (${printer.ip_address}:${printer.port})`);
      } else {
        console.log(`  ❌ Station "${station}" → No printer found!`);
      }
    }

    // 3. Check kitchen stations configuration
    console.log('\n--- 3. Kitchen Stations Configuration ---');
    const [kitchenStations] = await pool.query(
      `SELECT ks.id, ks.name, ks.station_type, ks.printer_id, p.name as printer_name, p.ip_address
       FROM kitchen_stations ks
       LEFT JOIN printers p ON ks.printer_id = p.id
       WHERE ks.outlet_id = ? AND ks.is_active = 1`,
      [outletId]
    );
    
    if (kitchenStations.length === 0) {
      console.log('  ❌ No kitchen stations configured!');
    } else {
      for (const ks of kitchenStations) {
        const hasPrinter = ks.printer_id ? `✅ ${ks.printer_name} (${ks.ip_address})` : '❌ No printer assigned';
        console.log(`  ${ks.name} (type: ${ks.station_type}): ${hasPrinter}`);
      }
    }

    // 4. Check floor-based bill printer routing
    console.log('\n--- 4. Floor-Based Bill Printer Routing ---');
    const billingService = require('../src/services/billing.service');
    
    const [floors] = await pool.query(
      'SELECT id, name FROM floors WHERE outlet_id = ? AND is_active = 1',
      [outletId]
    );
    
    for (const floor of floors) {
      const printer = await billingService.getBillPrinter(outletId, floor.id);
      if (printer) {
        console.log(`  ✅ Floor "${floor.name}" → Bill Printer: ${printer.name} (${printer.ip_address}:${printer.port})`);
      } else {
        console.log(`  ❌ Floor "${floor.name}" → No bill printer found!`);
      }
    }

    // 5. Check cashier-floor-station assignments for bill printing
    console.log('\n--- 5. Cashier Bill Station Assignments ---');
    const [cashierStations] = await pool.query(
      `SELECT u.name as cashier_name, f.name as floor_name, ks.name as station_name, 
              ks.station_type, p.name as printer_name, p.ip_address
       FROM user_floors uf
       JOIN users u ON uf.user_id = u.id
       JOIN floors f ON uf.floor_id = f.id
       JOIN user_roles ur ON uf.user_id = ur.user_id AND ur.outlet_id = uf.outlet_id AND ur.is_active = 1
       JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
       LEFT JOIN user_stations us ON uf.user_id = us.user_id AND us.outlet_id = uf.outlet_id AND us.is_active = 1
       LEFT JOIN kitchen_stations ks ON us.station_id = ks.id AND ks.is_active = 1
       LEFT JOIN printers p ON ks.printer_id = p.id AND p.is_active = 1
       WHERE uf.outlet_id = ? AND uf.is_active = 1`,
      [outletId]
    );
    
    if (cashierStations.length === 0) {
      console.log('  ❌ No cashier floor/station assignments found!');
      console.log('  → This means floor-based bill routing will not work.');
    } else {
      for (const cs of cashierStations) {
        const stationInfo = cs.station_name ? `${cs.station_name} (${cs.station_type})` : 'No station';
        const printerInfo = cs.printer_name ? `${cs.printer_name} (${cs.ip_address})` : 'No printer';
        console.log(`  ${cs.cashier_name} → Floor: ${cs.floor_name}, Station: ${stationInfo}, Printer: ${printerInfo}`);
      }
    }

    // 6. Check pending print jobs
    console.log('\n--- 6. Pending Print Jobs ---');
    const [pendingJobs] = await pool.query(
      `SELECT station, job_type, COUNT(*) as count, MIN(created_at) as oldest
       FROM print_jobs 
       WHERE outlet_id = ? AND status = 'pending'
       GROUP BY station, job_type`,
      [outletId]
    );
    
    if (pendingJobs.length === 0) {
      console.log('  ✅ No pending print jobs');
    } else {
      console.log('  ⚠️ Pending jobs (may indicate print issues):');
      for (const job of pendingJobs) {
        console.log(`    ${job.station}/${job.job_type}: ${job.count} jobs (oldest: ${job.oldest})`);
      }
    }

    // 7. Check printer bridge configuration
    console.log('\n--- 7. Printer Bridge Configuration ---');
    const [bridges] = await pool.query(
      `SELECT id, bridge_code, name, assigned_stations, is_active, last_poll_at
       FROM printer_bridges WHERE outlet_id = ?`,
      [outletId]
    );
    
    if (bridges.length === 0) {
      console.log('  ❌ No printer bridges configured!');
      console.log('  → Print jobs will only work with direct TCP printing.');
    } else {
      for (const bridge of bridges) {
        const stations = bridge.assigned_stations ? JSON.parse(bridge.assigned_stations) : [];
        const status = bridge.is_active ? '🟢' : '🔴';
        console.log(`  ${status} ${bridge.name} (${bridge.bridge_code}): stations=${stations.join(', ')}`);
        console.log(`     Last poll: ${bridge.last_poll_at || 'Never'}`);
      }
    }

    // 8. Test printer connectivity
    console.log('\n--- 8. Printer Connectivity Test ---');
    const printerService = require('../src/services/printer.service');
    
    for (const p of printers.filter(pr => pr.is_active && pr.ip_address)) {
      const result = await printerService.testPrinterConnection(p.ip_address, p.port || 9100);
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} ${p.name} (${p.ip_address}:${p.port || 9100}): ${result.message}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nDiagnostic error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testPrinterConfig();
