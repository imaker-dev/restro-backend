require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

(async () => {
  await initializeDatabase();
  const pool = getPool();
  
  // Check existing bill-related stations
  const [rows] = await pool.query(`
    SELECT id, name, station_type, outlet_id, printer_id 
    FROM kitchen_stations 
    WHERE name LIKE '%Bill%' OR name LIKE '%Cashier%' OR station_type = 'bill'
  `);
  console.log('Bill/Cashier stations:', JSON.stringify(rows, null, 2));
  
  // Check the Monday outlet station
  const [mondayStations] = await pool.query(`
    SELECT ks.*, o.name as outlet_name
    FROM kitchen_stations ks
    JOIN outlets o ON ks.outlet_id = o.id
    WHERE o.name LIKE '%Monday%'
  `);
  console.log('\nMonday outlet stations:', JSON.stringify(mondayStations, null, 2));
  
  process.exit(0);
})();
