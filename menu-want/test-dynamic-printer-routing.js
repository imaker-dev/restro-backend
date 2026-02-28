/**
 * Test: Dynamic Station-to-Printer Routing
 * Verifies:
 * 1. Kitchen stations with printer_id are found correctly
 * 2. Counters with printer_id are found correctly
 * 3. Station type fallback works
 * 4. Printer.station column fallback works
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testDynamicPrinterRouting() {
  console.log('='.repeat(80));
  console.log('DYNAMIC STATION-TO-PRINTER ROUTING TEST');
  console.log('='.repeat(80));

  try {
    await initializeDatabase();
    const pool = getPool();
    const kotService = require('../src/services/kot.service');

    // Get an outlet to test
    const [outlets] = await pool.query('SELECT id, name FROM outlets WHERE is_active = 1 LIMIT 1');
    if (outlets.length === 0) {
      console.log('❌ No active outlets found');
      process.exit(1);
    }
    const outletId = outlets[0].id;
    console.log(`\nTesting outlet: ${outlets[0].name} (ID: ${outletId})`);

    // 1. List all kitchen stations with their printer assignments
    console.log('\n--- 1. Kitchen Stations & Printer Assignments ---');
    const [kitchenStations] = await pool.query(
      `SELECT ks.id, ks.name, ks.station_type, ks.printer_id, 
              p.name as printer_name, p.ip_address, p.port
       FROM kitchen_stations ks
       LEFT JOIN printers p ON ks.printer_id = p.id
       WHERE ks.outlet_id = ? AND ks.is_active = 1
       ORDER BY ks.display_order, ks.name`,
      [outletId]
    );
    
    for (const ks of kitchenStations) {
      const printerInfo = ks.printer_id 
        ? `✅ ${ks.printer_name} (${ks.ip_address}:${ks.port})` 
        : '❌ No printer assigned';
      console.log(`  ${ks.name} (${ks.station_type}): ${printerInfo}`);
    }

    // 2. List all counters with their printer assignments
    console.log('\n--- 2. Counters & Printer Assignments ---');
    const [counters] = await pool.query(
      `SELECT c.id, c.name, c.counter_type, c.printer_id,
              p.name as printer_name, p.ip_address, p.port
       FROM counters c
       LEFT JOIN printers p ON c.printer_id = p.id
       WHERE c.outlet_id = ? AND c.is_active = 1
       ORDER BY c.display_order, c.name`,
      [outletId]
    );
    
    if (counters.length === 0) {
      console.log('  No counters configured');
    } else {
      for (const c of counters) {
        const printerInfo = c.printer_id 
          ? `✅ ${c.printer_name} (${c.ip_address}:${c.port})` 
          : '❌ No printer assigned';
        console.log(`  ${c.name} (${c.counter_type}): ${printerInfo}`);
      }
    }

    // 3. Test getPrinterForStation with specific station IDs
    console.log('\n--- 3. Dynamic Printer Routing Test ---');
    
    // Test each kitchen station
    console.log('\n  Kitchen Stations:');
    for (const ks of kitchenStations) {
      const printer = await kotService.getPrinterForStation(outletId, ks.station_type, ks.id, false);
      const result = printer 
        ? `→ ${printer.name} (${printer.ip_address}:${printer.port || 9100})` 
        : '→ No printer found';
      console.log(`    ${ks.name} (type: ${ks.station_type}, id: ${ks.id}): ${result}`);
    }

    // Test each counter
    if (counters.length > 0) {
      console.log('\n  Counters:');
      for (const c of counters) {
        const printer = await kotService.getPrinterForStation(outletId, c.counter_type, c.id, true);
        const result = printer 
          ? `→ ${printer.name} (${printer.ip_address}:${printer.port || 9100})` 
          : '→ No printer found';
        console.log(`    ${c.name} (type: ${c.counter_type}, id: ${c.id}, isCounter: true): ${result}`);
      }
    }

    // 4. Test fallback routing (no stationId)
    console.log('\n--- 4. Fallback Routing Test (no stationId) ---');
    const testStationTypes = ['kitchen', 'main_kitchen', 'tandoor', 'wok', 'bar', 'main_bar', 'dessert', 'mocktail'];
    
    for (const stationType of testStationTypes) {
      const printer = await kotService.getPrinterForStation(outletId, stationType, null, false);
      const result = printer 
        ? `→ ${printer.name} (${printer.ip_address}:${printer.port || 9100})` 
        : '→ No printer found';
      console.log(`  Station type "${stationType}": ${result}`);
    }

    // 5. Simulate KOT item grouping
    console.log('\n--- 5. Simulated KOT Item Grouping ---');
    
    // Get sample items with station info
    const [sampleItems] = await pool.query(
      `SELECT i.id, i.name, i.kitchen_station_id, i.counter_id,
              ks.name as station_name, ks.station_type,
              c.name as counter_name, c.counter_type
       FROM items i
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       LEFT JOIN counters c ON i.counter_id = c.id
       WHERE i.outlet_id = ? AND i.is_active = 1
       LIMIT 10`,
      [outletId]
    );

    if (sampleItems.length === 0) {
      console.log('  No items found for testing');
    } else {
      for (const item of sampleItems) {
        let routeInfo = '';
        if (item.counter_id) {
          routeInfo = `Counter: ${item.counter_name || 'Unknown'} (${item.counter_type})`;
        } else if (item.kitchen_station_id) {
          routeInfo = `Station: ${item.station_name || 'Unknown'} (${item.station_type})`;
        } else {
          routeInfo = 'Default: kitchen';
        }
        console.log(`  "${item.name}": ${routeInfo}`);
      }
    }

    // 6. Summary
    console.log('\n--- 6. Configuration Summary ---');
    const stationsWithPrinter = kitchenStations.filter(ks => ks.printer_id).length;
    const countersWithPrinter = counters.filter(c => c.printer_id).length;
    
    console.log(`  Kitchen stations: ${kitchenStations.length} total, ${stationsWithPrinter} with printer`);
    console.log(`  Counters: ${counters.length} total, ${countersWithPrinter} with printer`);
    
    if (stationsWithPrinter === 0 && countersWithPrinter === 0) {
      console.log('\n  ⚠️  WARNING: No stations have printers assigned!');
      console.log('  → Printing will use fallback logic (printer.station column)');
      console.log('  → To enable dynamic routing, assign printer_id to kitchen_stations/counters');
    }

    console.log('\n' + '='.repeat(80));
    console.log('DYNAMIC ROUTING TEST COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nTest error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testDynamicPrinterRouting();
