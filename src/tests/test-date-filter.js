const mysql = require('mysql2/promise');
require('dotenv').config();

async function testDateFilter() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('=== Date Filter Analysis ===\n');

  // Check timezone setting
  const [tzResult] = await conn.query('SELECT @@session.time_zone as tz');
  console.log('MySQL timezone:', tzResult[0].tz);

  // Check order dates in both UTC and IST
  console.log('\n--- Orders by date (UTC vs IST) ---');
  const [dates] = await conn.query(`
    SELECT 
      DATE(created_at) as utc_date,
      DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) as ist_date,
      COUNT(*) as orders
    FROM orders 
    WHERE outlet_id = 43 
    GROUP BY utc_date, ist_date
    ORDER BY utc_date
  `);
  dates.forEach(d => console.log('UTC:', d.utc_date, '| IST:', d.ist_date, '| Orders:', d.orders));

  // Compare filtering with and without timezone conversion
  console.log('\n--- Item counts for Mar 1-7 ---');
  
  const [withoutTZ] = await conn.query(`
    SELECT COUNT(DISTINCT oi.item_id) as items, SUM(oi.quantity) as qty 
    FROM order_items oi 
    JOIN orders o ON oi.order_id = o.id 
    WHERE o.outlet_id = 43 AND DATE(o.created_at) BETWEEN '2026-03-01' AND '2026-03-07'
  `);
  console.log('Without TZ conversion (UTC):', 'items=', withoutTZ[0].items, 'qty=', withoutTZ[0].qty);

  const [withTZ] = await conn.query(`
    SELECT COUNT(DISTINCT oi.item_id) as items, SUM(oi.quantity) as qty 
    FROM order_items oi 
    JOIN orders o ON oi.order_id = o.id 
    WHERE o.outlet_id = 43 AND DATE(CONVERT_TZ(o.created_at, '+00:00', '+05:30')) BETWEEN '2026-03-01' AND '2026-03-07'
  `);
  console.log('With TZ conversion (IST):   ', 'items=', withTZ[0].items, 'qty=', withTZ[0].qty);

  const [allTime] = await conn.query(`
    SELECT COUNT(DISTINCT oi.item_id) as items, SUM(oi.quantity) as qty 
    FROM order_items oi 
    JOIN orders o ON oi.order_id = o.id 
    WHERE o.outlet_id = 43
  `);
  console.log('All time (no filter):       ', 'items=', allTime[0].items, 'qty=', allTime[0].qty);

  await conn.end();
}

testDateFilter().catch(console.error);
