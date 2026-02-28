/**
 * Fix Complete_BulkUpload.csv - Move addon group names from Required column to Group column
 */
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'Complete_BulkUpload.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

// Header is first line
const header = lines[0];
const headerCols = header.split(',');

// Find column indices
const typeIdx = headerCols.findIndex(c => c.toLowerCase() === 'type');
const requiredIdx = headerCols.findIndex(c => c.toLowerCase() === 'required');
const groupIdx = headerCols.findIndex(c => c.toLowerCase() === 'group');

console.log('Header columns:', headerCols.length);
console.log('Type index:', typeIdx, 'Required index:', requiredIdx, 'Group index:', groupIdx);

let fixedCount = 0;
const fixedLines = [header];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) {
    fixedLines.push(line);
    continue;
  }

  // Parse CSV line (handle quoted values)
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cols.push(current);

  // Ensure we have enough columns
  while (cols.length < headerCols.length) {
    cols.push('');
  }

  const type = (cols[typeIdx] || '').toUpperCase().trim();
  
  // Fix ADDON rows where Group is empty but Required has the group name
  if (type === 'ADDON' && !cols[groupIdx] && cols[requiredIdx]) {
    cols[groupIdx] = cols[requiredIdx];
    cols[requiredIdx] = '';
    fixedCount++;
  }

  fixedLines.push(cols.join(','));
}

fs.writeFileSync(csvPath, fixedLines.join('\n'));
console.log(`Fixed ${fixedCount} ADDON rows - moved group name from Required to Group column`);

// Verify
const verifyContent = fs.readFileSync(csvPath, 'utf-8');
const verifyLines = verifyContent.split('\n');
const addonLines = verifyLines.filter(l => l.startsWith('ADDON,'));
console.log('\nVerification - first 3 ADDON rows:');
addonLines.slice(0, 3).forEach((l, i) => {
  const cols = l.split(',');
  console.log(`${i+1}. Name: ${cols[1]} | Group: ${cols[groupIdx]} | Required: ${cols[requiredIdx]}`);
});
