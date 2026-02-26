/**
 * Test Item Station Detail
 * Verify station info in item details API
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testItemStationDetail() {
  console.log('='.repeat(70));
  console.log('ITEM STATION DETAIL TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const itemService = require('../src/services/item.service');

    // Find an item with kitchen_station_id set
    const [itemsWithStation] = await pool.query(`
      SELECT i.id, i.name, i.kitchen_station_id, ks.name as station_name, ks.code as station_code
      FROM items i
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.kitchen_station_id IS NOT NULL AND i.deleted_at IS NULL
      LIMIT 5
    `);
    
    console.log('\n--- Items with kitchen_station_id set in DB ---');
    console.log(itemsWithStation);

    if (itemsWithStation.length > 0) {
      const testItem = itemsWithStation[0];
      console.log(`\n--- Testing getById for item ${testItem.id} (${testItem.name}) ---`);
      
      const byId = await itemService.getById(testItem.id);
      console.log('getById result station fields:');
      console.log('  kitchen_station_id:', byId.kitchen_station_id);
      console.log('  kitchen_station_name:', byId.kitchen_station_name);
      console.log('  kitchen_station_code:', byId.kitchen_station_code);

      console.log(`\n--- Testing getFullDetails for item ${testItem.id} ---`);
      const fullDetails = await itemService.getFullDetails(testItem.id);
      console.log('getFullDetails result station fields:');
      console.log('  kitchen_station_id:', fullDetails.kitchen_station_id);
      console.log('  kitchen_station_name:', fullDetails.kitchen_station_name);
      console.log('  kitchen_station_code:', fullDetails.kitchen_station_code);
      console.log('  kitchenStations array:', fullDetails.kitchenStations);
      
      // Check item_kitchen_stations mapping table
      const [mappings] = await pool.query(
        `SELECT * FROM item_kitchen_stations WHERE item_id = ?`, [testItem.id]
      );
      console.log('\n--- item_kitchen_stations mappings for this item ---');
      console.log(mappings);
    }

    // Check outlet 33 items
    console.log('\n--- Outlet 33 Items with Stations ---');
    const [outlet33Items] = await pool.query(`
      SELECT i.id, i.name, i.kitchen_station_id, ks.name as station_name
      FROM items i
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = 33 AND i.kitchen_station_id IS NOT NULL AND i.deleted_at IS NULL
      LIMIT 10
    `);
    console.log(`Found ${outlet33Items.length} items with station in outlet 33`);
    outlet33Items.forEach(i => console.log(`  ${i.id}: ${i.name} -> Station: ${i.station_name || 'NULL'}`));

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testItemStationDetail();
