/**
 * Convert TCV Menu CSV to Bulk Upload Format
 * 
 * Source: TCV_Menu_Full_Items.csv (complex multi-column layout)
 * Target: Bulk upload format with Type, Name, Category, Price, FoodType, GST, Station
 */

const fs = require('fs');
const path = require('path');

// Station mapping based on category type
const STATION_MAP = {
  // Bar/Beverages
  'BEVERAGE': 'Bar',
  'MOCKTAIL': 'Bar',
  'SHAKES': 'Bar',
  'MOCKTAIL & SHAKES': 'Bar',
  
  // Kitchen stations - Soups
  'SOUP': 'Kitchen',
  'CHINESE VEG SOUPS': 'Kitchen',
  'CHINESE NON-VEG SOUPS': 'Kitchen',
  
  // Kitchen stations - Chinese
  'CHINESE VEG STARTER': 'Kitchen',
  'CHINESE NON VEG STARTER': 'Kitchen',
  
  // Kitchen stations - Western
  'PIZZA': 'Kitchen',
  'PASTA': 'Kitchen',
  'PIZZA & PASTA': 'Kitchen',
  'BURGER': 'Kitchen',
  'SANDWICH': 'Kitchen',
  'BURGER & SANDWICH': 'Kitchen',
  
  // Tandoor station
  'TANDOOR': 'Tandoor',
  'TANDOOR VEG STARTER': 'Tandoor',
  'TANDOOR NON VEG STARTER': 'Tandoor',
  'BREAD': 'Tandoor',
  'BREADS': 'Tandoor',
  
  // Kitchen stations - Indian
  'MAINCOURSE': 'Kitchen',
  'MAINCOURSE VEG': 'Kitchen',
  'MAINCOURSE NON VEG': 'Kitchen',
  'DAL': 'Kitchen',
  'KHUSHBU-E-BASMATI': 'Kitchen',
  'RICE': 'Kitchen',
  'BIRIYANI': 'Kitchen',
  'RAITA': 'Kitchen',
  'ACCOMPANIMENTS': 'Kitchen',
  
  // Desserts
  'DESSERT': 'Dessert',
  'DESSERTS': 'Dessert'
};

// Food type detection based on category or item name
function detectFoodType(categoryName, itemName) {
  const cat = categoryName.toUpperCase();
  const item = itemName.toUpperCase();
  
  // Non-veg categories
  if (cat.includes('NON VEG') || cat.includes('NON-VEG')) return 'nonveg';
  if (cat.includes('CHICKEN') || cat.includes('MUTTON') || cat.includes('FISH')) return 'nonveg';
  
  // Check item name
  if (item.includes('CHICKEN') || item.includes('MUTTON') || item.includes('FISH') || 
      item.includes('PRAWN') || item.includes('LAMB')) return 'nonveg';
  if (item.includes('EGG ') || item.startsWith('EGG') || item.includes(' EGG')) return 'egg';
  
  return 'veg';
}

// Get station for category
function getStation(categoryName) {
  const cat = categoryName.toUpperCase().trim();
  for (const [key, station] of Object.entries(STATION_MAP)) {
    if (cat.includes(key) || key.includes(cat)) return station;
  }
  return 'Kitchen'; // default
}

// Parse the complex CSV - handles dual-column menu layout
function parseSourceMenu(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim());
  
  const items = [];
  let currentLeftCategory = null;
  let currentRightCategory = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const cols = line.split(',').map(c => c.trim());
    
    // Skip header row
    if (cols[0] === 'Unnamed: 0' || cols[0] === 'THE CITY VIEW') continue;
    
    // === CATEGORY DETECTION ===
    // Left category: Check cols[0] or cols[1] for category name (all caps, no number)
    const col0 = cols[0] || '';
    const col1 = cols[1] || '';
    
    // Category in col[0] (e.g., "BEVERAGE ,,,,,,MOCKTAIL & SHAKES,,")
    if (col0 && isNaN(parseInt(col0)) && col0.length > 2 && col0.toUpperCase() === col0) {
      currentLeftCategory = col0.replace(/['"]/g, '').trim();
    }
    // Category in col[1] with empty col[0] (e.g., ",CHINESE VEG STARTER,,,,,CHINESE NON VEG STARTER,,")
    else if (!col0 && col1 && col1.toUpperCase() === col1 && col1.length > 3) {
      currentLeftCategory = col1.replace(/['"]/g, '').trim();
      // If only left category declared and no right category on this line, right follows left
      if (!cols[5] && !cols[6]) {
        currentRightCategory = currentLeftCategory;
      }
    }
    
    // Right category: Check cols[5] or cols[6] for category name
    const col5 = cols[5] || '';
    const col6 = cols[6] || '';
    
    if (col5 && isNaN(parseInt(col5)) && col5.length > 3 && col5.toUpperCase() === col5) {
      let rightCat = col5.replace(/['"]/g, '').trim();
      // Fix: "TANDOOR VEG STARTER" on right side should be "TANDOOR NON VEG STARTER"
      if (rightCat === 'TANDOOR VEG STARTER' && currentLeftCategory === 'TANDOOR VEG STARTER') {
        rightCat = 'TANDOOR NON VEG STARTER';
      }
      currentRightCategory = rightCat;
    } else if (col6 && isNaN(parseInt(col6)) && col6.length > 3 && col6.toUpperCase() === col6 && !cols[7] && !cols[8]) {
      let rightCat = col6.replace(/['"]/g, '').trim();
      if (rightCat === 'TANDOOR VEG STARTER' && currentLeftCategory === 'TANDOOR VEG STARTER') {
        rightCat = 'TANDOOR NON VEG STARTER';
      }
      currentRightCategory = rightCat;
    }
    
    // === LEFT SIDE ITEMS ===
    // Format: cols[0]=number, cols[1]=name, cols[2]=price or cols[2]=SINGLE price, cols[3]=FAMILY price
    const leftNum = parseInt(cols[0]);
    if (!isNaN(leftNum) && leftNum > 0 && cols[1]) {
      const name = cols[1].replace(/['"]/g, '').trim();
      let price = parseFloat(cols[3]) || parseFloat(cols[2]) || 0;
      let singlePrice = null;
      let familyPrice = null;
      
      // Check for variant prices (SINGLE/FAMILY columns - happens in MAINCOURSE NON VEG)
      if (cols[2] && cols[3] && !isNaN(parseFloat(cols[2])) && !isNaN(parseFloat(cols[3]))) {
        singlePrice = parseFloat(cols[2]);
        familyPrice = parseFloat(cols[3]);
        price = 0;
      }
      
      // Check for half/full prices (e.g., "379/599")
      const priceStr = cols[3] || cols[2] || '';
      if (priceStr.includes('/')) {
        const [p1, p2] = priceStr.split('/').map(p => parseFloat(p.trim()));
        if (!isNaN(p1) && !isNaN(p2)) {
          singlePrice = p1;
          familyPrice = p2;
          price = 0;
        }
      }
      
      if (name && currentLeftCategory) {
        items.push({
          name,
          category: currentLeftCategory,
          price,
          singlePrice,
          familyPrice,
          foodType: detectFoodType(currentLeftCategory, name),
          station: getStation(currentLeftCategory)
        });
      }
    }
    
    // === RIGHT SIDE ITEMS ===
    // Format 1: cols[5]=number, cols[6]=name, cols[7]=price or cols[7]=SINGLE, cols[8]=FAMILY
    // Format 2: cols[5]=empty, cols[6]=name, cols[7]=empty, cols[8]=price (BURGER & SANDWICH style)
    const rightNum = parseInt(cols[5]);
    const hasRightNum = !isNaN(rightNum) && rightNum > 0;
    const rightName = cols[6] || '';
    const rightNameClean = rightName.replace(/['"]/g, '').trim();
    const rightHasPrice = cols[7] || cols[8];
    
    // Check if this is a valid right-side item
    // Either: has number in cols[5] OR has name and price (for BURGER & SANDWICH format)
    const isRightItem = (hasRightNum && rightNameClean) || 
                        (rightNameClean && rightNameClean.length > 2 && rightHasPrice);
    
    if (isRightItem && rightNameClean && currentRightCategory) {
      let price = parseFloat(cols[8]) || parseFloat(cols[7]) || 0;
      let singlePrice = null;
      let familyPrice = null;
      
      // Check for variant prices (both cols[7] and cols[8] are numbers)
      if (cols[7] && cols[8] && !isNaN(parseFloat(cols[7])) && !isNaN(parseFloat(cols[8]))) {
        singlePrice = parseFloat(cols[7]);
        familyPrice = parseFloat(cols[8]);
        price = 0;
      }
      
      // Check for half/full prices (e.g., "379/599")
      const priceStr = cols[8] || cols[7] || '';
      if (priceStr.includes('/')) {
        const [p1, p2] = priceStr.split('/').map(p => parseFloat(p.trim()));
        if (!isNaN(p1) && !isNaN(p2)) {
          singlePrice = p1;
          familyPrice = p2;
          price = 0;
        }
      }
      
      // Add item (price > 0 means it's an item, not a category header)
      if (price > 0 || singlePrice || familyPrice) {
        items.push({
          name: rightNameClean,
          category: currentRightCategory,
          price,
          singlePrice,
          familyPrice,
          foodType: detectFoodType(currentRightCategory, rightNameClean),
          station: getStation(currentRightCategory)
        });
      }
    }
    
    // === SPECIAL: Handle right-side items with number in cols[4] ===
    // Format: cols[4]=number, cols[5]=name, cols[6]=empty, cols[7]=price
    if (cols[4] && !isNaN(parseInt(cols[4])) && cols[5] && parseInt(cols[4]) > 0) {
      const name = cols[5].replace(/['"]/g, '').trim();
      const price = parseFloat(cols[7]) || parseFloat(cols[6]) || 0;
      
      // Skip if it's a category name or already captured
      if (name && name.toUpperCase() !== name && currentRightCategory) {
        const exists = items.some(it => it.name === name && it.category === currentRightCategory);
        if (!exists) {
          items.push({
            name,
            category: currentRightCategory,
            price,
            singlePrice: null,
            familyPrice: null,
            foodType: detectFoodType(currentRightCategory, name),
            station: getStation(currentRightCategory)
          });
        }
      }
    }
  }
  
  return items;
}

// Generate bulk upload CSV
function generateBulkUploadCSV(items) {
  const header = 'Type,Name,Category,Price,FoodType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item';
  const rows = [header];
  
  // Group items by category
  const categories = new Map();
  for (const item of items) {
    if (!categories.has(item.category)) {
      categories.set(item.category, []);
    }
    categories.get(item.category).push(item);
  }
  
  let skuCounter = 1;
  
  // Add categories and items
  for (const [catName, catItems] of categories) {
    // Skip empty categories
    if (!catName || catItems.length === 0) continue;
    
    // Determine parent category
    let parent = '';
    const catUpper = catName.toUpperCase();
    if (catUpper.includes('VEG') && !catUpper.includes('NON')) parent = 'Vegetarian';
    else if (catUpper.includes('NON VEG') || catUpper.includes('NON-VEG')) parent = 'Non-Vegetarian';
    else if (catUpper.includes('BEVERAGE') || catUpper.includes('MOCKTAIL') || catUpper.includes('SHAKE')) parent = 'Beverages';
    else if (catUpper.includes('DESSERT')) parent = 'Desserts';
    
    // Add category row
    rows.push(`CATEGORY,"${catName}",,,,,"${getStation(catName)}",,"${parent}",,,,,,,,,`);
    
    // Add items
    for (const item of catItems) {
      const sku = `TCV${String(skuCounter++).padStart(4, '0')}`;
      const shortName = item.name.substring(0, 15).trim();
      
      if (item.singlePrice && item.familyPrice) {
        // Item with variants
        rows.push(`ITEM,"${item.name}","${catName}",0,${item.foodType},5,"${item.station}",,,${shortName},${sku},,,,,,,`);
        rows.push(`VARIANT,Single,,${item.singlePrice},,,,,,,${sku}-S,yes,,,,,"${item.name}"`);
        rows.push(`VARIANT,Family,,${item.familyPrice},,,,,,,${sku}-F,no,,,,,"${item.name}"`);
      } else if (item.name.includes('/')) {
        // Item with dry/gravy variants (e.g., "CHILLI PANEER DRY/GRAVY")
        const baseName = item.name.replace(/\s*(DRY\/GRAVY|DRY|GRAVY)\s*/gi, '').trim();
        rows.push(`ITEM,"${baseName}","${catName}",0,${item.foodType},5,"${item.station}",,,${shortName},${sku},,,,,,,`);
        rows.push(`VARIANT,Dry,,${item.price},,,,,,,${sku}-D,yes,,,,,"${baseName}"`);
        rows.push(`VARIANT,Gravy,,${item.price},,,,,,,${sku}-G,no,,,,,"${baseName}"`);
      } else {
        // Simple item
        rows.push(`ITEM,"${item.name}","${catName}",${item.price},${item.foodType},5,"${item.station}",,,${shortName},${sku},,,,,,,`);
      }
    }
    
    // Add empty line for readability
    rows.push('');
  }
  
  return rows.join('\n');
}

// Main execution
const sourceFile = path.join(__dirname, 'TCV_Menu_Full_Items.csv');
const outputFile = path.join(__dirname, 'TCV_BulkUpload.csv');

console.log('Parsing source menu...');
const items = parseSourceMenu(sourceFile);
console.log(`Found ${items.length} items`);

// Show category breakdown
const catCounts = {};
items.forEach(item => {
  catCounts[item.category] = (catCounts[item.category] || 0) + 1;
});
console.log('\nCategory breakdown:');
Object.entries(catCounts).forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count} items`);
});

console.log('\nGenerating bulk upload CSV...');
const csvContent = generateBulkUploadCSV(items);
fs.writeFileSync(outputFile, csvContent, 'utf-8');
console.log(`Output written to: ${outputFile}`);

// Also output a summary
console.log('\n=== STATION SUMMARY ===');
const stationCounts = {};
items.forEach(item => {
  stationCounts[item.station] = (stationCounts[item.station] || 0) + 1;
});
Object.entries(stationCounts).forEach(([station, count]) => {
  console.log(`  ${station}: ${count} items`);
});
