/**
 * Test Script for Bulk Upload CSV Validation
 * Run: node menu-want/test-bulk-upload.js
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const VALID_FOOD_TYPES = ['veg', 'nonveg', 'egg'];
const VALID_TYPES = ['CATEGORY', 'ITEM', 'VARIANT', 'ADDON_GROUP', 'ADDON'];
const VALID_GST_RATES = ['0', '5', '12', '18', '28'];
const VALID_STATIONS = ['Bar', 'Kitchen', 'Tandoor', 'Dessert'];

function validateCSV(filePath) {
  console.log('\n========================================');
  console.log('BULK UPLOAD CSV VALIDATION TEST');
  console.log('========================================\n');
  console.log(`File: ${filePath}\n`);

  const csvContent = fs.readFileSync(filePath, 'utf-8');
  
  let records;
  try {
    records = csv.parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      cast: (value) => (value === '' ? null : value)
    });
  } catch (error) {
    console.error('❌ CSV PARSE ERROR:', error.message);
    return { success: false, errors: [error.message] };
  }

  console.log(`✅ CSV parsed successfully: ${records.length} rows\n`);

  const errors = [];
  const warnings = [];
  const stats = {
    categories: 0,
    items: 0,
    variants: 0,
    addonGroups: 0,
    addons: 0,
    itemsWithVariants: 0,
    stations: new Set(),
    gstRates: new Set(),
    foodTypes: { veg: 0, nonveg: 0, egg: 0 }
  };

  const categories = new Set();
  const items = new Set();
  const addonGroups = new Set();
  const skus = new Set();

  let currentCategory = null;
  let currentItem = null;
  let currentGroup = null;
  let itemsWithZeroPrice = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;
    const type = (row.Type || '').toUpperCase().trim();
    const name = (row.Name || '').trim();

    // Validate Type
    if (!type) {
      errors.push(`Row ${rowNum}: Type is required`);
      continue;
    }
    if (!VALID_TYPES.includes(type)) {
      errors.push(`Row ${rowNum}: Invalid Type "${type}"`);
      continue;
    }

    // Validate Name
    if (!name) {
      errors.push(`Row ${rowNum}: Name is required for ${type}`);
      continue;
    }

    switch (type) {
      case 'CATEGORY':
        stats.categories++;
        if (categories.has(name.toLowerCase())) {
          errors.push(`Row ${rowNum}: Duplicate category "${name}"`);
        } else {
          categories.add(name.toLowerCase());
          currentCategory = name;
        }
        // Validate station for category
        const catStation = row.Station;
        if (catStation) {
          stats.stations.add(catStation);
          if (!VALID_STATIONS.includes(catStation)) {
            warnings.push(`Row ${rowNum}: Non-standard station "${catStation}" for category`);
          }
        }
        break;

      case 'ITEM':
        stats.items++;
        const itemCat = row.Category || currentCategory;
        if (!itemCat) {
          errors.push(`Row ${rowNum}: Category required for item "${name}"`);
        } else if (!categories.has(itemCat.toLowerCase())) {
          errors.push(`Row ${rowNum}: Category "${itemCat}" not found for item "${name}"`);
        }

        // Validate price
        const price = parseFloat(row.Price);
        if (isNaN(price)) {
          errors.push(`Row ${rowNum}: Invalid price for item "${name}"`);
        } else if (price < 0) {
          errors.push(`Row ${rowNum}: Negative price for item "${name}"`);
        } else if (price === 0) {
          itemsWithZeroPrice.push(name);
        }

        // Validate item type (supports both ItemType and FoodType columns)
        const itemType = (row.ItemType || row.FoodType || 'veg').toLowerCase();
        // Normalize: accept both 'nonveg' and 'non_veg' formats
        const normalizedType = itemType === 'nonveg' ? 'non_veg' : itemType;
        if (!['veg', 'non_veg', 'egg', 'vegan'].includes(normalizedType)) {
          errors.push(`Row ${rowNum}: Invalid ItemType "${itemType}" for item "${name}"`);
        } else {
          // Map to stats keys
          if (normalizedType === 'non_veg') stats.foodTypes.nonveg++;
          else if (normalizedType === 'egg') stats.foodTypes.egg++;
          else if (normalizedType === 'vegan') stats.foodTypes.vegan = (stats.foodTypes.vegan || 0) + 1;
          else stats.foodTypes.veg++;
        }

        // Validate GST
        const gst = row.GST;
        if (gst) {
          stats.gstRates.add(gst);
          if (!VALID_GST_RATES.includes(gst)) {
            warnings.push(`Row ${rowNum}: Non-standard GST rate "${gst}%"`);
          }
        }

        // Validate station
        const station = row.Station;
        if (station) {
          stats.stations.add(station);
        }

        // Check duplicate item
        if (items.has(name.toLowerCase())) {
          errors.push(`Row ${rowNum}: Duplicate item "${name}"`);
        } else {
          items.add(name.toLowerCase());
          currentItem = name;
        }

        // Check SKU
        const sku = row.SKU;
        if (sku) {
          if (skus.has(sku)) {
            errors.push(`Row ${rowNum}: Duplicate SKU "${sku}"`);
          } else {
            skus.add(sku);
          }
        }
        break;

      case 'VARIANT':
        stats.variants++;
        const variantItem = row.Item || currentItem;
        if (!variantItem) {
          errors.push(`Row ${rowNum}: Item required for variant "${name}"`);
        } else if (!items.has(variantItem.toLowerCase())) {
          errors.push(`Row ${rowNum}: Item "${variantItem}" not found for variant "${name}"`);
        }

        const varPrice = parseFloat(row.Price);
        if (isNaN(varPrice) || varPrice < 0) {
          errors.push(`Row ${rowNum}: Invalid price for variant "${name}"`);
        }

        // Check variant SKU
        const varSku = row.SKU;
        if (varSku) {
          if (skus.has(varSku)) {
            errors.push(`Row ${rowNum}: Duplicate variant SKU "${varSku}"`);
          } else {
            skus.add(varSku);
          }
        }
        break;

      case 'ADDON_GROUP':
        stats.addonGroups++;
        if (addonGroups.has(name.toLowerCase())) {
          errors.push(`Row ${rowNum}: Duplicate addon group "${name}"`);
        } else {
          addonGroups.add(name.toLowerCase());
          currentGroup = name;
        }

        // Validate selection type
        const selType = (row.SelectionType || 'multiple').toLowerCase();
        if (!['single', 'multiple'].includes(selType)) {
          warnings.push(`Row ${rowNum}: Invalid SelectionType "${selType}" for addon group`);
        }

        // Validate min/max
        const min = parseInt(row.Min) || 0;
        const max = parseInt(row.Max) || 10;
        if (min > max) {
          errors.push(`Row ${rowNum}: Min (${min}) > Max (${max}) for addon group "${name}"`);
        }
        break;

      case 'ADDON':
        stats.addons++;
        const addonGroup = row.Group || currentGroup;
        if (!addonGroup) {
          errors.push(`Row ${rowNum}: Group required for addon "${name}"`);
        } else if (!addonGroups.has(addonGroup.toLowerCase())) {
          errors.push(`Row ${rowNum}: Addon group "${addonGroup}" not found for addon "${name}"`);
        }

        const addonFoodType = (row.FoodType || 'veg').toLowerCase();
        if (!VALID_FOOD_TYPES.includes(addonFoodType)) {
          errors.push(`Row ${rowNum}: Invalid FoodType "${addonFoodType}" for addon "${name}"`);
        }
        break;
    }
  }

  // Verify items with price 0 have variants
  const itemsArray = records.filter(r => (r.Type || '').toUpperCase() === 'ITEM');
  const variantsArray = records.filter(r => (r.Type || '').toUpperCase() === 'VARIANT');
  
  for (const item of itemsWithZeroPrice) {
    const hasVariant = variantsArray.some(v => {
      const variantItem = (v.Item || v.item || '').trim().toLowerCase();
      return variantItem === item.toLowerCase();
    });
    if (!hasVariant) {
      warnings.push(`Item "${item}" has price 0 but no variants found`);
    } else {
      stats.itemsWithVariants++;
    }
  }

  // Print Results
  console.log('========================================');
  console.log('VALIDATION RESULTS');
  console.log('========================================\n');

  console.log('📊 STATISTICS:');
  console.log(`   Categories:     ${stats.categories}`);
  console.log(`   Items:          ${stats.items}`);
  console.log(`   Variants:       ${stats.variants}`);
  console.log(`   Addon Groups:   ${stats.addonGroups}`);
  console.log(`   Addons:         ${stats.addons}`);
  console.log(`   Total Rows:     ${records.length}`);
  console.log('');
  console.log('🍽️  FOOD TYPES:');
  console.log(`   Veg:            ${stats.foodTypes.veg}`);
  console.log(`   Non-Veg:        ${stats.foodTypes.nonveg}`);
  console.log(`   Egg:            ${stats.foodTypes.egg}`);
  console.log('');
  console.log('🏪 STATIONS:', Array.from(stats.stations).join(', ') || 'None');
  console.log('💰 GST RATES:', Array.from(stats.gstRates).map(r => r + '%').join(', ') || 'None');
  console.log('');

  if (errors.length > 0) {
    console.log('❌ ERRORS (' + errors.length + '):');
    errors.forEach(e => console.log('   - ' + e));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS (' + warnings.length + '):');
    warnings.forEach(w => console.log('   - ' + w));
    console.log('');
  }

  const isValid = errors.length === 0;
  console.log('========================================');
  console.log(isValid ? '✅ CSV IS VALID FOR BULK UPLOAD' : '❌ CSV HAS ERRORS - FIX BEFORE UPLOAD');
  console.log('========================================\n');

  return {
    success: isValid,
    stats,
    errors,
    warnings
  };
}

// Run validation
const csvFile = path.join(__dirname, 'Complete_BulkUpload.csv');
if (fs.existsSync(csvFile)) {
  validateCSV(csvFile);
} else {
  console.error('File not found:', csvFile);
}
