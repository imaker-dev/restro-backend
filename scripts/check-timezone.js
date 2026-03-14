require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    // 1. Check MySQL timezone settings
    const [tz] = await pool.query("SELECT @@global.time_zone as global_tz, @@session.time_zone as session_tz");
    console.log('MySQL timezone:', JSON.stringify(tz[0]));

    // 2. Check NOW() vs UTC
    const [times] = await pool.query("SELECT NOW() as now_ts, UTC_TIMESTAMP() as utc_ts");
    console.log('NOW():', times[0].now_ts, '| UTC:', times[0].utc_ts);

    // 3. Check recent orders with date comparisons
    const [orders] = await pool.query(`
      SELECT id, order_number, created_at, 
        DATE(created_at) as date_only,
        DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) as ist_from_utc,
        DATE(CONVERT_TZ(created_at, @@session.time_zone, '+05:30')) as ist_from_session
      FROM orders 
      WHERE outlet_id = 44 
      ORDER BY id DESC LIMIT 10
    `);
    console.log('\nRecent orders (outlet 44):');
    orders.forEach(r => {
      console.log(`  ${r.order_number}: created_at=${r.created_at} | DATE()=${r.date_only} | IST_from_UTC=${r.ist_from_utc} | IST_from_session=${r.ist_from_session}`);
    });

    // 4. Check how many orders fall on 2026-03-14 with different date methods
    const [counts] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN DATE(created_at) = '2026-03-14' THEN 1 ELSE 0 END) as by_date,
        SUM(CASE WHEN DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = '2026-03-14' THEN 1 ELSE 0 END) as by_ist_from_utc,
        SUM(CASE WHEN DATE(CONVERT_TZ(created_at, @@session.time_zone, '+05:30')) = '2026-03-14' THEN 1 ELSE 0 END) as by_ist_from_session
      FROM orders WHERE outlet_id = 44 AND status != 'cancelled'
    `);
    console.log('\nOrder counts for 2026-03-14:');
    console.log('  DATE(created_at):', counts[0].by_date);
    console.log('  CONVERT_TZ(UTC->IST):', counts[0].by_ist_from_utc);
    console.log('  CONVERT_TZ(session->IST):', counts[0].by_ist_from_session);

    // 5. Check orders that differ between methods
    const [diff] = await pool.query(`
      SELECT order_number, created_at, 
        DATE(created_at) as date_only,
        DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) as ist_date
      FROM orders 
      WHERE outlet_id = 44 
        AND DATE(created_at) != DATE(CONVERT_TZ(created_at, '+00:00', '+05:30'))
      ORDER BY created_at DESC LIMIT 10
    `);
    console.log('\nOrders where DATE() != IST date:');
    if (diff.length === 0) console.log('  (none - timestamps are likely already in IST)');
    diff.forEach(r => console.log(`  ${r.order_number}: created_at=${r.created_at} DATE()=${r.date_only} IST=${r.ist_date}`));

    // 6. Check is_nc flag issues
    const [ncIssues] = await pool.query(`
      SELECT o.id, o.order_number, o.is_nc, o.nc_amount, o.subtotal,
        COUNT(oi.id) as total_items,
        SUM(CASE WHEN oi.is_nc = 1 THEN 1 ELSE 0 END) as nc_items,
        SUM(CASE WHEN oi.is_nc = 0 THEN 1 ELSE 0 END) as non_nc_items,
        SUM(CASE WHEN oi.is_nc = 1 THEN 0 ELSE oi.total_price END) as calc_subtotal
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id AND oi.status != 'cancelled'
      WHERE o.outlet_id = 44 AND o.is_nc = 1
      GROUP BY o.id
    `);
    console.log('\nOrders with is_nc=1:');
    ncIssues.forEach(r => {
      const status = r.non_nc_items > 0 ? 'WRONG (partial NC)' : 'OK (all NC)';
      console.log(`  ${r.order_number}: ${r.nc_items}/${r.total_items} NC items, subtotal=${r.subtotal}, calc_subtotal=${r.calc_subtotal} [${status}]`);
    });

  } finally {
    await pool.end();
  }
})();
