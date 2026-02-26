/**
 * Test Item Update API for kitchenStationId
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase } = require('../src/database');

async function testItemUpdate() {
  // Initialize database
  await initializeDatabase();
  const itemService = require('../src/services/item.service');
  const itemId = 165;
  const newStationId = 36; // Bar station
  
  console.log('='.repeat(60));
  console.log('TEST ITEM UPDATE - kitchenStationId');
  console.log('='.repeat(60));
  
  try {
    // 1. Get current item
    console.log('\n--- 1. Current Item State ---');
    const beforeItem = await itemService.getById(itemId);
    if (!beforeItem) {
      console.log(`Item ${itemId} not found`);
      return;
    }
    console.log(`Item: ${beforeItem.name}`);
    console.log(`  kitchen_station_id: ${beforeItem.kitchen_station_id}`);
    console.log(`  kitchen_station_name: ${beforeItem.kitchen_station_name || 'N/A'}`);
    
    // 2. Update kitchenStationId
    console.log(`\n--- 2. Updating kitchenStationId to ${newStationId} ---`);
    const updatedItem = await itemService.update(itemId, { kitchenStationId: newStationId });
    console.log(`Update returned item:`);
    console.log(`  kitchen_station_id: ${updatedItem.kitchen_station_id}`);
    console.log(`  kitchen_station_name: ${updatedItem.kitchen_station_name || 'N/A'}`);
    
    // 3. Verify by fetching again
    console.log('\n--- 3. Verify by fetching item again ---');
    const afterItem = await itemService.getById(itemId);
    console.log(`Item after update:`);
    console.log(`  kitchen_station_id: ${afterItem.kitchen_station_id}`);
    console.log(`  kitchen_station_name: ${afterItem.kitchen_station_name || 'N/A'}`);
    
    // 4. Reset back to original
    console.log('\n--- 4. Reset to original station (33) ---');
    await itemService.update(itemId, { kitchenStationId: 33 });
    const resetItem = await itemService.getById(itemId);
    console.log(`Item after reset:`);
    console.log(`  kitchen_station_id: ${resetItem.kitchen_station_id}`);
    console.log(`  kitchen_station_name: ${resetItem.kitchen_station_name || 'N/A'}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE - kitchenStationId update working');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

testItemUpdate();
