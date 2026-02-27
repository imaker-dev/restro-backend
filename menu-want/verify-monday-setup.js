/**
 * Verify Monday outlet bill routing setup
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

(async () => {
  try {
    await initializeDatabase();
    const pool = getPool();
    
    const outletId = 42; // Monday outlet
    
    console.log('='.repeat(60));
    console.log('MONDAY OUTLET BILL ROUTING VERIFICATION');
    console.log('='.repeat(60));
    
    // 1. Get outlet info
    const [outlets] = await pool.query(`SELECT id, name FROM outlets WHERE id = ?`, [outletId]);
    console.log('\n1. OUTLET:', outlets[0]);
    
    // 2. Get floors
    const [floors] = await pool.query(`SELECT id, name FROM floors WHERE outlet_id = ? AND is_active = 1`, [outletId]);
    console.log('\n2. FLOORS:', floors);
    
    // 3. Get Bill Station
    const [stations] = await pool.query(`
      SELECT ks.*, p.name as printer_name, p.ip_address 
      FROM kitchen_stations ks 
      LEFT JOIN printers p ON ks.printer_id = p.id
      WHERE ks.outlet_id = ? AND ks.station_type = 'bill'
    `, [outletId]);
    console.log('\n3. BILL STATION:', stations[0] || 'NONE');
    
    // 4. Get cashiers for this outlet
    const [cashiers] = await pool.query(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id AND ur.outlet_id = ? AND ur.is_active = 1
      JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
      WHERE u.deleted_at IS NULL
    `, [outletId]);
    console.log('\n4. CASHIERS:', cashiers);
    
    // 5. Check cashier station assignments
    for (const cashier of cashiers) {
      const [userStations] = await pool.query(`
        SELECT us.*, ks.name as station_name, ks.station_type
        FROM user_stations us
        JOIN kitchen_stations ks ON us.station_id = ks.id
        WHERE us.user_id = ? AND us.outlet_id = ? AND us.is_active = 1
      `, [cashier.id, outletId]);
      console.log(`\n5. CASHIER "${cashier.name}" STATIONS:`, userStations.length > 0 ? userStations : 'NONE');
      
      const [userFloors] = await pool.query(`
        SELECT uf.*, f.name as floor_name
        FROM user_floors uf
        JOIN floors f ON uf.floor_id = f.id
        WHERE uf.user_id = ? AND uf.outlet_id = ? AND uf.is_active = 1
      `, [cashier.id, outletId]);
      console.log(`   CASHIER "${cashier.name}" FLOORS:`, userFloors.length > 0 ? userFloors : 'NONE');
    }
    
    // 6. If cashier has no station, assign Bill Station 1
    if (cashiers.length > 0 && stations.length > 0) {
      const cashier = cashiers[0];
      const station = stations[0];
      
      const [existing] = await pool.query(`
        SELECT * FROM user_stations 
        WHERE user_id = ? AND station_id = ? AND outlet_id = ?
      `, [cashier.id, station.id, outletId]);
      
      if (existing.length === 0) {
        await pool.query(`
          INSERT INTO user_stations (user_id, station_id, outlet_id, is_primary, is_active, assigned_by)
          VALUES (?, ?, ?, 1, 1, 1)
        `, [cashier.id, station.id, outletId]);
        console.log(`\n✅ Assigned "${station.name}" to cashier "${cashier.name}"`);
      } else {
        console.log(`\n✅ Cashier "${cashier.name}" already assigned to station`);
      }
      
      // Also ensure cashier has floor assignment
      if (floors.length > 0) {
        const floor = floors[0];
        const [existingFloor] = await pool.query(`
          SELECT * FROM user_floors 
          WHERE user_id = ? AND floor_id = ? AND outlet_id = ?
        `, [cashier.id, floor.id, outletId]);
        
        if (existingFloor.length === 0) {
          await pool.query(`
            INSERT INTO user_floors (user_id, floor_id, outlet_id, is_primary, is_active, assigned_by)
            VALUES (?, ?, ?, 1, 1, 1)
          `, [cashier.id, floor.id, outletId]);
          console.log(`✅ Assigned floor "${floor.name}" to cashier "${cashier.name}"`);
        } else {
          console.log(`✅ Cashier "${cashier.name}" already assigned to floor "${floor.name}"`);
        }
      }
    }
    
    // 7. Test getBillPrinter
    console.log('\n' + '─'.repeat(60));
    console.log('TESTING getBillPrinter()');
    console.log('─'.repeat(60));
    
    const billingService = require('../src/services/billing.service');
    
    for (const floor of floors) {
      const printer = await billingService.getBillPrinter(outletId, floor.id);
      console.log(`\nFloor: ${floor.name} (id: ${floor.id})`);
      if (printer) {
        console.log(`  → Printer: ${printer.name} @ ${printer.ip_address}:${printer.port || 9100}`);
      } else {
        console.log(`  → No printer found!`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  process.exit(0);
})();
