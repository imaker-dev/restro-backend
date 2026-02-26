const fs = require('fs');
const path = require('path');

// Read source CSV
const sourceFile = path.join(__dirname, 'items_423554_2026_02_23_06_53_57.csv');
const content = fs.readFileSync(sourceFile, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());

// Parse CSV with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Get headers
const headers = parseCSVLine(lines[0]);
console.log('Source Headers:', headers.slice(0, 15).join(', '));

// Station mapping based on category
function getStation(category) {
  const catLower = category.toLowerCase();
  if (catLower.includes('beer') || catLower.includes('whisky') || catLower.includes('rum') || 
      catLower.includes('gin') || catLower.includes('vodka') || catLower.includes('taquila') ||
      catLower.includes('wine') || catLower.includes('liqour') || catLower.includes('mocktail') ||
      catLower.includes('beverage') || catLower.includes('scotch') || catLower.includes('malt') ||
      catLower.includes('irish')) {
    return 'Bar';
  }
  if (catLower.includes('tandoor') || catLower.includes('kebab')) {
    return 'Tandoor';
  }
  if (catLower.includes('dessert')) {
    return 'Dessert';
  }
  return 'Kitchen';
}

// ServiceType mapping based on category (restaurant, bar, both)
function getServiceType(category) {
  const catLower = category.toLowerCase();
  if (catLower.includes('beer') || catLower.includes('whisky') || catLower.includes('rum') || 
      catLower.includes('gin') || catLower.includes('vodka') || catLower.includes('taquila') ||
      catLower.includes('wine') || catLower.includes('liqour') || catLower.includes('scotch') || 
      catLower.includes('malt') || catLower.includes('irish')) {
    return 'bar';
  }
  if (catLower.includes('mocktail') || catLower.includes('beverage') || catLower.includes('soft')) {
    return 'both';
  }
  return 'restaurant';
}

// Normalize food type to item_type format (veg, non_veg, egg, vegan)
function normalizeItemType(foodType) {
  if (!foodType) return 'veg';
  const t = foodType.toLowerCase().trim();
  if (t === 'non_veg' || t === 'nonveg' || t === 'non-veg') return 'non_veg';
  if (t === 'vegan') return 'vegan';
  if (t === 'egg') return 'egg';
  return 'veg';
}

// Generate short name
function getShortName(name) {
  const words = name.split(' ');
  if (words.length === 1) return name.substring(0, 10);
  return words.map(w => w.substring(0, 4)).join(' ').substring(0, 15);
}

// Generate SKU
let skuCounter = {};
function getSKU(category, name) {
  const catKey = category.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
  if (!skuCounter[catKey]) skuCounter[catKey] = 1;
  return `${catKey}${String(skuCounter[catKey]++).padStart(3, '0')}`;
}

// Parse all items
const items = [];
const categories = new Set();

for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  if (cols.length < 12) continue;
  
  const item = {
    name: cols[0] || '',
    onlineName: cols[1] || '',
    description: cols[2] || '',
    shortCode: cols[3] || '',
    category: cols[8] || '',
    price: cols[10] || '0',
    foodType: cols[11] || 'veg',
    gst: cols[13] || '5',
    variationGroupName: cols[27] || '',
    variation1: cols[28] || '',
    variation1Price: cols[29] || '',
    variation2: cols[32] || '',
    variation2Price: cols[33] || ''
  };
  
  if (item.name && item.category) {
    categories.add(item.category);
    items.push(item);
  }
}

console.log(`\nParsed ${items.length} items from ${categories.size} categories`);
console.log('Categories:', Array.from(categories).join(', '));

// Generate bulk upload CSV
const output = [];

// Header - added ServiceType and ItemType columns
output.push('Type,Name,Category,Price,ItemType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item,ServiceType');

// Add categories first with ServiceType
const categoryList = Array.from(categories);
categoryList.forEach(cat => {
  const serviceType = getServiceType(cat);
  output.push(`CATEGORY,${cat},,,,,,${cat},,,,,,,,,,${serviceType}`);
});

// Add items and variants
items.forEach(item => {
  const station = getStation(item.category);
  const shortName = getShortName(item.name);
  const sku = getSKU(item.category, item.name);
  const itemType = normalizeItemType(item.foodType);
  const serviceType = getServiceType(item.category);
  const gst = item.gst || '5';
  const desc = item.description.replace(/,/g, ' ').replace(/"/g, '');
  
  // Check if item has variants (price is 0 and has variation data)
  const hasVariants = (item.price === '0' || item.price === '') && item.variation1;
  
  if (hasVariants) {
    // Item with variants - price comes from variants
    output.push(`ITEM,${item.name},${item.category},0,${itemType},${gst},${station},${desc},,${shortName},${sku},,,,,,,,${serviceType}`);
    
    // Add variants
    if (item.variation1 && item.variation1Price) {
      const var1Price = item.variation1Price.replace(/[^0-9.]/g, '') || '0';
      output.push(`VARIANT,${item.variation1},,${var1Price},,,,,,,,no,,,,,,${item.name},`);
    }
    if (item.variation2 && item.variation2Price) {
      const var2Price = item.variation2Price.replace(/[^0-9.]/g, '') || '0';
      output.push(`VARIANT,${item.variation2},,${var2Price},,,,,,,,no,,,,,,${item.name},`);
    }
  } else {
    // Regular item without variants
    const price = item.price.replace(/[^0-9.]/g, '') || '0';
    output.push(`ITEM,${item.name},${item.category},${price},${itemType},${gst},${station},${desc},,${shortName},${sku},,,,,,,,${serviceType}`);
  }
});

// Add common addon groups since addons file is empty
output.push('');
output.push('ADDON_GROUP,Spice Level,,,,,,,,,,,single,1,1,no,,');
output.push('ADDON,Mild,,0,veg,,,,,,,,,,,,Spice Level,');
output.push('ADDON,Medium,,0,veg,,,,,,,,,,,,Spice Level,');
output.push('ADDON,Spicy,,0,veg,,,,,,,,,,,,Spice Level,');
output.push('ADDON,Extra Spicy,,0,veg,,,,,,,,,,,,Spice Level,');

output.push('ADDON_GROUP,Extra Toppings,,,,,,,,,,,multiple,0,5,no,,');
output.push('ADDON,Extra Cheese,,30,veg,,,,,,,,,,,,Extra Toppings,');
output.push('ADDON,Extra Paneer,,50,veg,,,,,,,,,,,,Extra Toppings,');
output.push('ADDON,Extra Chicken,,70,nonveg,,,,,,,,,,,,Extra Toppings,');
output.push('ADDON,Extra Onion,,20,veg,,,,,,,,,,,,Extra Toppings,');

output.push('ADDON_GROUP,Cooking Style,,,,,,,,,,,single,1,1,no,,');
output.push('ADDON,Dry,,0,veg,,,,,,,,,,,,Cooking Style,');
output.push('ADDON,Gravy,,0,veg,,,,,,,,,,,,Cooking Style,');
output.push('ADDON,Semi Gravy,,0,veg,,,,,,,,,,,,Cooking Style,');

output.push('ADDON_GROUP,Bread Choice,,,,,,,,,,,single,0,1,no,,');
output.push('ADDON,With Butter Naan,,50,veg,,,,,,,,,,,,Bread Choice,');
output.push('ADDON,With Tandoori Roti,,30,veg,,,,,,,,,,,,Bread Choice,');
output.push('ADDON,With Garlic Naan,,60,veg,,,,,,,,,,,,Bread Choice,');

output.push('ADDON_GROUP,Rice Choice,,,,,,,,,,,single,0,1,no,,');
output.push('ADDON,With Jeera Rice,,159,veg,,,,,,,,,,,,Rice Choice,');
output.push('ADDON,With Plain Rice,,139,veg,,,,,,,,,,,,Rice Choice,');
output.push('ADDON,With Veg Pulao,,169,veg,,,,,,,,,,,,Rice Choice,');

// Write output
const outputFile = path.join(__dirname, 'Complete_BulkUpload.csv');
fs.writeFileSync(outputFile, output.join('\n'), 'utf-8');

console.log(`\nGenerated: ${outputFile}`);
console.log(`Total rows: ${output.length}`);

// Count stats
const stats = {
  categories: 0,
  items: 0,
  variants: 0,
  addonGroups: 0,
  addons: 0
};

output.forEach(line => {
  if (line.startsWith('CATEGORY,')) stats.categories++;
  else if (line.startsWith('ITEM,')) stats.items++;
  else if (line.startsWith('VARIANT,')) stats.variants++;
  else if (line.startsWith('ADDON_GROUP,')) stats.addonGroups++;
  else if (line.startsWith('ADDON,')) stats.addons++;
});

console.log('\nStatistics:');
console.log(`  Categories: ${stats.categories}`);
console.log(`  Items: ${stats.items}`);
console.log(`  Variants: ${stats.variants}`);
console.log(`  Addon Groups: ${stats.addonGroups}`);
console.log(`  Addons: ${stats.addons}`);
