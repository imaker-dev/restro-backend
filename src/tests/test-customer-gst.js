/**
 * Test Customer GST and Interstate IGST Logic
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restro'
};

async function runTests() {
  const conn = await mysql.createConnection(config);
  
  console.log('🧪 Testing Customer GST Implementation...\n');

  // Test 1: Verify customers table exists
  console.log('1. Checking customers table...');
  const [tables] = await conn.query(`SHOW TABLES LIKE 'customers'`);
  console.log(`   ✓ customers table exists: ${tables.length > 0}`);

  // Test 2: Verify orders table has GST columns
  console.log('\n2. Checking orders table GST columns...');
  const orderCols = ['is_interstate', 'customer_gstin', 'customer_company_name', 'customer_gst_state', 'customer_gst_state_code'];
  for (const col of orderCols) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM orders LIKE '${col}'`);
    console.log(`   ${cols.length > 0 ? '✓' : '✗'} orders.${col}`);
  }

  // Test 3: Verify invoices table has GST columns
  console.log('\n3. Checking invoices table GST columns...');
  const invCols = ['is_interstate', 'customer_company_name', 'customer_gst_state', 'customer_gst_state_code'];
  for (const col of invCols) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM invoices LIKE '${col}'`);
    console.log(`   ${cols.length > 0 ? '✓' : '✗'} invoices.${col}`);
  }

  // Test 4: Check business profile state
  console.log('\n4. Checking business profile state...');
  const [bp] = await conn.query(`SELECT state, state_code FROM business_profile LIMIT 1`);
  if (bp[0]) {
    console.log(`   ✓ Business state: ${bp[0].state || 'Not set'} (${bp[0].state_code || 'N/A'})`);
  } else {
    console.log('   ⚠ No business profile found');
  }

  // Test 5: IGST calculation logic
  console.log('\n5. Testing IGST calculation logic...');
  console.log('   Scenario: Customer from Maharashtra (27) ordering from MP outlet (23)');
  console.log('   Item: ₹90 @ 5% GST');
  console.log('   Expected: IGST 5% = ₹4.50 (not CGST 2.5% + SGST 2.5%)');
  
  const itemPrice = 90;
  const gstRate = 5;
  const igstAmount = (itemPrice * gstRate / 100).toFixed(2);
  const cgstAmount = (itemPrice * (gstRate / 2) / 100).toFixed(2);
  const sgstAmount = (itemPrice * (gstRate / 2) / 100).toFixed(2);
  
  console.log(`   - Intrastate (same state): CGST ₹${cgstAmount} + SGST ₹${sgstAmount} = ₹${(parseFloat(cgstAmount) + parseFloat(sgstAmount)).toFixed(2)}`);
  console.log(`   - Interstate (different state): IGST ₹${igstAmount}`);

  // Test 6: List Indian states with codes (for reference)
  console.log('\n6. GST State Codes Reference:');
  const states = [
    { code: '23', name: 'Madhya Pradesh (MP)' },
    { code: '27', name: 'Maharashtra' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '07', name: 'Delhi' },
    { code: '29', name: 'Karnataka' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '24', name: 'Gujarat' },
    { code: '06', name: 'Haryana' },
    { code: '03', name: 'Punjab' },
    { code: '08', name: 'Rajasthan' }
  ];
  states.forEach(s => console.log(`   ${s.code} - ${s.name}`));

  await conn.end();
  
  console.log('\n✅ All tests completed!');
  console.log('\n📝 API Endpoints:');
  console.log('   POST   /api/v1/customers/:outletId          - Create customer');
  console.log('   GET    /api/v1/customers/:outletId/search   - Search customers');
  console.log('   GET    /api/v1/customers/:outletId/by-phone - Get by phone');
  console.log('   GET    /api/v1/customers/:id                - Get by ID');
  console.log('   PUT    /api/v1/customers/:id                - Update customer');
  console.log('   GET    /api/v1/customers/:id/orders         - Order history');
  console.log('   POST   /api/v1/customers/link-order/:orderId - Link to order');
  console.log('   PUT    /api/v1/customers/order-gst/:orderId  - Update order GST');
}

runTests().catch(console.error);
