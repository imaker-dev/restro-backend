/**
 * Complete test for floor-based bill printer routing
 * This test verifies the entire flow and shows current setup status
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testCompleteBillRouting() {
  console.log('='.repeat(70));
  console.log('COMPLETE BILL PRINTER ROUTING TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const billingService = require('../src/services/billing.service');

    // ============================================
    // STEP 1: Check current setup status
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 1: CURRENT SETUP STATUS');
    console.log('─'.repeat(70));

    // Get all floors with their bill routing status
    const [floorStatus] = await pool.query(`
      SELECT 
        f.id as floor_id,
        f.name as floor_name,
        o.id as outlet_id,
        o.name as outlet_name,
        u.id as cashier_id,
        u.name as cashier_name,
        ks.id as station_id,
        ks.name as station_name,
        ks.station_type,
        p.id as printer_id,
        p.name as printer_name,
        p.ip_address as printer_ip,
        p.port as printer_port,
        CASE 
          WHEN p.id IS NOT NULL AND ks.station_type = 'bill' THEN '✅ READY'
          WHEN ks.id IS NOT NULL AND ks.station_type != 'bill' THEN '❌ station_type must be "bill"'
          WHEN ks.id IS NOT NULL AND p.id IS NULL THEN '❌ No printer assigned to station'
          WHEN u.id IS NOT NULL AND ks.id IS NULL THEN '❌ Cashier has no station'
          ELSE '❌ No cashier assigned to floor'
        END as status
      FROM floors f
      JOIN outlets o ON f.outlet_id = o.id AND o.is_active = 1
      LEFT JOIN user_floors uf ON f.id = uf.floor_id AND uf.is_active = 1
      LEFT JOIN users u ON uf.user_id = u.id AND u.deleted_at IS NULL
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.outlet_id = o.id AND ur.is_active = 1
      LEFT JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
      LEFT JOIN user_stations us ON u.id = us.user_id AND us.outlet_id = o.id AND us.is_active = 1
      LEFT JOIN kitchen_stations ks ON us.station_id = ks.id AND ks.is_active = 1
      LEFT JOIN printers p ON ks.printer_id = p.id AND p.is_active = 1
      WHERE f.is_active = 1 AND r.id IS NOT NULL
      ORDER BY o.name, f.name
      LIMIT 20
    `);

    console.log('\nFloor → Cashier → Station → Printer mapping:\n');
    
    if (floorStatus.length === 0) {
      console.log('  No floors with cashier assignments found.');
    } else {
      for (const row of floorStatus) {
        console.log(`  ${row.outlet_name} > ${row.floor_name}`);
        console.log(`    Cashier: ${row.cashier_name || 'None'}`);
        console.log(`    Station: ${row.station_name || 'None'} (type: ${row.station_type || 'N/A'})`);
        console.log(`    Printer: ${row.printer_name || 'None'} @ ${row.printer_ip || 'N/A'}:${row.printer_port || 9100}`);
        console.log(`    Status: ${row.status}`);
        console.log();
      }
    }

    // ============================================
    // STEP 2: Test getBillPrinter for each outlet/floor
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 2: TEST getBillPrinter() FUNCTION');
    console.log('─'.repeat(70));

    const [testFloors] = await pool.query(`
      SELECT DISTINCT f.id as floor_id, f.name as floor_name, f.outlet_id, o.name as outlet_name
      FROM floors f
      JOIN outlets o ON f.outlet_id = o.id AND o.is_active = 1
      WHERE f.is_active = 1
      ORDER BY o.name, f.name
      LIMIT 10
    `);

    console.log('\nTesting printer resolution for each floor:\n');
    
    for (const floor of testFloors) {
      const printer = await billingService.getBillPrinter(floor.outlet_id, floor.floor_id);
      console.log(`  ${floor.outlet_name} > ${floor.floor_name} (floor_id: ${floor.floor_id})`);
      if (printer) {
        console.log(`    → Printer: ${printer.name} @ ${printer.ip_address}:${printer.port || 9100}`);
        console.log(`    → Source: ${printer.station === 'bill' ? 'Outlet-level bill printer' : 'Fallback printer'}`);
      } else {
        console.log(`    → No printer found!`);
      }
      console.log();
    }

    // ============================================
    // STEP 3: Show what's missing
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 3: MISSING CONFIGURATIONS');
    console.log('─'.repeat(70));

    // Check for bill stations
    const [billStations] = await pool.query(`
      SELECT ks.id, ks.name, ks.station_type, ks.printer_id, ks.outlet_id, o.name as outlet_name
      FROM kitchen_stations ks
      JOIN outlets o ON ks.outlet_id = o.id
      WHERE ks.station_type = 'bill' AND ks.is_active = 1
    `);

    console.log(`\nBill Stations (station_type='bill'): ${billStations.length}`);
    if (billStations.length === 0) {
      console.log('  ⚠️  No bill stations found! Floor-based routing won\'t work.');
      console.log('  Fix: Update existing station or create new one with station_type="bill"');
    } else {
      billStations.forEach(s => {
        console.log(`  ✅ ${s.name} @ ${s.outlet_name} (printer_id: ${s.printer_id || 'NONE'})`);
      });
    }

    // Check stations that should be bill type
    const [potentialBillStations] = await pool.query(`
      SELECT ks.id, ks.name, ks.station_type, ks.outlet_id, o.name as outlet_name
      FROM kitchen_stations ks
      JOIN outlets o ON ks.outlet_id = o.id
      WHERE (ks.name LIKE '%bill%' OR ks.name LIKE '%cashier%' OR ks.name LIKE '%cash%')
        AND ks.station_type != 'bill'
        AND ks.is_active = 1
    `);

    if (potentialBillStations.length > 0) {
      console.log(`\n⚠️  Stations that should probably have station_type='bill':`);
      potentialBillStations.forEach(s => {
        console.log(`  - ${s.name} (id: ${s.id}, current type: ${s.station_type})`);
        console.log(`    Fix: UPDATE kitchen_stations SET station_type = 'bill' WHERE id = ${s.id};`);
      });
    }

    // ============================================
    // STEP 4: Generate fix SQL
    // ============================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 4: FIX SQL (if needed)');
    console.log('─'.repeat(70));

    // Get stations that need station_type update
    const [stationsToFix] = await pool.query(`
      SELECT ks.id, ks.name, ks.outlet_id
      FROM kitchen_stations ks
      WHERE (ks.name LIKE '%bill%' OR ks.name LIKE '%cashier%')
        AND ks.station_type != 'bill'
        AND ks.is_active = 1
    `);

    if (stationsToFix.length > 0) {
      console.log('\n-- Run these SQL commands to fix station_type:');
      stationsToFix.forEach(s => {
        console.log(`UPDATE kitchen_stations SET station_type = 'bill' WHERE id = ${s.id}; -- ${s.name}`);
      });
    }

    // Get stations without printers
    const [stationsWithoutPrinter] = await pool.query(`
      SELECT ks.id, ks.name, ks.outlet_id, o.name as outlet_name
      FROM kitchen_stations ks
      JOIN outlets o ON ks.outlet_id = o.id
      WHERE ks.station_type = 'bill' AND ks.printer_id IS NULL AND ks.is_active = 1
    `);

    if (stationsWithoutPrinter.length > 0) {
      console.log('\n-- These bill stations need printers assigned:');
      stationsWithoutPrinter.forEach(s => {
        console.log(`-- ${s.name} @ ${s.outlet_name}`);
        console.log(`-- First create printer, then: UPDATE kitchen_stations SET printer_id = <printer_id> WHERE id = ${s.id};`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    console.log('\nSee /docs/BILL_PRINTER_ROUTING.md for full documentation');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testCompleteBillRouting();
