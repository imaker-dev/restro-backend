/**
 * Update Complete_BulkUpload.csv to add VAT column for liquor items
 */

const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'Complete_BulkUpload.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

// Liquor categories that should use VAT instead of GST
const liquorCategories = [
  'beer', 'whisky', 'rum', 'gin', 'vodka', 'taquila', 'liqour', 'liquor',
  'wine', 'single malt', 'irish', 'blended scotch'
];

const isLiquorCategory = (category) => {
  if (!category) return false;
  const lower = category.toLowerCase();
  return liquorCategories.some(lc => lower.includes(lc));
};

const updatedLines = lines.map((line, index) => {
  if (index === 0) {
    // Header already updated
    return line;
  }
  
  if (!line.trim()) return line;
  
  // Parse the CSV line (simple split, assumes no commas in values)
  const parts = line.split(',');
  
  // Current format: Type,Name,Category,Price,ItemType,GST,VAT,Station,...
  // But old data has: Type,Name,Category,Price,ItemType,GST,Station,...
  // So we need to insert VAT after GST
  
  const type = parts[0];
  const name = parts[1];
  const category = parts[2];
  const price = parts[3];
  const itemType = parts[4];
  const gst = parts[5];
  // parts[6] onwards is now shifted because header has VAT
  
  // Check if this line already has the extra column (20 columns vs 19)
  // New header has 20 columns, old data has 19
  if (parts.length === 19) {
    // Old format - need to insert VAT column
    const isLiquor = isLiquorCategory(category);
    
    if (type === 'ITEM' && isLiquor && gst) {
      // Move GST value to VAT, clear GST
      const newParts = [
        parts[0], parts[1], parts[2], parts[3], parts[4],
        '', // GST (empty for liquor)
        gst, // VAT (use the old GST value)
        ...parts.slice(6) // Rest of the columns
      ];
      return newParts.join(',');
    } else {
      // Non-liquor - add empty VAT column
      const newParts = [
        parts[0], parts[1], parts[2], parts[3], parts[4], parts[5],
        '', // VAT (empty for non-liquor)
        ...parts.slice(6) // Rest of the columns
      ];
      return newParts.join(',');
    }
  }
  
  // Already has 20 columns, just update liquor items
  if (parts.length === 20) {
    const isLiquor = isLiquorCategory(category);
    if (type === 'ITEM' && isLiquor && gst && !parts[6]) {
      parts[6] = gst; // Move GST to VAT
      parts[5] = ''; // Clear GST
      return parts.join(',');
    }
  }
  
  return line;
});

fs.writeFileSync(csvPath, updatedLines.join('\n'));
console.log('CSV updated with VAT column');
console.log(`Total lines: ${lines.length}`);

// Verify by showing liquor items
const result = updatedLines.filter(line => {
  const parts = line.split(',');
  return parts[6] && parts[6].trim(); // Has VAT value
});
console.log(`\nLines with VAT: ${result.length}`);
result.slice(0, 5).forEach(line => console.log(line.substring(0, 100)));
