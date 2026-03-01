/**
 * Fix station configuration for proper KOT routing
 */
require('dotenv').config();
const { initializeDatabase, getPool } = require('../src/database');

async function main() {
  await initializeDatabase();
  const pool = getPool();

  console.log('Fixing station_type values...\n');

  // Fix station types
  await pool.query("UPDATE kitchen_stations SET station_type = 'bar' WHERE id = 58");
  await pool.query("UPDATE kitchen_stations SET station_type = 'dessert' WHERE id = 56");
  await pool.query("UPDATE kitchen_stations SET station_type = 'main_kitchen' WHERE id = 55");
  await pool.query("UPDATE kitchen_stations SET station_type = 'tandoor' WHERE id = 57");

  // Check updated stations
  const [stations] = await pool.query('SELECT id, name, station_type, printer_id FROM kitchen_stations WHERE outlet_id = 43');
  console.log('Updated kitchen_stations:');
  console.table(stations);

  // Assign some items to different stations for testing
  console.log('\nAssigning test items to different stations...');
  
  // Get some items to distribute across stations
  const [items] = await pool.query(`
    SELECT id, name FROM items 
    WHERE outlet_id = 43 AND deleted_at IS NULL AND is_available = 1 
    LIMIT 20
  `);

  if (items.length >= 8) {
    // Assign first 5 items to Kitchen (id=55)
    await pool.query('UPDATE items SET kitchen_station_id = 55 WHERE id IN (?, ?, ?, ?, ?)', 
      [items[0].id, items[1].id, items[2].id, items[3].id, items[4].id]);
    
    // Assign next 2 items to Bar (id=58)
    await pool.query('UPDATE items SET kitchen_station_id = 58 WHERE id IN (?, ?)', 
      [items[5].id, items[6].id]);
    
    // Assign 1 item to Tandoor (id=57)
    await pool.query('UPDATE items SET kitchen_station_id = 57 WHERE id = ?', [items[7].id]);

    console.log(`  - Items ${items[0].id}-${items[4].id} → Kitchen (station 55)`);
    console.log(`  - Items ${items[5].id}, ${items[6].id} → Bar (station 58)`);
    console.log(`  - Item ${items[7].id} → Tandoor (station 57)`);
  }

  // Verify item assignments
  const [itemCheck] = await pool.query(`
    SELECT i.id, i.name, ks.name as station_name, ks.station_type, ks.printer_id
    FROM items i
    LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
    WHERE i.outlet_id = 43 AND i.deleted_at IS NULL
    ORDER BY ks.station_type, i.id
    LIMIT 15
  `);
  console.log('\nItem-to-Station assignments (sample):');
  console.table(itemCheck);

  // Invalidate cache
  const { cache } = require('../src/config/redis');
  await cache.del('kitchen_stations:43');
  await cache.del('items:43');
  console.log('\nCache invalidated.');

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
