/**
 * Test Station Handling in Bulk Upload
 * Verifies station exists/create logic works correctly
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testStationBulkUpload() {
  const outletId = 34;
  
  console.log('='.repeat(70));
  console.log('STATION BULK UPLOAD TEST');
  console.log('='.repeat(70));
  console.log(`Outlet ID: ${outletId}\n`);

  try {
    await initializeDatabase();
    const pool = getPool();
    const bulkUploadService = require('../src/services/bulkUpload.service');

    // Check existing stations
    console.log('--- 1. Existing Stations ---');
    const [existingStations] = await pool.query(
      'SELECT id, name, code FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1',
      [outletId]
    );
    console.log(`Found ${existingStations.length} stations:`);
    existingStations.forEach(s => console.log(`  ${s.id}: ${s.name} (${s.code})`));

    const stationCountBefore = existingStations.length;

    // Test: Upload item with existing station name (should NOT create new)
    console.log('\n--- 2. Test Upload with Existing Station ---');
    if (existingStations.length > 0) {
      const existingStation = existingStations[0];
      const testRecords1 = [
        { 
          Type: 'ITEM', 
          Name: 'Test Item Station Check', 
          Category: 'Chinese Non Veg Starter',
          Price: '100', 
          ItemType: 'veg', 
          Station: existingStation.name,  // Use existing station name
          ServiceType: 'restaurant'
        }
      ];
      
      const result1 = await bulkUploadService.processRecords(testRecords1, outletId, 1);
      console.log('Result:', JSON.stringify(result1, null, 2));
      
      // Check station count after
      const [stationsAfter1] = await pool.query(
        'SELECT id, name FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1',
        [outletId]
      );
      console.log(`Stations after: ${stationsAfter1.length} (was ${stationCountBefore})`);
      
      if (stationsAfter1.length === stationCountBefore) {
        console.log('✅ No duplicate station created!');
      } else {
        console.log('❌ Duplicate station was created!');
      }
      
      // Clean up test item
      await pool.query('DELETE FROM items WHERE name = ? AND outlet_id = ?', ['Test Item Station Check', outletId]);
    }

    // Test: Upload item with NEW station name (should create new)
    console.log('\n--- 3. Test Upload with New Station ---');
    const newStationName = `TestStation_${Date.now()}`;
    const testRecords2 = [
      { 
        Type: 'ITEM', 
        Name: 'Test Item New Station', 
        Category: 'Chinese Non Veg Starter',
        Price: '100', 
        ItemType: 'veg', 
        Station: newStationName,  // New station name
        ServiceType: 'restaurant'
      }
    ];
    
    const result2 = await bulkUploadService.processRecords(testRecords2, outletId, 1);
    console.log('Result:', JSON.stringify(result2, null, 2));
    
    // Check station count after
    const [stationsAfter2] = await pool.query(
      'SELECT id, name FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1',
      [outletId]
    );
    console.log(`Stations after: ${stationsAfter2.length} (was ${stationCountBefore})`);
    
    if (stationsAfter2.length === stationCountBefore + 1) {
      console.log('✅ New station was created correctly!');
    } else {
      console.log('❌ Station creation issue!');
    }
    
    // Clean up
    await pool.query('DELETE FROM items WHERE name = ? AND outlet_id = ?', ['Test Item New Station', outletId]);
    await pool.query('DELETE FROM kitchen_stations WHERE name = ? AND outlet_id = ?', [newStationName, outletId]);
    console.log('Cleaned up test data');

    // Test: Upload same item twice with station (should skip, not create duplicate station)
    console.log('\n--- 4. Test Re-upload Same Item with Station ---');
    const testRecords3 = [
      { 
        Type: 'ITEM', 
        Name: 'Chilli Chicken Dry',  // Existing item
        Category: 'Chinese Non Veg Starter',
        Price: '319', 
        ItemType: 'non_veg', 
        Station: 'Kitchen',  // Existing station
        ServiceType: 'restaurant'
      }
    ];
    
    const result3 = await bulkUploadService.processRecords(testRecords3, outletId, 1);
    console.log('Result:', JSON.stringify(result3, null, 2));
    
    // Verify no duplicate stations
    const [stationsAfter3] = await pool.query(
      'SELECT name, COUNT(*) as cnt FROM kitchen_stations WHERE outlet_id = ? GROUP BY name HAVING cnt > 1',
      [outletId]
    );
    
    if (stationsAfter3.length === 0) {
      console.log('✅ No duplicate stations found!');
    } else {
      console.log('❌ Duplicate stations found:', stationsAfter3);
    }

    console.log('\n' + '='.repeat(70));
    console.log('STATION TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testStationBulkUpload();
