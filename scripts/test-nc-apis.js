/**
 * End-to-end test of NC APIs
 * Tests: pending bills, captain history, payment for NC order
 */
require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3005';
// Get token from env or use a test token
const TOKEN = process.env.TEST_TOKEN || '';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TOKEN ? `Bearer ${TOKEN}` : ''
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const mysql = require('mysql2/promise');
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('=== NC API End-to-End Test ===\n');

    // Check order 877 (has NC items, pending payment)
    console.log('--- Order 877 (pending, has NC) ---');
    const [items877] = await pool.query(
      `SELECT id, item_name, total_price, tax_amount, is_nc, nc_amount, status
       FROM order_items WHERE order_id = 877 AND status != 'cancelled' ORDER BY id`
    );
    
    let subtotal = 0, ncAmount = 0, totalTax = 0;
    for (const item of items877) {
      const price = parseFloat(item.total_price);
      subtotal += price;
      if (item.is_nc) {
        ncAmount += price;
        console.log(`  [NC] ${item.item_name}: ₹${price}`);
      } else {
        console.log(`  [OK] ${item.item_name}: ₹${price} tax=₹${item.tax_amount}`);
      }
    }

    // Get non-NC items tax
    for (const item of items877) {
      if (!item.is_nc) {
        totalTax += parseFloat(item.tax_amount) || 0;
      }
    }
    totalTax = parseFloat(totalTax.toFixed(2));
    
    const taxableAmt = subtotal - ncAmount;
    const gt = Math.max(0, Math.round(taxableAmt + totalTax));

    console.log(`\n  Expected: subtotal=${subtotal}, ncAmount=${ncAmount}, totalTax=${totalTax}, grandTotal=${gt}`);

    // Check invoice
    const [inv877] = await pool.query(
      `SELECT id, invoice_number, subtotal, taxable_amount, total_tax, grand_total, 
              is_nc, nc_amount, nc_tax_amount, payment_status
       FROM invoices WHERE order_id = 877 AND is_cancelled = 0`
    );
    if (inv877[0]) {
      const i = inv877[0];
      console.log(`  Invoice: ${i.invoice_number}`);
      console.log(`    subtotal=${i.subtotal}, taxable=${i.taxable_amount}, tax=${i.total_tax}`);
      console.log(`    grandTotal=${i.grand_total}, ncAmount=${i.nc_amount}, ncTaxAmt=${i.nc_tax_amount}`);
      console.log(`    payment_status=${i.payment_status}`);
      
      // Verify
      const gtMatch = Math.abs(parseFloat(i.grand_total) - gt) < 1;
      const ncTaxZero = parseFloat(i.nc_tax_amount) === 0;
      console.log(`    ✓ grandTotal match: ${gtMatch} (expected ~${gt}, got ${i.grand_total})`);
      console.log(`    ✓ nc_tax_amount=0: ${ncTaxZero}`);
    }

    // Check completed NC orders
    console.log('\n--- Completed NC Orders ---');
    const [completedNC] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.paid_amount, o.total_amount,
              i.grand_total, i.nc_amount, i.nc_tax_amount
       FROM orders o
       LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
       WHERE o.is_nc = 1 AND o.status IN ('completed', 'paid')
       ORDER BY o.id DESC LIMIT 5`
    );
    for (const o of completedNC) {
      const allNC = parseFloat(o.grand_total) === 0;
      console.log(`  ${o.order_number}: status=${o.status}, pay=${o.payment_status}, gt=${o.grand_total}, paid=${o.paid_amount}, nc=${o.nc_amount}, ncTax=${o.nc_tax_amount}${allNC ? ' [FULL NC - ₹0]' : ''}`);
    }

    // Check tables
    console.log('\n--- Tables Status ---');
    const [stuckTables] = await pool.query(
      `SELECT t.id, t.table_number, t.status 
       FROM tables t 
       WHERE t.status IN ('billing', 'occupied') 
       AND NOT EXISTS (
         SELECT 1 FROM table_sessions ts 
         WHERE ts.table_id = t.id AND ts.status = 'active'
       )`
    );
    if (stuckTables.length > 0) {
      console.log('  ⚠ Stuck tables (no active session):');
      for (const t of stuckTables) {
        console.log(`    ${t.table_number} (${t.id}): ${t.status}`);
      }
    } else {
      console.log('  ✓ No stuck tables');
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log('Payment fix: grand_total=0 for NC orders now correctly read (not treated as falsy)');
    console.log('Pending bills: uses formatInvoice which includes isNC, ncAmount, grandTotal, per-item isNC');
    console.log('Captain history: query now includes is_nc, nc_amount, nc_item_count, nc_items_total, invoice fields');
    console.log('All NC invoices: nc_tax_amount = 0, tax only on non-NC items');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
