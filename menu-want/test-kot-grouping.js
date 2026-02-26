/**
 * Test KOT Grouping by Station ID
 * Verifies that items from different physical stations get separate KOTs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testKotGrouping() {
  console.log('='.repeat(70));
  console.log('KOT GROUPING BY STATION ID TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const kotService = require('../src/services/kot.service');

    const outletId = 33;
    console.log(`\nTesting with outlet ID: ${outletId}`);

    // Check available stations
    console.log('\n--- 1. Available Kitchen Stations ---');
    const [stations] = await pool.query(
      `SELECT id, name, code, station_type FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1`,
      [outletId]
    );
    stations.forEach(s => console.log(`  ${s.id}: ${s.name} (type: ${s.station_type})`));

    // Create mock items from different stations (simulating order items)
    console.log('\n--- 2. Test groupItemsByStation with Multi-Station Items ---');
    
    // Get real items from different stations
    const [items] = await pool.query(`
      SELECT i.id, i.name as item_name, i.kitchen_station_id, 
        ks.station_type, ks.name as station_name, ks.id as ks_id,
        i.counter_id
      FROM items i
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = ? AND i.deleted_at IS NULL AND i.kitchen_station_id IS NOT NULL
      ORDER BY i.kitchen_station_id
      LIMIT 20
    `, [outletId]);

    if (items.length === 0) {
      console.log('No items with station assignment found');
      process.exit(0);
    }

    // Pick items from different stations
    const stationItems = {};
    for (const item of items) {
      if (!stationItems[item.kitchen_station_id]) {
        stationItems[item.kitchen_station_id] = item;
      }
    }
    
    const testItems = Object.values(stationItems).slice(0, 4);
    console.log(`\nSelected ${testItems.length} items from different stations:`);
    testItems.forEach(i => console.log(`  "${i.item_name}" → Station: ${i.station_name} (id: ${i.kitchen_station_id})`));

    // Test grouping
    console.log('\n--- 3. Group Items by Station ---');
    const grouped = kotService.groupItemsByStation(testItems);
    
    console.log(`\nGrouped into ${Object.keys(grouped).length} groups:`);
    for (const [groupKey, groupItems] of Object.entries(grouped)) {
      console.log(`\n  Group "${groupKey}":`);
      groupItems.forEach(i => {
        console.log(`    - ${i.item_name}`);
        console.log(`      _station: ${i._station}`);
        console.log(`      _stationId: ${i._stationId}`);
        console.log(`      _stationName: ${i._stationName}`);
      });
    }

    // Verify: Each unique station_id should have its own group
    const uniqueStationIds = [...new Set(testItems.map(i => i.kitchen_station_id))];
    const groupCount = Object.keys(grouped).length;
    
    console.log(`\n--- 4. Verification ---`);
    console.log(`  Unique station IDs: ${uniqueStationIds.length}`);
    console.log(`  Group count: ${groupCount}`);
    
    if (groupCount === uniqueStationIds.length) {
      console.log('\n  ✅ PASS: Items correctly grouped by station_id');
    } else {
      console.log('\n  ❌ FAIL: Grouping mismatch');
    }

    // Show what KOT numbers would be generated
    console.log('\n--- 5. KOT Number Generation ---');
    for (const [groupKey, groupItems] of Object.entries(grouped)) {
      const station = groupItems[0]._station;
      const kotNumber = await kotService.generateKotNumber(outletId, station);
      console.log(`  Group "${groupKey}" → ${kotNumber}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testKotGrouping();
