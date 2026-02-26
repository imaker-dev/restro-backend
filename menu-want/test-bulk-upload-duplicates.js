/**
 * Test Bulk Upload Duplicate/Update Logic
 * Verifies that re-uploading CSV correctly skips unchanged, updates changed, and doesn't create duplicates
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testBulkUploadDuplicates() {
  const outletId = 34;
  
  console.log('='.repeat(70));
  console.log('BULK UPLOAD DUPLICATE/UPDATE LOGIC TEST');
  console.log('='.repeat(70));
  console.log(`Outlet ID: ${outletId}\n`);

  try {
    await initializeDatabase();
    const pool = getPool();
    const bulkUploadService = require('../src/services/bulkUpload.service');

    // Get current counts
    console.log('--- 1. Current Database State ---');
    const [catCount] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE outlet_id = ? AND deleted_at IS NULL', [outletId]);
    const [itemCount] = await pool.query('SELECT COUNT(*) as count FROM items WHERE outlet_id = ? AND deleted_at IS NULL', [outletId]);
    const [variantCount] = await pool.query('SELECT COUNT(*) as count FROM variants v JOIN items i ON v.item_id = i.id WHERE i.outlet_id = ? AND v.is_active = 1', [outletId]);
    const [addonGroupCount] = await pool.query('SELECT COUNT(*) as count FROM addon_groups WHERE outlet_id = ? AND is_active = 1', [outletId]);
    const [addonCount] = await pool.query('SELECT COUNT(*) as count FROM addons a JOIN addon_groups ag ON a.addon_group_id = ag.id WHERE ag.outlet_id = ? AND a.is_active = 1', [outletId]);
    
    console.log(`  Categories: ${catCount[0].count}`);
    console.log(`  Items: ${itemCount[0].count}`);
    console.log(`  Variants: ${variantCount[0].count}`);
    console.log(`  Addon Groups: ${addonGroupCount[0].count}`);
    console.log(`  Addons: ${addonCount[0].count}`);

    // Test 1: Re-upload same data (should all skip)
    console.log('\n--- 2. Test Re-upload Same Data (Should Skip All) ---');
    
    const testRecords1 = [
      { Type: 'CATEGORY', Name: 'Chinese Non Veg Starter', ServiceType: 'restaurant' },
      { Type: 'ITEM', Name: 'Chilli Chicken Dry', Category: 'Chinese Non Veg Starter', Price: '319', ItemType: 'non_veg', GST: '5', Station: 'Kitchen', ServiceType: 'restaurant' },
      { Type: 'ADDON_GROUP', Name: 'Spice Level', SelectionType: 'single', Min: '1', Max: '1', Required: 'yes' },
      { Type: 'ADDON', Name: 'Mild', Group: 'Spice Level', Price: '0', ItemType: 'veg' }
    ];
    
    const result1 = await bulkUploadService.processRecords(testRecords1, outletId, 1);
    console.log('Result:', JSON.stringify(result1, null, 2));
    
    // Test 2: Upload with changed price (should update)
    console.log('\n--- 3. Test Upload with Changed Data (Should Update) ---');
    
    const testRecords2 = [
      { Type: 'ITEM', Name: 'Chilli Chicken Dry', Category: 'Chinese Non Veg Starter', Price: '350', ItemType: 'non_veg', GST: '5', Station: 'Kitchen', ServiceType: 'restaurant' }
    ];
    
    const result2 = await bulkUploadService.processRecords(testRecords2, outletId, 1);
    console.log('Result:', JSON.stringify(result2, null, 2));
    
    // Verify the price was updated
    const [updatedItem] = await pool.query('SELECT base_price FROM items WHERE name = ? AND outlet_id = ?', ['Chilli Chicken Dry', outletId]);
    console.log(`  Verified price in DB: ${updatedItem[0]?.base_price}`);
    
    // Revert price back
    await pool.query('UPDATE items SET base_price = 319 WHERE name = ? AND outlet_id = ?', ['Chilli Chicken Dry', outletId]);
    console.log('  Reverted price back to 319');

    // Test 3: Check variant duplicate handling
    console.log('\n--- 4. Test Variant Duplicate Handling ---');
    
    // First, let's see what variants exist
    const [existingVariants] = await pool.query(
      `SELECT v.name, v.price, i.name as item_name 
       FROM variants v JOIN items i ON v.item_id = i.id 
       WHERE i.outlet_id = ? AND v.is_active = 1 LIMIT 5`, [outletId]
    );
    console.log('Existing variants (first 5):');
    existingVariants.forEach(v => console.log(`  ${v.item_name} -> ${v.name} @ ${v.price}`));
    
    if (existingVariants.length > 0) {
      const testVariant = existingVariants[0];
      const testRecords3 = [
        { Type: 'VARIANT', Name: testVariant.name, Item: testVariant.item_name, Price: testVariant.price, Default: 'no' }
      ];
      
      const result3 = await bulkUploadService.processRecords(testRecords3, outletId, 1);
      console.log('Re-upload same variant result:', JSON.stringify(result3, null, 2));
    }

    // Get final counts
    console.log('\n--- 5. Final Database State ---');
    const [catCount2] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE outlet_id = ? AND deleted_at IS NULL', [outletId]);
    const [itemCount2] = await pool.query('SELECT COUNT(*) as count FROM items WHERE outlet_id = ? AND deleted_at IS NULL', [outletId]);
    const [variantCount2] = await pool.query('SELECT COUNT(*) as count FROM variants v JOIN items i ON v.item_id = i.id WHERE i.outlet_id = ? AND v.is_active = 1', [outletId]);
    const [addonGroupCount2] = await pool.query('SELECT COUNT(*) as count FROM addon_groups WHERE outlet_id = ? AND is_active = 1', [outletId]);
    const [addonCount2] = await pool.query('SELECT COUNT(*) as count FROM addons a JOIN addon_groups ag ON a.addon_group_id = ag.id WHERE ag.outlet_id = ? AND a.is_active = 1', [outletId]);
    
    console.log(`  Categories: ${catCount2[0].count} (was ${catCount[0].count})`);
    console.log(`  Items: ${itemCount2[0].count} (was ${itemCount[0].count})`);
    console.log(`  Variants: ${variantCount2[0].count} (was ${variantCount[0].count})`);
    console.log(`  Addon Groups: ${addonGroupCount2[0].count} (was ${addonGroupCount[0].count})`);
    console.log(`  Addons: ${addonCount2[0].count} (was ${addonCount[0].count})`);

    // Check for duplicates
    console.log('\n--- 6. Check for Duplicate Names ---');
    const [dupItems] = await pool.query(
      `SELECT name, COUNT(*) as cnt FROM items WHERE outlet_id = ? AND deleted_at IS NULL GROUP BY name HAVING cnt > 1`, [outletId]
    );
    const [dupVariants] = await pool.query(
      `SELECT CONCAT(i.name, ' -> ', v.name) as combo, COUNT(*) as cnt 
       FROM variants v JOIN items i ON v.item_id = i.id 
       WHERE i.outlet_id = ? AND v.is_active = 1 
       GROUP BY i.name, v.name HAVING cnt > 1`, [outletId]
    );
    const [dupAddons] = await pool.query(
      `SELECT CONCAT(ag.name, ' -> ', a.name) as combo, COUNT(*) as cnt 
       FROM addons a JOIN addon_groups ag ON a.addon_group_id = ag.id 
       WHERE ag.outlet_id = ? AND a.is_active = 1 
       GROUP BY ag.name, a.name HAVING cnt > 1`, [outletId]
    );
    
    if (dupItems.length === 0 && dupVariants.length === 0 && dupAddons.length === 0) {
      console.log('  ✅ No duplicates found!');
    } else {
      console.log('  ❌ Duplicates found:');
      dupItems.forEach(d => console.log(`    Item: ${d.name} (${d.cnt} copies)`));
      dupVariants.forEach(d => console.log(`    Variant: ${d.combo} (${d.cnt} copies)`));
      dupAddons.forEach(d => console.log(`    Addon: ${d.combo} (${d.cnt} copies)`));
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

testBulkUploadDuplicates();
