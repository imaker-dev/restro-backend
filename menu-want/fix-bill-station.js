/**
 * Fix Bill Station 1 - update station_type to 'bill'
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

(async () => {
  try {
    await initializeDatabase();
    const pool = getPool();
    
    // Update station_type to 'bill'
    await pool.query(`UPDATE kitchen_stations SET station_type = 'bill' WHERE id = 54`);
    console.log('✅ Updated Bill Station 1 station_type to "bill"');
    
    // Verify the update
    const [result] = await pool.query(`SELECT id, name, station_type, printer_id, outlet_id FROM kitchen_stations WHERE id = 54`);
    console.log('Result:', result[0]);
    
    // Check if printer exists for this outlet
    const [printers] = await pool.query(`
      SELECT id, name, ip_address, port, station 
      FROM printers 
      WHERE outlet_id = ? AND is_active = 1
    `, [result[0].outlet_id]);
    
    console.log('\nAvailable printers for outlet:', printers);
    
    if (printers.length > 0 && !result[0].printer_id) {
      const billPrinter = printers.find(p => p.station === 'bill') || printers[0];
      await pool.query(`UPDATE kitchen_stations SET printer_id = ? WHERE id = 54`, [billPrinter.id]);
      console.log(`\n✅ Assigned printer "${billPrinter.name}" (id: ${billPrinter.id}) to Bill Station 1`);
    }
    
    // Final verification
    const [final] = await pool.query(`
      SELECT ks.id, ks.name, ks.station_type, ks.printer_id, 
             p.name as printer_name, p.ip_address
      FROM kitchen_stations ks
      LEFT JOIN printers p ON ks.printer_id = p.id
      WHERE ks.id = 54
    `);
    console.log('\nFinal Bill Station 1 config:', final[0]);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
})();
