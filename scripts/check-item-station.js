/**
 * Diagnostic script to check item station configuration
 * Run: node scripts/check-item-station.js "Budweiser"
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('../src/database');

async function checkItemStation(searchTerm) {
  try {
    await initializeDatabase();
    const pool = getPool();
    
    console.log(`\n🔍 Searching for items matching: "${searchTerm}"\n`);
    
    const [items] = await pool.query(
      `SELECT 
        i.id, i.name as item_name, i.item_type,
        i.kitchen_station_id, i.counter_id,
        ks.station_type, ks.name as kitchen_station_name,
        c.counter_type, c.name as counter_name
       FROM items i
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       LEFT JOIN counters c ON i.counter_id = c.id
       WHERE i.name LIKE ?
       LIMIT 10`,
      [`%${searchTerm}%`]
    );
    
    if (items.length === 0) {
      console.log('❌ No items found');
      process.exit(1);
    }
    
    console.log('📋 Item Configuration:\n');
    console.log('─'.repeat(80));
    
    for (const item of items) {
      console.log(`Item: ${item.item_name} (ID: ${item.id})`);
      console.log(`  Type: ${item.item_type || 'not set'}`);
      console.log(`  Kitchen Station ID: ${item.kitchen_station_id || 'NULL'}`);
      console.log(`    → Station Type: ${item.station_type || 'N/A'}`);
      console.log(`    → Station Name: ${item.kitchen_station_name || 'N/A'}`);
      console.log(`  Counter ID: ${item.counter_id || 'NULL'}`);
      console.log(`    → Counter Type: ${item.counter_type || 'N/A'}`);
      console.log(`    → Counter Name: ${item.counter_name || 'N/A'}`);
      
      // Routing determination
      let routing = 'KITCHEN (default)';
      let routingStation = 'kitchen';
      let stationNameLower = '';
      if (item.counter_id) {
        routing = `BAR/COUNTER → ${item.counter_name || item.counter_type}`;
        routingStation = item.counter_name || item.counter_type;
        stationNameLower = (routingStation || '').toLowerCase();
      } else if (item.kitchen_station_id) {
        routing = `KITCHEN → ${item.kitchen_station_name || item.station_type}`;
        routingStation = item.kitchen_station_name || item.station_type;
        stationNameLower = (routingStation || '').toLowerCase();
      }
      
      // BOT detection: counter OR station type/name contains 'bar'
      const stationTypeLower = (item.station_type || '').toLowerCase();
      const isBarOrder = item.counter_id || 
        stationTypeLower === 'bar' || stationTypeLower.includes('bar') ||
        stationNameLower === 'bar' || stationNameLower.includes('bar');
      const orderType = isBarOrder ? 'BOT' : 'KOT';
      
      console.log(`  🎯 KOT Routing: ${routing}`);
      console.log(`     Print Header: "${routingStation?.toUpperCase() || 'KITCHEN'} ORDER (${orderType})"`);
      console.log('─'.repeat(80));
    }
    
    // Show available counters for bar items
    console.log('\n📌 Available Counters (for bar/liquor items):');
    const [counters] = await pool.query(
      `SELECT id, name, counter_type FROM counters WHERE is_active = 1 ORDER BY name`
    );
    if (counters.length === 0) {
      console.log('   ⚠️  No active counters found! Create a bar counter first.');
    } else {
      for (const c of counters) {
        console.log(`   - ID: ${c.id}, Name: "${c.name}", Type: ${c.counter_type}`);
      }
    }
    
    // Show available kitchen stations
    console.log('\n📌 Available Kitchen Stations:');
    const [stations] = await pool.query(
      `SELECT id, name, station_type FROM kitchen_stations WHERE is_active = 1 ORDER BY name`
    );
    if (stations.length === 0) {
      console.log('   ⚠️  No active kitchen stations found!');
    } else {
      for (const s of stations) {
        console.log(`   - ID: ${s.id}, Name: "${s.name}", Type: ${s.station_type}`);
      }
    }
    
    console.log('\n✅ To fix routing, update the item:');
    console.log('   UPDATE items SET counter_id = <counter_id> WHERE id = <item_id>;');
    console.log('   -- OR --');
    console.log('   UPDATE items SET kitchen_station_id = <station_id> WHERE id = <item_id>;\n');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const searchTerm = process.argv[2] || 'Budweiser';
checkItemStation(searchTerm);
