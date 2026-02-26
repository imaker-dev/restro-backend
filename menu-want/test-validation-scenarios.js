/**
 * Bulk Upload Validation Test Scenarios
 * Tests all validation rules against the bulk upload service
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const VALID_FOOD_TYPES = ['veg', 'nonveg', 'non_veg', 'egg', 'vegan'];
const VALID_ITEM_TYPES = ['veg', 'non_veg', 'egg', 'vegan'];
const VALID_SERVICE_TYPES = ['restaurant', 'bar', 'both'];
const VALID_TYPES = ['CATEGORY', 'ITEM', 'VARIANT', 'ADDON_GROUP', 'ADDON'];
const GST_RATES = ['0', '5', '12', '18', '28'];

console.log('='.repeat(60));
console.log('BULK UPLOAD VALIDATION TEST SCENARIOS');
console.log('='.repeat(60));

// Test Results
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, condition, details = '') {
  const result = condition ? 'PASS' : 'FAIL';
  testResults.tests.push({ name, result, details });
  if (condition) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   Details: ${details}`);
  }
}

// Load and parse the sample CSV
const csvPath = path.join(__dirname, 'Complete_BulkUpload.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const records = csv.parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_column_count: true,
  cast: (value) => (value === '' ? null : value)
});

console.log(`\nLoaded ${records.length} records from CSV\n`);

// ========================================
// TEST SCENARIO 1: Header Validation
// ========================================
console.log('\n--- SCENARIO 1: CSV Header Validation ---');

const expectedHeaders = [
  'Type', 'Name', 'Category', 'Price', 'ItemType', 'GST', 'Station',
  'Description', 'Parent', 'ShortName', 'SKU', 'Default', 'SelectionType',
  'Min', 'Max', 'Required', 'Group', 'Item', 'ServiceType'
];

const actualHeaders = csvContent.split('\n')[0].split(',').map(h => h.trim());
test('Header has 19 columns', actualHeaders.length === 19, `Found ${actualHeaders.length} columns`);
test('Header contains Type column', actualHeaders.includes('Type'));
test('Header contains Name column', actualHeaders.includes('Name'));
test('Header contains Item column', actualHeaders.includes('Item'));
test('Header contains Group column', actualHeaders.includes('Group'));
test('Header contains ServiceType column', actualHeaders.includes('ServiceType'));
test('Header contains ItemType column', actualHeaders.includes('ItemType'));

// ========================================
// TEST SCENARIO 2: Type Validation
// ========================================
console.log('\n--- SCENARIO 2: Type Validation ---');

const types = records.map(r => (r.Type || '').toUpperCase().trim()).filter(t => t);
const invalidTypes = types.filter(t => !VALID_TYPES.includes(t));
test('All types are valid', invalidTypes.length === 0, `Invalid types: ${invalidTypes.join(', ')}`);

const typeCounts = {
  CATEGORY: types.filter(t => t === 'CATEGORY').length,
  ITEM: types.filter(t => t === 'ITEM').length,
  VARIANT: types.filter(t => t === 'VARIANT').length,
  ADDON_GROUP: types.filter(t => t === 'ADDON_GROUP').length,
  ADDON: types.filter(t => t === 'ADDON').length
};

test('Has CATEGORY rows', typeCounts.CATEGORY > 0, `Found ${typeCounts.CATEGORY}`);
test('Has ITEM rows', typeCounts.ITEM > 0, `Found ${typeCounts.ITEM}`);
test('Has VARIANT rows', typeCounts.VARIANT > 0, `Found ${typeCounts.VARIANT}`);
test('Has ADDON_GROUP rows', typeCounts.ADDON_GROUP > 0, `Found ${typeCounts.ADDON_GROUP}`);
test('Has ADDON rows', typeCounts.ADDON > 0, `Found ${typeCounts.ADDON}`);

// ========================================
// TEST SCENARIO 3: Name Validation
// ========================================
console.log('\n--- SCENARIO 3: Name Validation ---');

const rowsWithoutName = records.filter(r => {
  const type = (r.Type || '').toUpperCase().trim();
  return VALID_TYPES.includes(type) && !(r.Name || '').trim();
});
test('All rows have Name', rowsWithoutName.length === 0, `${rowsWithoutName.length} rows missing name`);

// Check for duplicate category names
const categoryNames = records
  .filter(r => (r.Type || '').toUpperCase() === 'CATEGORY')
  .map(r => (r.Name || '').toLowerCase().trim());
const duplicateCategories = categoryNames.filter((name, index) => categoryNames.indexOf(name) !== index);
test('No duplicate category names', duplicateCategories.length === 0, `Duplicates: ${[...new Set(duplicateCategories)].join(', ')}`);

// ========================================
// TEST SCENARIO 4: ItemType Validation
// ========================================
console.log('\n--- SCENARIO 4: ItemType Validation ---');

const itemsOnly = records.filter(r => (r.Type || '').toUpperCase() === 'ITEM');

const invalidItemTypes = itemsOnly.filter(r => {
  const itemType = (r.ItemType || r.FoodType || 'veg').toLowerCase().trim();
  return !VALID_ITEM_TYPES.includes(itemType);
});
test('All ItemTypes are valid (veg/non_veg/egg/vegan)', invalidItemTypes.length === 0, 
  `Invalid: ${invalidItemTypes.map(r => `${r.Name}: ${r.ItemType}`).slice(0, 3).join(', ')}`);

// Check for common mistake: "nonveg" without underscore (should be non_veg)
const wrongFormatItemTypes = itemsOnly.filter(r => {
  const itemType = (r.ItemType || '').toLowerCase();
  return itemType === 'nonveg';
});
test('All non-veg uses underscore format (non_veg)', wrongFormatItemTypes.length === 0,
  `Found "nonveg" instead of "non_veg": ${wrongFormatItemTypes.length} items`);

// Item type counts
const itemTypeCounts = {
  veg: itemsOnly.filter(r => (r.ItemType || 'veg').toLowerCase() === 'veg').length,
  non_veg: itemsOnly.filter(r => (r.ItemType || '').toLowerCase() === 'non_veg').length,
  egg: itemsOnly.filter(r => (r.ItemType || '').toLowerCase() === 'egg').length,
  vegan: itemsOnly.filter(r => (r.ItemType || '').toLowerCase() === 'vegan').length
};
console.log(`   Item Types: Veg=${itemTypeCounts.veg}, Non_Veg=${itemTypeCounts.non_veg}, Egg=${itemTypeCounts.egg}, Vegan=${itemTypeCounts.vegan}`);

// ========================================
// TEST SCENARIO 5: Price Validation
// ========================================
console.log('\n--- SCENARIO 5: Price Validation ---');

const itemsWithPrice = records.filter(r => (r.Type || '').toUpperCase() === 'ITEM');
const variantsWithPrice = records.filter(r => (r.Type || '').toUpperCase() === 'VARIANT');
const addonsWithPrice = records.filter(r => (r.Type || '').toUpperCase() === 'ADDON');

const invalidItemPrices = itemsWithPrice.filter(r => {
  const price = parseFloat(r.Price);
  return isNaN(price) || price < 0;
});
test('All ITEM prices are valid numbers >= 0', invalidItemPrices.length === 0,
  `Invalid: ${invalidItemPrices.map(r => `${r.Name}: ${r.Price}`).slice(0, 3).join(', ')}`);

const invalidVariantPrices = variantsWithPrice.filter(r => {
  const price = parseFloat(r.Price);
  return isNaN(price) || price < 0;
});
test('All VARIANT prices are valid numbers >= 0', invalidVariantPrices.length === 0,
  `Invalid: ${invalidVariantPrices.map(r => `${r.Name}: ${r.Price}`).slice(0, 3).join(', ')}`);

// ========================================
// TEST SCENARIO 6: GST Validation
// ========================================
console.log('\n--- SCENARIO 6: GST Validation ---');

const itemsWithGST = records.filter(r => (r.Type || '').toUpperCase() === 'ITEM' && r.GST);
const invalidGST = itemsWithGST.filter(r => !GST_RATES.includes(String(r.GST)));
test('All GST rates are valid (0/5/12/18/28)', invalidGST.length === 0,
  `Invalid: ${invalidGST.map(r => `${r.Name}: ${r.GST}`).slice(0, 3).join(', ')}`);

const gstCounts = {};
itemsWithGST.forEach(r => {
  const gst = String(r.GST);
  gstCounts[gst] = (gstCounts[gst] || 0) + 1;
});
console.log(`   GST Rates: ${Object.entries(gstCounts).map(([k, v]) => `${k}%=${v}`).join(', ')}`);

// ========================================
// TEST SCENARIO 6.5: ServiceType Validation
// ========================================
console.log('\n--- SCENARIO 6.5: ServiceType Validation ---');

const categoriesWithService = records.filter(r => (r.Type || '').toUpperCase() === 'CATEGORY');
const itemsWithService = records.filter(r => (r.Type || '').toUpperCase() === 'ITEM');

const invalidCatServiceTypes = categoriesWithService.filter(r => {
  const serviceType = (r.ServiceType || 'both').toLowerCase().trim();
  return !VALID_SERVICE_TYPES.includes(serviceType);
});
test('All CATEGORY ServiceTypes are valid (restaurant/bar/both)', invalidCatServiceTypes.length === 0,
  `Invalid: ${invalidCatServiceTypes.map(r => `${r.Name}: ${r.ServiceType}`).slice(0, 3).join(', ')}`);

const invalidItemServiceTypes = itemsWithService.filter(r => {
  const serviceType = (r.ServiceType || 'both').toLowerCase().trim();
  return !VALID_SERVICE_TYPES.includes(serviceType);
});
test('All ITEM ServiceTypes are valid (restaurant/bar/both)', invalidItemServiceTypes.length === 0,
  `Invalid: ${invalidItemServiceTypes.map(r => `${r.Name}: ${r.ServiceType}`).slice(0, 3).join(', ')}`);

// ServiceType counts
const serviceTypeCounts = {
  restaurant: categoriesWithService.filter(r => (r.ServiceType || 'both').toLowerCase() === 'restaurant').length,
  bar: categoriesWithService.filter(r => (r.ServiceType || '').toLowerCase() === 'bar').length,
  both: categoriesWithService.filter(r => (r.ServiceType || '').toLowerCase() === 'both').length
};
console.log(`   Category ServiceTypes: Restaurant=${serviceTypeCounts.restaurant}, Bar=${serviceTypeCounts.bar}, Both=${serviceTypeCounts.both}`);

// ========================================
// TEST SCENARIO 7: Variant-Item Linkage
// ========================================
console.log('\n--- SCENARIO 7: Variant-Item Linkage ---');

const itemNames = new Set(records
  .filter(r => (r.Type || '').toUpperCase() === 'ITEM')
  .map(r => (r.Name || '').toLowerCase().trim()));

const variants = records.filter(r => (r.Type || '').toUpperCase() === 'VARIANT');
const variantsWithoutItem = variants.filter(r => {
  const itemRef = (r.Item || '').toLowerCase().trim();
  return !itemRef || !itemNames.has(itemRef);
});
test('All variants link to valid items', variantsWithoutItem.length === 0,
  `Orphan variants: ${variantsWithoutItem.map(r => r.Name).slice(0, 3).join(', ')}`);

// Check items with price 0 have variants
const itemsWithZeroPrice = records
  .filter(r => (r.Type || '').toUpperCase() === 'ITEM' && parseFloat(r.Price) === 0)
  .map(r => r.Name);

const itemsWithVariants = new Set(variants.map(v => (v.Item || '').toLowerCase().trim()));
const zeroItemsWithoutVariants = itemsWithZeroPrice.filter(name => 
  !itemsWithVariants.has(name.toLowerCase().trim()) && name !== 'Open Item'
);
test('Items with price 0 have variants (except Open Item)', zeroItemsWithoutVariants.length === 0,
  `Missing variants: ${zeroItemsWithoutVariants.slice(0, 3).join(', ')}`);

// ========================================
// TEST SCENARIO 8: Addon-Group Linkage
// ========================================
console.log('\n--- SCENARIO 8: Addon-Group Linkage ---');

const groupNames = new Set(records
  .filter(r => (r.Type || '').toUpperCase() === 'ADDON_GROUP')
  .map(r => (r.Name || '').toLowerCase().trim()));

const addons = records.filter(r => (r.Type || '').toUpperCase() === 'ADDON');
const addonsWithoutGroup = addons.filter(r => {
  const groupRef = (r.Group || '').toLowerCase().trim();
  return !groupRef || !groupNames.has(groupRef);
});
test('All addons link to valid groups', addonsWithoutGroup.length === 0,
  `Orphan addons: ${addonsWithoutGroup.map(r => r.Name).slice(0, 3).join(', ')}`);

// ========================================
// TEST SCENARIO 9: Addon Group Settings
// ========================================
console.log('\n--- SCENARIO 9: Addon Group Settings ---');

const addonGroups = records.filter(r => (r.Type || '').toUpperCase() === 'ADDON_GROUP');
const invalidSelectionTypes = addonGroups.filter(r => {
  const selType = (r.SelectionType || 'multiple').toLowerCase();
  return !['single', 'multiple'].includes(selType);
});
test('All SelectionTypes are valid (single/multiple)', invalidSelectionTypes.length === 0,
  `Invalid: ${invalidSelectionTypes.map(r => `${r.Name}: ${r.SelectionType}`).join(', ')}`);

const invalidMinMax = addonGroups.filter(r => {
  const min = parseInt(r.Min) || 0;
  const max = parseInt(r.Max) || 10;
  return min > max;
});
test('All Min <= Max for addon groups', invalidMinMax.length === 0,
  `Invalid: ${invalidMinMax.map(r => `${r.Name}: min=${r.Min}, max=${r.Max}`).join(', ')}`);

// ========================================
// TEST SCENARIO 10: Column Alignment
// ========================================
console.log('\n--- SCENARIO 10: Column Alignment ---');

// Check variant Item column is at position 17
const firstVariant = records.find(r => (r.Type || '').toUpperCase() === 'VARIANT');
test('Variant has Item column populated', firstVariant && firstVariant.Item,
  `Item value: ${firstVariant?.Item || 'MISSING'}`);

// Check addon Group column is at position 16
const firstAddon = records.find(r => (r.Type || '').toUpperCase() === 'ADDON');
test('Addon has Group column populated', firstAddon && firstAddon.Group,
  `Group value: ${firstAddon?.Group || 'MISSING'}`);

// ========================================
// TEST SCENARIO 11: Kitchen Stations
// ========================================
console.log('\n--- SCENARIO 11: Kitchen Stations ---');

const stations = new Set(records
  .filter(r => (r.Type || '').toUpperCase() === 'ITEM' && r.Station)
  .map(r => r.Station));
test('Items have kitchen stations assigned', stations.size > 0, `Stations: ${[...stations].join(', ')}`);

// ========================================
// SUMMARY
// ========================================
console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
console.log(`Passed: ${testResults.passed} ✅`);
console.log(`Failed: ${testResults.failed} ❌`);
console.log('='.repeat(60));

if (testResults.failed === 0) {
  console.log('\n✅ ALL VALIDATION TESTS PASSED');
  console.log('CSV is ready for bulk upload.\n');
} else {
  console.log('\n❌ SOME TESTS FAILED');
  console.log('Please fix the issues before uploading.\n');
  
  console.log('Failed Tests:');
  testResults.tests.filter(t => t.result === 'FAIL').forEach(t => {
    console.log(`  - ${t.name}`);
    if (t.details) console.log(`    ${t.details}`);
  });
}

// Export for programmatic use
module.exports = testResults;
