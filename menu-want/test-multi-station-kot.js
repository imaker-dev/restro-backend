/**
 * Test Multi-Station KOT Socket Emission
 * Verifies that KOTs with items from multiple stations emit correctly
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testMultiStationKot() {
  console.log('='.repeat(70));
  console.log('MULTI-STATION KOT TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const kotService = require('../src/services/kot.service');

    // Find an outlet with multiple stations
    const [outlets] = await pool.query(`
      SELECT DISTINCT outlet_id FROM kitchen_stations WHERE is_active = 1 LIMIT 1
    `);
    
    if (outlets.length === 0) {
      console.log('No outlets with kitchen stations found');
      process.exit(0);
    }
    
    const outletId = outlets[0].outlet_id;
    console.log(`\nTesting with outlet ID: ${outletId}`);

    // Check available stations
    console.log('\n--- 1. Available Kitchen Stations ---');
    const [stations] = await pool.query(
      `SELECT id, name, code, station_type FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1`,
      [outletId]
    );
    stations.forEach(s => console.log(`  ${s.id}: ${s.name} (${s.station_type})`));

    // Check items per station
    console.log('\n--- 2. Items per Station ---');
    const [itemsByStation] = await pool.query(`
      SELECT ks.name as station_name, ks.id as station_id, ks.station_type, COUNT(i.id) as item_count
      FROM kitchen_stations ks
      LEFT JOIN items i ON i.kitchen_station_id = ks.id AND i.deleted_at IS NULL
      WHERE ks.outlet_id = ? AND ks.is_active = 1
      GROUP BY ks.id
    `, [outletId]);
    itemsByStation.forEach(s => console.log(`  ${s.station_name} (${s.station_type}): ${s.item_count} items`));

    // Find a recent order with pending items from different stations
    console.log('\n--- 3. Finding Order with Multi-Station Items ---');
    const [ordersWithMixedItems] = await pool.query(`
      SELECT o.id, o.order_number, o.outlet_id,
        COUNT(DISTINCT oi.id) as item_count,
        COUNT(DISTINCT i.kitchen_station_id) as station_count,
        GROUP_CONCAT(DISTINCT ks.station_type) as stations
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id AND oi.status = 'pending'
      JOIN items i ON oi.item_id = i.id
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE o.outlet_id = ? AND o.status IN ('pending', 'confirmed')
      GROUP BY o.id
      HAVING station_count > 1
      LIMIT 5
    `, [outletId]);

    if (ordersWithMixedItems.length === 0) {
      console.log('No orders with multi-station pending items found');
      
      // Check for any pending order
      const [anyOrder] = await pool.query(`
        SELECT o.id, o.order_number, o.outlet_id,
          COUNT(DISTINCT oi.id) as item_count,
          COUNT(DISTINCT i.kitchen_station_id) as station_count
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id AND oi.status = 'pending'
        JOIN items i ON oi.item_id = i.id
        WHERE o.outlet_id = ? AND o.status IN ('pending', 'confirmed')
        GROUP BY o.id
        LIMIT 1
      `, [outletId]);
      
      if (anyOrder.length > 0) {
        console.log(`\nFound single-station order: ${anyOrder[0].order_number} (${anyOrder[0].item_count} items)`);
      }
    } else {
      console.log('Orders with multi-station items:');
      ordersWithMixedItems.forEach(o => {
        console.log(`  Order ${o.order_number}: ${o.item_count} items across ${o.station_count} stations (${o.stations})`);
      });
    }

    // Test groupItemsByStation with sample items
    console.log('\n--- 4. Test groupItemsByStation Logic ---');
    
    // Get some items with different stations
    const [sampleItems] = await pool.query(`
      SELECT i.id, i.name as item_name, i.kitchen_station_id, 
        ks.station_type, ks.name as station_name, ks.id as ks_id,
        i.counter_id
      FROM items i
      LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
      WHERE i.outlet_id = ? AND i.deleted_at IS NULL AND i.kitchen_station_id IS NOT NULL
      LIMIT 10
    `, [outletId]);
    
    if (sampleItems.length > 0) {
      const grouped = kotService.groupItemsByStation(sampleItems);
      console.log('Grouping result:');
      for (const [station, items] of Object.entries(grouped)) {
        console.log(`  ${station}: ${items.length} items`);
        items.forEach(i => console.log(`    - ${i.item_name} (stationId: ${i._stationId})`));
      }
    }

    // Check recent KOT tickets to verify station data
    console.log('\n--- 5. Recent KOT Tickets ---');
    const [recentKots] = await pool.query(`
      SELECT kt.id, kt.kot_number, kt.station, kt.station_id, kt.status, kt.created_at,
        ks.name as station_name, ks.station_type
      FROM kot_tickets kt
      LEFT JOIN kitchen_stations ks ON kt.station_id = ks.id
      WHERE kt.outlet_id = ?
      ORDER BY kt.created_at DESC
      LIMIT 10
    `, [outletId]);
    
    console.log('Recent KOTs:');
    recentKots.forEach(k => {
      console.log(`  ${k.kot_number}: station="${k.station}", station_id=${k.station_id}, station_name="${k.station_name || 'NULL'}"`);
    });

    // Check if station_id is being saved correctly
    console.log('\n--- 6. KOTs with NULL station_id ---');
    const [nullStationKots] = await pool.query(`
      SELECT kt.id, kt.kot_number, kt.station, kt.station_id, kt.created_at
      FROM kot_tickets kt
      WHERE kt.outlet_id = ? AND kt.station_id IS NULL
      ORDER BY kt.created_at DESC
      LIMIT 5
    `, [outletId]);
    
    if (nullStationKots.length > 0) {
      console.log('KOTs with NULL station_id (may cause socket issues):');
      nullStationKots.forEach(k => console.log(`  ${k.kot_number}: station="${k.station}"`));
    } else {
      console.log('All recent KOTs have station_id set correctly');
    }

    // Test getKotById and verify station data
    if (recentKots.length > 0) {
      console.log('\n--- 7. Test getKotById Format ---');
      const testKot = await kotService.getKotById(recentKots[0].id);
      console.log('Formatted KOT:');
      console.log(`  id: ${testKot.id}`);
      console.log(`  kotNumber: ${testKot.kotNumber}`);
      console.log(`  station: ${testKot.station}`);
      console.log(`  stationId: ${testKot.stationId}`);
      console.log(`  itemCount: ${testKot.itemCount}`);
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

testMultiStationKot();
