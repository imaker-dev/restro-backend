/**
 * Test floor-based bill printer routing
 * Verifies that bills print to the cashier's station printer based on floor
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testFloorBillRouting() {
  console.log('='.repeat(70));
  console.log('FLOOR-BASED BILL PRINTER ROUTING TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const billingService = require('../src/services/billing.service');

    // Test 1: Get bill printer without floor (should use outlet-level bill printer)
    console.log('\n--- 1. Test Outlet-Level Bill Printer ---');
    
    const [outlets] = await pool.query(`
      SELECT o.id, o.name 
      FROM outlets o 
      JOIN printers p ON o.id = p.outlet_id AND p.station = 'bill' AND p.is_active = 1
      LIMIT 1
    `);
    
    if (outlets.length > 0) {
      const outlet = outlets[0];
      const printer = await billingService.getBillPrinter(outlet.id, null);
      console.log(`Outlet: ${outlet.name} (id: ${outlet.id})`);
      console.log(`Bill printer (no floor): ${printer ? printer.name : 'None'} @ ${printer?.ip_address || 'N/A'}`);
    } else {
      console.log('No outlets with bill printers found');
    }

    // Test 2: Check if floor-based routing would work
    console.log('\n--- 2. Test Floor-Based Routing Setup ---');
    
    // Check for cashiers with bill station assignments and floor permissions
    const [cashierSetups] = await pool.query(`
      SELECT DISTINCT 
        u.id as user_id, u.name as user_name,
        uf.floor_id, f.name as floor_name, f.outlet_id,
        o.name as outlet_name,
        ks.id as station_id, ks.name as station_name, ks.station_type,
        p.id as printer_id, p.name as printer_name, p.ip_address
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
      JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
      JOIN user_floors uf ON u.id = uf.user_id AND uf.is_active = 1
      JOIN floors f ON uf.floor_id = f.id
      JOIN outlets o ON f.outlet_id = o.id
      LEFT JOIN user_stations us ON u.id = us.user_id AND us.outlet_id = uf.outlet_id AND us.is_active = 1
      LEFT JOIN kitchen_stations ks ON us.station_id = ks.id AND ks.is_active = 1
      LEFT JOIN printers p ON ks.printer_id = p.id AND p.is_active = 1
      WHERE u.deleted_at IS NULL
      LIMIT 10
    `);

    console.log(`Cashiers with floor + station setup: ${cashierSetups.length}`);
    for (const setup of cashierSetups) {
      console.log(`\n  Cashier: ${setup.user_name}`);
      console.log(`    Floor: ${setup.floor_name} (id: ${setup.floor_id})`);
      console.log(`    Outlet: ${setup.outlet_name}`);
      console.log(`    Station: ${setup.station_name || 'None'} (type: ${setup.station_type || 'N/A'})`);
      console.log(`    Printer: ${setup.printer_name || 'None'} @ ${setup.ip_address || 'N/A'}`);
      
      // Test getBillPrinter with this floor
      const printer = await billingService.getBillPrinter(setup.outlet_id, setup.floor_id);
      console.log(`    Resolved printer: ${printer ? printer.name : 'None'} @ ${printer?.ip_address || 'N/A'}`);
    }

    // Test 3: Verify bill station type requirement
    console.log('\n--- 3. Bill Station Type Check ---');
    
    const [billStations] = await pool.query(`
      SELECT ks.id, ks.name, ks.station_type, ks.outlet_id, o.name as outlet_name,
             p.name as printer_name, p.ip_address
      FROM kitchen_stations ks
      LEFT JOIN outlets o ON ks.outlet_id = o.id
      LEFT JOIN printers p ON ks.printer_id = p.id
      WHERE ks.station_type = 'bill' AND ks.is_active = 1
    `);
    
    console.log(`Kitchen stations with station_type='bill': ${billStations.length}`);
    if (billStations.length === 0) {
      console.log('\n⚠️  NO BILL STATIONS FOUND!');
      console.log('To enable floor-based bill routing:');
      console.log('1. Create a kitchen_station with station_type="bill"');
      console.log('2. Assign a printer to this station');
      console.log('3. Assign the station to a cashier via user_stations');
      console.log('4. Assign floor permissions to the cashier via user_floors');
    } else {
      billStations.forEach(s => {
        console.log(`  - ${s.name} @ ${s.outlet_name}: printer=${s.printer_name || 'None'}`);
      });
    }

    // Test 4: Show what's needed for full setup
    console.log('\n--- 4. Required Setup for Floor-Based Bill Routing ---');
    console.log(`
For floor-based bill routing to work, you need:

1. CREATE BILL STATION:
   INSERT INTO kitchen_stations (outlet_id, name, code, station_type, printer_id)
   VALUES (<outlet_id>, 'Cashier Station 1', 'CASH1', 'bill', <printer_id>);

2. ASSIGN STATION TO CASHIER:
   INSERT INTO user_stations (user_id, station_id, outlet_id, is_primary, assigned_by)
   VALUES (<cashier_user_id>, <station_id>, <outlet_id>, 1, <admin_user_id>);

3. ASSIGN FLOOR TO CASHIER:
   INSERT INTO user_floors (user_id, floor_id, outlet_id, is_primary, assigned_by)
   VALUES (<cashier_user_id>, <floor_id>, <outlet_id>, 1, <admin_user_id>);

4. When a bill is generated for an order on that floor:
   - System finds cashier with floor permission
   - Gets their bill station
   - Prints to that station's printer
`);

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testFloorBillRouting();
