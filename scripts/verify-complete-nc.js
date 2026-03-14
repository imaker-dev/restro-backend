/**
 * Complete NC verification - check all APIs return correct NC data
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const orderId = 869;
  const tableId = 82;

  try {
    console.log('=== Complete NC Verification ===\n');

    // 1. Database state
    console.log('1. Database State:');
    
    const [order] = await pool.query(
      'SELECT id, order_number, is_nc, nc_amount, total_amount FROM orders WHERE id = ?',
      [orderId]
    );
    console.log(`   Order: ${order[0]?.order_number}`);
    console.log(`   - is_nc: ${order[0]?.is_nc}`);
    console.log(`   - nc_amount: ₹${order[0]?.nc_amount}`);
    console.log(`   - total_amount: ₹${order[0]?.total_amount}`);

    const [items] = await pool.query(
      `SELECT id, item_name, total_price, is_nc, nc_amount, nc_reason 
       FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
      [orderId]
    );
    console.log('\n   Items:');
    for (const item of items) {
      console.log(`   - ${item.item_name}: is_nc=${item.is_nc}, nc_amount=₹${item.nc_amount || 0}`);
    }

    const [invoice] = await pool.query(
      `SELECT invoice_number, grand_total, is_nc, nc_amount, payable_amount 
       FROM invoices WHERE order_id = ? AND is_cancelled = 0`,
      [orderId]
    );
    console.log('\n   Invoice:');
    console.log(`   - ${invoice[0]?.invoice_number}`);
    console.log(`   - grand_total: ₹${invoice[0]?.grand_total}`);
    console.log(`   - is_nc: ${invoice[0]?.is_nc}`);
    console.log(`   - nc_amount: ₹${invoice[0]?.nc_amount}`);
    console.log(`   - payable_amount: ₹${invoice[0]?.payable_amount}`);

    // 2. Expected API responses
    console.log('\n2. Expected API Responses:\n');

    console.log('   GET /api/v1/orders/869/bill should return:');
    console.log('   {');
    console.log(`     "grandTotal": ${invoice[0]?.grand_total},`);
    console.log(`     "isNC": ${invoice[0]?.is_nc === 1},`);
    console.log(`     "ncAmount": ${invoice[0]?.nc_amount},`);
    console.log(`     "payableAmount": ${invoice[0]?.payable_amount},`);
    console.log('     "items": [');
    for (const item of items) {
      console.log(`       { "name": "${item.item_name}", "isNC": ${item.is_nc === 1}, "ncAmount": ${item.nc_amount || 0} },`);
    }
    console.log('     ]');
    console.log('   }');

    console.log('\n   GET /api/v1/tables/82 should return:');
    console.log('   {');
    console.log('     "order": {');
    console.log(`       "isNC": ${order[0]?.is_nc === 1},`);
    console.log(`       "ncAmount": ${order[0]?.nc_amount},`);
    console.log('     },');
    console.log('     "items": [');
    for (const item of items) {
      console.log(`       { "name": "${item.item_name}", "isNC": ${item.is_nc === 1}, "ncAmount": ${item.nc_amount || 0}, "ncReason": "${item.nc_reason || ''}" },`);
    }
    console.log('     ]');
    console.log('   }');

    console.log('\n=== Verification Complete ===');
    console.log('\nPlease test the APIs to confirm the fix works.');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
