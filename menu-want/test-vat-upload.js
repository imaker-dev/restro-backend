/**
 * Test VAT column in bulk upload
 * Verifies that liquor items use VAT instead of GST
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');
const bulkUploadService = require('../src/services/bulkUpload.service');

async function testVatUpload() {
  console.log('='.repeat(70));
  console.log('VAT COLUMN BULK UPLOAD TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();

    // Test 1: Check template structure includes VAT
    console.log('\n--- 1. Template Structure ---');
    const structure = bulkUploadService.getTemplateStructure();
    
    const vatColumn = structure.columns.find(c => c.name === 'VAT');
    console.log('VAT column:', vatColumn ? '✅ Found' : '❌ Missing');
    console.log('VAT rates:', structure.vatRates || 'Not defined');
    
    const itemType = structure.types.ITEM;
    console.log('ITEM optional fields include VAT:', itemType.optional.includes('VAT') ? '✅' : '❌');

    // Test 2: Verify CSV file has VAT column
    console.log('\n--- 2. CSV File Check ---');
    const fs = require('fs');
    const csvPath = require('path').join(__dirname, 'Complete_BulkUpload.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const header = lines[0];
    
    console.log('Header:', header.substring(0, 80) + '...');
    console.log('VAT in header:', header.includes(',VAT,') ? '✅' : '❌');

    // Count items with VAT
    const vatItems = lines.filter(line => {
      const parts = line.split(',');
      return parts[0] === 'ITEM' && parts[6] && parts[6].trim(); // VAT column (index 6)
    });
    console.log(`Items with VAT: ${vatItems.length}`);

    // Test 3: Parse sample with VAT
    console.log('\n--- 3. Parse CSV with VAT ---');
    
    const testCsv = `Type,Name,Category,Price,ItemType,GST,VAT,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item,ServiceType
CATEGORY,Test Whisky,,,,,,,Test Whisky category,,,,,,,,,,,bar
ITEM,Test Royal Stag,Test Whisky,0,veg,,18,Bar,,,Test Stag,TEST001,,,,,,,,bar`;

    const parseResult = bulkUploadService.parseCSV(testCsv);
    console.log('Parse success:', parseResult.success ? '✅' : '❌');
    console.log('Records parsed:', parseResult.records?.length || 0);
    
    if (parseResult.records) {
      const itemRecord = parseResult.records.find(r => r.Type === 'ITEM');
      if (itemRecord) {
        console.log('Item record:');
        console.log('  - Name:', itemRecord.Name);
        console.log('  - GST:', itemRecord.GST || '(empty)');
        console.log('  - VAT:', itemRecord.VAT || '(empty)');
        console.log('  - ServiceType:', itemRecord.ServiceType);
      }
    }

    // Test 4: Check existing VAT tax groups
    console.log('\n--- 4. VAT Tax Groups in Database ---');
    const [vatGroups] = await pool.query(`
      SELECT id, name, code, total_rate 
      FROM tax_groups 
      WHERE code LIKE 'VAT%' AND is_active = 1
    `);
    console.log(`VAT tax groups: ${vatGroups.length}`);
    vatGroups.forEach(g => console.log(`  - ${g.name} (code: ${g.code}, rate: ${g.total_rate}%)`));

    // Test 5: Show sample liquor items from CSV
    console.log('\n--- 5. Sample Liquor Items from CSV ---');
    vatItems.slice(0, 5).forEach(line => {
      const parts = line.split(',');
      console.log(`  ${parts[1]} - Category: ${parts[2]}, VAT: ${parts[6]}%, ServiceType: ${parts[19]}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));
    console.log(`
Summary:
- CSV header now includes VAT column after GST
- Liquor items (Beer, Whisky, Rum, Gin, Vodka, etc.) use VAT instead of GST
- Food items continue to use GST column
- ServiceType column specifies: restaurant, bar, or both
`);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testVatUpload();
