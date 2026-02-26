/**
 * Check current bill printing flow and station assignments
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function checkBillPrintFlow() {
  console.log('='.repeat(70));
  console.log('BILL PRINTING FLOW ANALYSIS');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();

    // 1. Check station types
    console.log('\n--- 1. Kitchen Station Types ---');
    const [stationTypes] = await pool.query('SELECT DISTINCT station_type FROM kitchen_stations');
    console.log('Station types:', stationTypes.map(s => s.station_type).join(', '));

    // 2. Check printer stations
    console.log('\n--- 2. Printer Station Types ---');
    const [printerStations] = await pool.query('SELECT DISTINCT station FROM printers WHERE station IS NOT NULL');
    console.log('Printer stations:', printerStations.map(p => p.station).join(', '));

    // 3. Check bill printers
    console.log('\n--- 3. Bill Printers ---');
    const [billPrinters] = await pool.query(`
      SELECT p.id, p.name, p.ip_address, p.port, p.outlet_id, o.name as outlet_name
      FROM printers p
      LEFT JOIN outlets o ON p.outlet_id = o.id
      WHERE p.station = 'bill' AND p.is_active = 1
    `);
    console.log('Bill printers found:', billPrinters.length);
    billPrinters.forEach(p => console.log(`  - ${p.name} @ ${p.outlet_name} (${p.ip_address}:${p.port})`));

    // 4. Check user station assignments
    console.log('\n--- 4. User Station Assignments ---');
    const [userStations] = await pool.query(`
      SELECT us.user_id, u.name as user_name, u.email,
             ks.id as station_id, ks.name as station_name, ks.station_type,
             ks.printer_id, p.name as printer_name, p.ip_address,
             us.outlet_id, o.name as outlet_name
      FROM user_stations us
      JOIN users u ON us.user_id = u.id
      JOIN kitchen_stations ks ON us.station_id = ks.id
      LEFT JOIN printers p ON ks.printer_id = p.id
      LEFT JOIN outlets o ON us.outlet_id = o.id
      WHERE us.is_active = 1
      ORDER BY o.name, u.name
      LIMIT 20
    `);
    console.log('User station assignments:', userStations.length);
    userStations.forEach(us => {
      console.log(`  - ${us.user_name} (${us.email})`);
      console.log(`    Station: ${us.station_name} (${us.station_type})`);
      console.log(`    Printer: ${us.printer_name || 'None'} @ ${us.ip_address || 'N/A'}`);
      console.log(`    Outlet: ${us.outlet_name}`);
    });

    // 5. Check user floor assignments
    console.log('\n--- 5. User Floor Assignments ---');
    const [userFloors] = await pool.query(`
      SELECT uf.user_id, u.name as user_name, u.email,
             uf.floor_id, f.name as floor_name,
             uf.outlet_id, o.name as outlet_name,
             uf.is_primary
      FROM user_floors uf
      JOIN users u ON uf.user_id = u.id
      JOIN floors f ON uf.floor_id = f.id
      LEFT JOIN outlets o ON uf.outlet_id = o.id
      WHERE uf.is_active = 1
      ORDER BY o.name, u.name
      LIMIT 20
    `);
    console.log('User floor assignments:', userFloors.length);
    userFloors.forEach(uf => {
      console.log(`  - ${uf.user_name}: Floor ${uf.floor_name} @ ${uf.outlet_name} ${uf.is_primary ? '(PRIMARY)' : ''}`);
    });

    // 6. Check if there are cashiers with both station and floor assignments
    console.log('\n--- 6. Cashiers with Station + Floor Assignments ---');
    const [cashiersWithBoth] = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.email,
             r.slug as role,
             ks.name as station_name, ks.station_type,
             p.name as printer_name, p.ip_address,
             GROUP_CONCAT(DISTINCT f.name) as floors
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN user_stations us ON u.id = us.user_id AND us.is_active = 1
      LEFT JOIN kitchen_stations ks ON us.station_id = ks.id
      LEFT JOIN printers p ON ks.printer_id = p.id
      LEFT JOIN user_floors uf ON u.id = uf.user_id AND uf.is_active = 1
      LEFT JOIN floors f ON uf.floor_id = f.id
      WHERE r.slug IN ('cashier', 'captain') AND u.deleted_at IS NULL
      GROUP BY u.id, ks.id
      LIMIT 20
    `);
    console.log('Cashiers/Captains with assignments:', cashiersWithBoth.length);
    cashiersWithBoth.forEach(c => {
      console.log(`  - ${c.name} (${c.role})`);
      console.log(`    Station: ${c.station_name || 'None'} (${c.station_type || 'N/A'})`);
      console.log(`    Printer: ${c.printer_name || 'None'} @ ${c.ip_address || 'N/A'}`);
      console.log(`    Floors: ${c.floors || 'None'}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

checkBillPrintFlow();
