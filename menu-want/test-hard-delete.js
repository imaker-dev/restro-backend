/**
 * Test Script for Outlet Hard Delete
 * WARNING: This script can permanently delete data - use with caution!
 * 
 * Usage:
 *   node menu-want/test-hard-delete.js preview <outletId>   - Preview what would be deleted
 *   node menu-want/test-hard-delete.js delete <outletId> <confirmCode>  - Actually delete (DANGEROUS!)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase } = require('../src/database');

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  const outletId = parseInt(args[1]);

  if (!action || !outletId) {
    console.log('='.repeat(70));
    console.log('OUTLET HARD DELETE TEST SCRIPT');
    console.log('='.repeat(70));
    console.log('\nUsage:');
    console.log('  Preview:  node menu-want/test-hard-delete.js preview <outletId>');
    console.log('  Delete:   node menu-want/test-hard-delete.js delete <outletId> <confirmCode>');
    console.log('\nExample:');
    console.log('  node menu-want/test-hard-delete.js preview 34');
    console.log('  node menu-want/test-hard-delete.js delete 34 TCV001');
    console.log('\n⚠️  WARNING: The delete action is IRREVERSIBLE!');
    console.log('='.repeat(70));
    process.exit(1);
  }

  try {
    await initializeDatabase();
    const outletService = require('../src/services/outlet.service');

    console.log('='.repeat(70));
    console.log('OUTLET HARD DELETE TEST');
    console.log('='.repeat(70));

    if (action === 'preview') {
      console.log(`\nGenerating deletion preview for outlet ${outletId}...\n`);
      
      const preview = await outletService.getDeletePreview(outletId);
      
      console.log('OUTLET DETAILS:');
      console.log(`  ID: ${preview.outlet.id}`);
      console.log(`  Code: ${preview.outlet.code}`);
      console.log(`  Name: ${preview.outlet.name}`);
      
      console.log('\nDATA TO BE DELETED:');
      for (const [table, count] of Object.entries(preview.tables)) {
        if (count > 0) {
          console.log(`  ${table.padEnd(25)} : ${count} rows`);
        }
      }
      
      console.log('\n' + '='.repeat(70));
      console.log(`⚠️  TOTAL: ${preview.totalRows} rows will be PERMANENTLY DELETED`);
      console.log('='.repeat(70));
      console.log(`\n${preview.warning}`);
      console.log(`\nTo proceed with deletion, run:`);
      console.log(`  node menu-want/test-hard-delete.js delete ${outletId} ${preview.outlet.code}`);
      
    } else if (action === 'delete') {
      const confirmCode = args[2];
      
      if (!confirmCode) {
        console.log('ERROR: Confirmation code required!');
        console.log('Run preview first to get the confirmation code.');
        process.exit(1);
      }
      
      console.log(`\n⚠️  DANGER: About to PERMANENTLY DELETE outlet ${outletId}!`);
      console.log('This action CANNOT be undone.\n');
      
      // First show preview
      const preview = await outletService.getDeletePreview(outletId);
      console.log(`Outlet: ${preview.outlet.name} (${preview.outlet.code})`);
      console.log(`Total rows to delete: ${preview.totalRows}`);
      console.log(`Confirmation code provided: ${confirmCode}`);
      
      // Add 5 second delay for safety
      console.log('\nStarting deletion in 5 seconds... Press Ctrl+C to abort!');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('\nExecuting hard delete...\n');
      
      const result = await outletService.hardDelete(outletId, confirmCode);
      
      console.log('='.repeat(70));
      console.log('✅ DELETION COMPLETE');
      console.log('='.repeat(70));
      console.log(`\n${result.message}`);
      console.log('\nDeleted rows per table:');
      for (const [table, count] of Object.entries(result.summary.tables)) {
        if (count > 0) {
          console.log(`  ${table.padEnd(25)} : ${count} rows deleted`);
        }
      }
      
    } else {
      console.log(`Unknown action: ${action}`);
      console.log('Use "preview" or "delete"');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
