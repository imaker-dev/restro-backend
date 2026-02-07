/**
 * Setup printer and test KOT printing flow
 * Printer: 192.168.1.13:9100
 */
require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');
const printerService = require('../services/printer.service');
const kotService = require('../services/kot.service');

const PRINTER_IP = '192.168.1.13';
const PRINTER_PORT = 9100;
const OUTLET_ID = 4;

async function setupAndTest() {
  await initializeDatabase();
  const pool = getPool();

  console.log('='.repeat(60));
  console.log('PRINTER SETUP AND KOT TEST');
  console.log('='.repeat(60));

  // 1. Test printer connectivity
  console.log('\n1. Testing printer connectivity...');
  const connectionTest = await printerService.testPrinterConnection(PRINTER_IP, PRINTER_PORT);
  console.log(`   Printer ${PRINTER_IP}:${PRINTER_PORT} - ${connectionTest.success ? 'ONLINE' : 'OFFLINE'}`);
  console.log(`   Message: ${connectionTest.message}`);

  if (!connectionTest.success) {
    console.log('\n⚠️  Printer not reachable. Please check:');
    console.log('   - Printer is powered on');
    console.log('   - Connected to network');
    console.log('   - IP address is correct');
    console.log('   - Port 9100 is accessible');
  }

  // 2. Setup/update printer in database
  console.log('\n2. Setting up printer in database...');
  
  // Check if kitchen printer exists
  const [existingPrinters] = await pool.query(
    'SELECT * FROM printers WHERE outlet_id = ? AND ip_address = ?',
    [OUTLET_ID, PRINTER_IP]
  );

  let printerId;
  if (existingPrinters.length > 0) {
    printerId = existingPrinters[0].id;
    console.log(`   Printer already exists (ID: ${printerId})`);
    // Update to ensure it's active
    await pool.query(
      'UPDATE printers SET is_active = 1, station = ? WHERE id = ?',
      ['kot_kitchen', printerId]
    );
  } else {
    // Create new printer using correct schema
    const [result] = await pool.query(
      `INSERT INTO printers (outlet_id, name, printer_type, connection_type, ip_address, port, paper_width, station, is_default, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [OUTLET_ID, 'Kitchen Printer', 'thermal', 'network', PRINTER_IP, PRINTER_PORT, '80mm', 'kot_kitchen', 1, 1]
    );
    printerId = result.insertId;
    console.log(`   Created new kitchen printer (ID: ${printerId})`);
  }

  // Also create bar printer pointing to same IP
  const [barPrinter] = await pool.query(
    'SELECT * FROM printers WHERE outlet_id = ? AND station = ?',
    [OUTLET_ID, 'kot_bar']
  );
  
  if (barPrinter.length === 0) {
    await pool.query(
      `INSERT INTO printers (outlet_id, name, printer_type, connection_type, ip_address, port, paper_width, station, is_default, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [OUTLET_ID, 'Bar Printer', 'thermal', 'network', PRINTER_IP, PRINTER_PORT, '80mm', 'kot_bar', 0, 1]
    );
    console.log('   Created bar printer');
  }

  // 3. List all printers
  console.log('\n3. Configured printers:');
  const printers = await printerService.getPrinters(OUTLET_ID);
  printers.forEach(p => {
    console.log(`   - ${p.name} (${p.station}): ${p.ip_address}:${p.port} [${p.is_active ? 'ACTIVE' : 'INACTIVE'}]`);
  });

  // 4. Test direct print (if printer is reachable)
  if (connectionTest.success) {
    console.log('\n4. Testing direct KOT print...');
    
    const testKotData = {
      kotNumber: 'TEST001',
      station: 'kitchen',
      tableNumber: 'T5',
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: [
        { itemName: 'Paneer Tikka', quantity: 2, variantName: null, instructions: null },
        { itemName: 'Butter Chicken', quantity: 1, variantName: 'Half', instructions: 'Less spicy' },
        { itemName: 'Garlic Naan', quantity: 4, variantName: null, instructions: null }
      ],
      captainName: 'Test Captain'
    };

    try {
      const printResult = await printerService.printKotDirect(testKotData, PRINTER_IP, PRINTER_PORT);
      console.log('   ✓ Test KOT printed successfully!');
      console.log(`   ${printResult.message}`);
    } catch (err) {
      console.log('   ✗ Print failed:', err.message);
    }
  }

  // 5. Show how to test full flow
  console.log('\n' + '='.repeat(60));
  console.log('SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log('\nTo test the full KOT flow:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Create an order via API');
  console.log('3. Send KOT via: POST /api/v1/orders/:orderId/kot');
  console.log('\nThe KOT will be printed directly to the thermal printer.');

  process.exit(0);
}

setupAndTest().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
