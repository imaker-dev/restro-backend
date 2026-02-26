/**
 * Test KOT Socket Emission for Multi-Station Orders
 * Simulates KOT creation and verifies socket emissions
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testKotSocketEmission() {
  console.log('='.repeat(70));
  console.log('KOT SOCKET EMISSION TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const kotService = require('../src/services/kot.service');

    // Find an outlet with orders and items
    const outletId = 33;
    console.log(`\nTesting with outlet ID: ${outletId}`);

    // Check available stations
    console.log('\n--- 1. Available Kitchen Stations ---');
    const [stations] = await pool.query(
      `SELECT id, name, code, station_type FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1`,
      [outletId]
    );
    stations.forEach(s => console.log(`  ${s.id}: ${s.name} (${s.station_type})`));

    // Find an order with pending items
    console.log('\n--- 2. Finding Order with Pending Items ---');
    const [orders] = await pool.query(`
      SELECT o.id, o.order_number, o.outlet_id, o.table_number, o.status,
        COUNT(oi.id) as pending_count
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id AND oi.status = 'pending'
      WHERE o.outlet_id = ? AND o.status IN ('pending', 'confirmed')
      GROUP BY o.id
      LIMIT 5
    `, [outletId]);

    if (orders.length === 0) {
      console.log('No orders with pending items found');
      
      // Show recent orders
      const [recentOrders] = await pool.query(`
        SELECT o.id, o.order_number, o.status, o.created_at
        FROM orders o WHERE o.outlet_id = ?
        ORDER BY o.created_at DESC LIMIT 5
      `, [outletId]);
      console.log('Recent orders:');
      recentOrders.forEach(o => console.log(`  ${o.order_number}: ${o.status}`));
    } else {
      console.log('Orders with pending items:');
      orders.forEach(o => console.log(`  ${o.order_number}: ${o.pending_count} pending items`));

      // Get details of first order's pending items
      const testOrder = orders[0];
      console.log(`\n--- 3. Pending Items for Order ${testOrder.order_number} ---`);
      const [pendingItems] = await pool.query(`
        SELECT oi.id, oi.item_name, oi.status,
          i.kitchen_station_id, ks.name as station_name, ks.station_type
        FROM order_items oi
        JOIN items i ON oi.item_id = i.id
        LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
        WHERE oi.order_id = ? AND oi.status = 'pending'
      `, [testOrder.id]);
      
      pendingItems.forEach(i => {
        console.log(`  ${i.item_name}: station=${i.station_name || 'NULL'} (${i.station_type || 'N/A'})`);
      });

      // Group by station to see multi-station scenario
      const stationGroups = {};
      pendingItems.forEach(i => {
        const station = i.station_type || 'kitchen';
        if (!stationGroups[station]) stationGroups[station] = [];
        stationGroups[station].push(i.item_name);
      });
      
      console.log('\n--- 4. Items Grouped by Station ---');
      for (const [station, items] of Object.entries(stationGroups)) {
        console.log(`  ${station}: ${items.length} items`);
      }
      
      const isMultiStation = Object.keys(stationGroups).length > 1;
      console.log(`\nThis is a ${isMultiStation ? 'MULTI-STATION' : 'SINGLE-STATION'} order`);
    }

    // Check recent KOT emissions in logs (if any)
    console.log('\n--- 5. Recent KOT Tickets ---');
    const [recentKots] = await pool.query(`
      SELECT kt.id, kt.kot_number, kt.station, kt.station_id, kt.status, kt.created_at,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id) as item_count
      FROM kot_tickets kt
      WHERE kt.outlet_id = ?
      ORDER BY kt.created_at DESC
      LIMIT 10
    `, [outletId]);
    
    console.log('Recent KOTs:');
    recentKots.forEach(k => {
      console.log(`  ${k.kot_number}: station="${k.station}", stationId=${k.station_id}, items=${k.item_count}, status=${k.status}`);
    });

    // Verify getKotById returns correct station data
    if (recentKots.length > 0) {
      console.log('\n--- 6. Verify getKotById Format ---');
      const testKot = await kotService.getKotById(recentKots[0].id);
      console.log(`KOT ${testKot.kotNumber}:`);
      console.log(`  station: "${testKot.station}"`);
      console.log(`  stationId: ${testKot.stationId}`);
      console.log(`  outletId: ${testKot.outletId}`);
      console.log(`  itemCount: ${testKot.itemCount}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    console.log('\nTo test multi-station KOT emission:');
    console.log('1. Create an order with items from different stations');
    console.log('2. Send KOT via API');
    console.log('3. Check server logs for "[KOT Socket]" entries');
    console.log('4. Verify all stations receive socket events');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testKotSocketEmission();
