/**
 * Script to update bulk upload template CSV
 * 1. Remove Group column
 * 2. Remove station from CATEGORY rows
 * 3. Normalize stations: Tandoor, Dessert, etc. → Kitchen; liquor items → Bar
 * 4. Set item base_price from smallest variant price instead of 0
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const inputFile = path.join(__dirname, '../menu-want/Item_Bulk_Upload_Template.csv');
const outputFile = path.join(__dirname, '../menu-want/Complete_BulkUpload.csv');

// Helper to escape CSV value
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Read the CSV
const content = fs.readFileSync(inputFile, 'utf-8');
const records = csv.parse(content, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_column_count: true
});

// New header - keep Group column for ADDONs
const newColumns = [
  'Type', 'Name', 'Category', 'Price', 'ItemType', 'GST', 'VAT', 'Station',
  'Description', 'Parent', 'ShortName', 'SKU', 'Default', 'SelectionType',
  'Min', 'Max', 'Required', 'Group', 'Item', 'ServiceType'
];

// Process records
const processedRecords = [];
let currentItemName = null;
const itemVariants = new Map(); // Map item name to array of variant prices

// First pass: collect variant prices for each item
for (const row of records) {
  const type = (row.Type || '').toUpperCase().trim();
  const name = row.Name || '';
  
  if (type === 'ITEM') {
    currentItemName = name.trim();
    if (!itemVariants.has(currentItemName)) {
      itemVariants.set(currentItemName, []);
    }
  } else if (type === 'VARIANT') {
    const itemName = row.Item || currentItemName;
    const price = parseFloat(row.Price) || 0;
    if (itemName && price > 0) {
      if (!itemVariants.has(itemName)) {
        itemVariants.set(itemName, []);
      }
      itemVariants.get(itemName).push(price);
    }
  }
}

// Second pass: process and transform records
currentItemName = null;
let currentAddonGroup = null;
for (const row of records) {
  const type = (row.Type || '').toUpperCase().trim();
  const name = row.Name || '';
  
  // Create new row without Group column
  const newRow = {};
  for (const col of newColumns) {
    newRow[col] = row[col] || '';
  }
  
  if (type === 'CATEGORY') {
    // Remove station from category - clear it
    newRow.Station = '';
    // Categories don't have Item column
    newRow.Item = '';
    // Fix ServiceType - source may have it in wrong column due to column count mismatch
    // Get the last non-empty value which should be ServiceType
    const possibleServiceType = row.ServiceType || row.Item || '';
    newRow.ServiceType = ['restaurant', 'bar', 'both'].includes(possibleServiceType.toLowerCase()) 
      ? possibleServiceType.toLowerCase() 
      : 'restaurant';
  } else if (type === 'ITEM') {
    currentItemName = name.trim();
    
    // Get service type - handle column misalignment (ServiceType may be in Item column)
    const possibleServiceType = row.ServiceType || row.Item || '';
    const serviceType = ['restaurant', 'bar', 'both'].includes(possibleServiceType.toLowerCase()) 
      ? possibleServiceType.toLowerCase() 
      : 'restaurant';
    newRow.ServiceType = serviceType;
    newRow.Item = ''; // Items don't reference other items
    const gstVal = row.GST || row.gst || '';
    
    // Normalize station to Kitchen or Bar only
    let station = (row.Station || '').trim();
    
    // Determine if it's a bar/liquor item
    const isBarItem = serviceType === 'bar';
    
    // If it's a bar item (liquor), use Bar station and VAT
    if (isBarItem) {
      station = 'Bar';
      // For bar items, move GST value to VAT and clear GST
      newRow.VAT = gstVal;
      newRow.GST = '';
    } else {
      // All food items use Kitchen (including Tandoor, Dessert, etc.)
      station = 'Kitchen';
      newRow.GST = gstVal;
      newRow.VAT = '';
    }
    newRow.Station = station;
    
    // Set price from smallest variant if item has variants and price is 0
    const itemPrice = parseFloat(row.Price) || 0;
    if (itemPrice === 0 && itemVariants.has(currentItemName)) {
      const variants = itemVariants.get(currentItemName);
      if (variants.length > 0) {
        const minPrice = Math.min(...variants);
        newRow.Price = minPrice.toString();
      }
    }
  } else if (type === 'VARIANT') {
    // Variants don't need station
    newRow.Station = '';
    // Variants need to reference their parent item
    // The Item column may have the parent item name, or use currentItemName
    const itemRef = row.Item || currentItemName || '';
    // Don't confuse ServiceType values with item names
    newRow.Item = ['restaurant', 'bar', 'both'].includes(itemRef.toLowerCase()) ? currentItemName : itemRef;
    newRow.ServiceType = ''; // Variants don't have ServiceType
    newRow.Group = ''; // Variants don't have Group
  } else if (type === 'ADDON_GROUP') {
    // Track current addon group name for subsequent ADDON rows
    currentAddonGroup = name.trim();
    newRow.Group = ''; // ADDON_GROUP doesn't need Group reference
    newRow.Item = '';
    newRow.ServiceType = '';
  } else if (type === 'ADDON') {
    // ADDONs need Group reference - use explicit Group column or current addon group
    const groupRef = row.Group || currentAddonGroup || '';
    newRow.Group = groupRef;
    newRow.Item = '';
    newRow.ServiceType = '';
  }
  
  processedRecords.push(newRow);
}

// Generate output CSV
const lines = [newColumns.join(',')];
for (const row of processedRecords) {
  const values = newColumns.map(col => escapeCSV(row[col]));
  lines.push(values.join(','));
}
const output = lines.join('\n');

// Write output
fs.writeFileSync(outputFile, output, 'utf-8');

console.log('Template updated successfully!');
console.log(`Processed ${processedRecords.length} records`);
console.log(`Items with variants updated: ${Array.from(itemVariants.entries()).filter(([k, v]) => v.length > 0).length}`);
