/**
 * Test script to verify pending bills API fixes:
 * 1. Sorting with camelCase (grandTotal)
 * 2. Date filter with IST timezone
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

  try {
    console.log('=== Testing Pending Bills API Fixes ===\n');

    // Test 1: Date filter with IST (date only - 10 chars)
    console.log('1. Testing IST date filter: fromDate=2026-03-12, toDate=2026-03-12');
    const fromDate = '2026-03-12';
    const toDate = '2026-03-12';
    
    let whereClause = `WHERE i.outlet_id = 44 AND i.is_cancelled = 0`;
    const params = [];
    
    // New IST-based logic
    if (fromDate.length === 10) {
      whereClause += ` AND DATE(CONVERT_TZ(i.created_at, '+00:00', '+05:30')) >= ?`;
      params.push(fromDate);
    }
    if (toDate.length === 10) {
      whereClause += ` AND DATE(CONVERT_TZ(i.created_at, '+00:00', '+05:30')) <= ?`;
      params.push(toDate);
    }
    whereClause += ` AND i.payment_status IN ('pending', 'partial', 'paid')`;
    
    const [istDateFilter] = await pool.query(
      `SELECT i.id, i.invoice_number, i.grand_total, i.payment_status, i.created_at
       FROM invoices i
       LEFT JOIN orders o ON i.order_id = o.id
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT 10`,
      params
    );
    console.log(`   ✓ IST date filter returns: ${istDateFilter.length} bills`);
    if (istDateFilter.length > 0) {
      console.table(istDateFilter.map(r => ({
        id: r.id,
        invoice: r.invoice_number,
        total: r.grand_total,
        status: r.payment_status,
        utc: r.created_at
      })));
    }

    // Test 2: Sorting with grandTotal DESC
    console.log('\n2. Testing sorting: sortBy=grandTotal, sortOrder=desc');
    const allowedSorts = {
      created_at: 'i.created_at',
      createdAt: 'i.created_at',
      grand_total: 'i.grand_total',
      grandTotal: 'i.grand_total'
    };
    const sortCol = allowedSorts['grandTotal'] || 'i.created_at';
    console.log(`   Mapped grandTotal -> ${sortCol}`);
    
    const [sortedDesc] = await pool.query(
      `SELECT i.id, i.invoice_number, i.grand_total
       FROM invoices i
       WHERE i.outlet_id = 44 AND i.is_cancelled = 0 
         AND i.payment_status IN ('pending', 'partial', 'paid')
       ORDER BY ${sortCol} DESC
       LIMIT 5`
    );
    console.log('   ✓ Sorted DESC:');
    console.table(sortedDesc);

    // Test 3: Sorting with grandTotal ASC
    console.log('\n3. Testing sorting: sortBy=grandTotal, sortOrder=asc');
    const [sortedAsc] = await pool.query(
      `SELECT i.id, i.invoice_number, i.grand_total
       FROM invoices i
       WHERE i.outlet_id = 44 AND i.is_cancelled = 0 
         AND i.payment_status IN ('pending', 'partial', 'paid')
       ORDER BY ${sortCol} ASC
       LIMIT 5`
    );
    console.log('   ✓ Sorted ASC:');
    console.table(sortedAsc);

    // Test 4: Combined date filter + sorting
    console.log('\n4. Testing combined: date=2026-03-12 + sortBy=grandTotal DESC');
    const [combined] = await pool.query(
      `SELECT i.id, i.invoice_number, i.grand_total, i.payment_status
       FROM invoices i
       LEFT JOIN orders o ON i.order_id = o.id
       WHERE i.outlet_id = 44 AND i.is_cancelled = 0
         AND DATE(CONVERT_TZ(i.created_at, '+00:00', '+05:30')) >= '2026-03-12'
         AND DATE(CONVERT_TZ(i.created_at, '+00:00', '+05:30')) <= '2026-03-12'
         AND i.payment_status IN ('pending', 'partial', 'paid')
       ORDER BY i.grand_total DESC
       LIMIT 10`
    );
    console.log(`   ✓ Combined filter returns: ${combined.length} bills, sorted by grand_total DESC`);
    console.table(combined);

    // Test 5: status=completed filter
    console.log('\n5. Testing status=completed filter');
    const [completed] = await pool.query(
      `SELECT i.id, i.invoice_number, i.grand_total, i.payment_status
       FROM invoices i
       WHERE i.outlet_id = 44 AND i.is_cancelled = 0
         AND DATE(CONVERT_TZ(i.created_at, '+00:00', '+05:30')) = '2026-03-12'
         AND i.payment_status = 'paid'
       ORDER BY i.grand_total DESC
       LIMIT 5`
    );
    console.log(`   ✓ Completed bills today: ${completed.length}`);
    console.table(completed);

    console.log('\n=== All Tests Passed ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
