/**
 * Test Kitchen Station Handling
 * Verifies station creation and item assignment in bulk upload
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restro_db'
};

console.log('DB Config:', { host: dbConfig.host, database: dbConfig.database });

async function testStationHandling() {
  const outletId = 34;
  
  console.log('='.repeat(60));
  console.log('KITCHEN STATION HANDLING TEST');
  console.log('='.repeat(60));
  console.log(`Outlet ID: ${outletId}\n`);

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // 1. Check existing kitchen stations for outlet
    console.log('--- 1. Existing Kitchen Stations ---');
    const [stations] = await connection.query(
      'SELECT id, name, code, station_type, is_active FROM kitchen_stations WHERE outlet_id = ?',
      [outletId]
    );
    console.log(`Found ${stations.length} stations:`);
    stations.forEach(s => {
      console.log(`  ID: ${s.id}, Name: "${s.name}", Code: ${s.code}, Type: ${s.station_type}, Active: ${s.is_active}`);
    });

    // 2. Check items with kitchen_station_id
    console.log('\n--- 2. Items with Kitchen Station Assigned ---');
    const [itemsWithStation] = await connection.query(
      `SELECT i.id, i.name, i.kitchen_station_id, ks.name as station_name 
       FROM items i 
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       WHERE i.outlet_id = ? AND i.deleted_at IS NULL
       LIMIT 20`,
      [outletId]
    );
    console.log(`Showing first 20 items:`);
    itemsWithStation.forEach(i => {
      console.log(`  Item ID: ${i.id}, Name: "${i.name}", Station ID: ${i.kitchen_station_id || 'NULL'}, Station: ${i.station_name || 'NONE'}`);
    });

    // 3. Check items WITHOUT kitchen_station_id
    console.log('\n--- 3. Items WITHOUT Kitchen Station ---');
    const [itemsNoStation] = await connection.query(
      `SELECT COUNT(*) as count FROM items WHERE outlet_id = ? AND deleted_at IS NULL AND kitchen_station_id IS NULL`,
      [outletId]
    );
    console.log(`Items without station: ${itemsNoStation[0].count}`);

    // 4. Check items WITH kitchen_station_id
    const [itemsYesStation] = await connection.query(
      `SELECT COUNT(*) as count FROM items WHERE outlet_id = ? AND deleted_at IS NULL AND kitchen_station_id IS NOT NULL`,
      [outletId]
    );
    console.log(`Items with station: ${itemsYesStation[0].count}`);

    // 5. Check item_kitchen_stations table (many-to-many mapping)
    console.log('\n--- 4. Item-Kitchen Station Mappings (item_kitchen_stations table) ---');
    const [mappings] = await connection.query(
      `SELECT iks.item_id, i.name as item_name, iks.kitchen_station_id, ks.name as station_name, iks.is_primary
       FROM item_kitchen_stations iks
       JOIN items i ON iks.item_id = i.id
       JOIN kitchen_stations ks ON iks.kitchen_station_id = ks.id
       WHERE i.outlet_id = ?
       LIMIT 20`,
      [outletId]
    );
    console.log(`Found ${mappings.length} mappings (showing first 20):`);
    mappings.forEach(m => {
      console.log(`  Item: "${m.item_name}" -> Station: "${m.station_name}" (Primary: ${m.is_primary})`);
    });

    // 6. Test item 165 specifically
    console.log('\n--- 5. Item ID 165 Details ---');
    const [item165] = await connection.query(
      `SELECT i.*, ks.name as station_name, ks.station_type
       FROM items i
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       WHERE i.id = 165`,
      []
    );
    if (item165.length > 0) {
      const item = item165[0];
      console.log(`Item 165: "${item.name}"`);
      console.log(`  kitchen_station_id: ${item.kitchen_station_id || 'NULL'}`);
      console.log(`  Station Name: ${item.station_name || 'NONE'}`);
      console.log(`  Station Type: ${item.station_type || 'N/A'}`);
      console.log(`  Outlet ID: ${item.outlet_id}`);
    } else {
      console.log('Item 165 not found');
    }

    // 7. Check items table schema for kitchen_station_id column
    console.log('\n--- 6. Items Table Schema (kitchen_station_id column) ---');
    const [columns] = await connection.query(
      `SHOW COLUMNS FROM items WHERE Field = 'kitchen_station_id'`
    );
    if (columns.length > 0) {
      console.log(`Column exists: ${JSON.stringify(columns[0])}`);
    } else {
      console.log('WARNING: kitchen_station_id column NOT FOUND in items table!');
    }

    // 7. Test updating item 165 kitchen_station_id
    console.log('\n--- 7. Test Updating Item 165 Kitchen Station ---');
    const newStationId = 36; // Bar station
    console.log(`Attempting to update item 165 to station ID: ${newStationId}`);
    
    const [updateResult] = await connection.query(
      'UPDATE items SET kitchen_station_id = ? WHERE id = 165',
      [newStationId]
    );
    console.log(`Update result: affectedRows = ${updateResult.affectedRows}, changedRows = ${updateResult.changedRows}`);
    
    // Verify the update
    const [item165After] = await connection.query(
      `SELECT i.id, i.name, i.kitchen_station_id, ks.name as station_name 
       FROM items i 
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       WHERE i.id = 165`
    );
    if (item165After.length > 0) {
      console.log(`After update - Item 165 kitchen_station_id: ${item165After[0].kitchen_station_id}, Station: ${item165After[0].station_name}`);
    }
    
    // Reset back to original
    await connection.query('UPDATE items SET kitchen_station_id = 33 WHERE id = 165');
    console.log('Reset item 165 back to Kitchen (station ID 33)');

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

testStationHandling();
