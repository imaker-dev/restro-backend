/**
 * Cleanup Duplicate Variants and Addons
 * Keeps the first entry, removes duplicates
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function cleanupDuplicates() {
  const outletId = 34;
  
  console.log('='.repeat(70));
  console.log('CLEANUP DUPLICATE VARIANTS AND ADDONS');
  console.log('='.repeat(70));
  console.log(`Outlet ID: ${outletId}\n`);

  try {
    await initializeDatabase();
    const pool = getPool();

    // 1. Find and remove duplicate variants (keep first, delete rest)
    console.log('--- 1. Cleaning Duplicate Variants ---');
    
    const [dupVariants] = await pool.query(`
      SELECT v1.id, v1.item_id, v1.name, i.name as item_name
      FROM variants v1
      JOIN items i ON v1.item_id = i.id
      WHERE i.outlet_id = ?
      AND v1.is_active = 1
      AND EXISTS (
        SELECT 1 FROM variants v2 
        WHERE v2.item_id = v1.item_id 
        AND v2.name = v1.name 
        AND v2.is_active = 1 
        AND v2.id < v1.id
      )
    `, [outletId]);
    
    console.log(`Found ${dupVariants.length} duplicate variants to remove`);
    
    if (dupVariants.length > 0) {
      const variantIds = dupVariants.map(v => v.id);
      await pool.query('UPDATE variants SET is_active = 0 WHERE id IN (?)', [variantIds]);
      console.log(`Deactivated ${variantIds.length} duplicate variants`);
    }

    // 2. Find and remove duplicate addons (keep first, delete rest)
    console.log('\n--- 2. Cleaning Duplicate Addons ---');
    
    const [dupAddons] = await pool.query(`
      SELECT a1.id, a1.addon_group_id, a1.name, ag.name as group_name
      FROM addons a1
      JOIN addon_groups ag ON a1.addon_group_id = ag.id
      WHERE ag.outlet_id = ?
      AND a1.is_active = 1
      AND EXISTS (
        SELECT 1 FROM addons a2 
        WHERE a2.addon_group_id = a1.addon_group_id 
        AND a2.name = a1.name 
        AND a2.is_active = 1 
        AND a2.id < a1.id
      )
    `, [outletId]);
    
    console.log(`Found ${dupAddons.length} duplicate addons to remove`);
    
    if (dupAddons.length > 0) {
      const addonIds = dupAddons.map(a => a.id);
      await pool.query('UPDATE addons SET is_active = 0 WHERE id IN (?)', [addonIds]);
      console.log(`Deactivated ${addonIds.length} duplicate addons`);
    }

    // 3. Verify cleanup
    console.log('\n--- 3. Verification After Cleanup ---');
    
    const [remainingDupVariants] = await pool.query(`
      SELECT CONCAT(i.name, ' -> ', v.name) as combo, COUNT(*) as cnt 
      FROM variants v JOIN items i ON v.item_id = i.id 
      WHERE i.outlet_id = ? AND v.is_active = 1 
      GROUP BY i.name, v.name HAVING cnt > 1
    `, [outletId]);
    
    const [remainingDupAddons] = await pool.query(`
      SELECT CONCAT(ag.name, ' -> ', a.name) as combo, COUNT(*) as cnt 
      FROM addons a JOIN addon_groups ag ON a.addon_group_id = ag.id 
      WHERE ag.outlet_id = ? AND a.is_active = 1 
      GROUP BY ag.name, a.name HAVING cnt > 1
    `, [outletId]);
    
    if (remainingDupVariants.length === 0 && remainingDupAddons.length === 0) {
      console.log('✅ All duplicates cleaned up successfully!');
    } else {
      console.log('❌ Some duplicates remain:');
      remainingDupVariants.forEach(d => console.log(`  Variant: ${d.combo} (${d.cnt})`));
      remainingDupAddons.forEach(d => console.log(`  Addon: ${d.combo} (${d.cnt})`));
    }

    // 4. Show final counts
    console.log('\n--- 4. Final Counts ---');
    const [variantCount] = await pool.query('SELECT COUNT(*) as count FROM variants v JOIN items i ON v.item_id = i.id WHERE i.outlet_id = ? AND v.is_active = 1', [outletId]);
    const [addonCount] = await pool.query('SELECT COUNT(*) as count FROM addons a JOIN addon_groups ag ON a.addon_group_id = ag.id WHERE ag.outlet_id = ? AND a.is_active = 1', [outletId]);
    
    console.log(`Active Variants: ${variantCount[0].count}`);
    console.log(`Active Addons: ${addonCount[0].count}`);

    console.log('\n' + '='.repeat(70));
    console.log('CLEANUP COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

cleanupDuplicates();
