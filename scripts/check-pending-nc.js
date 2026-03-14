require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const p = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // Find pending NC orders (billed but not paid)
  const [rows] = await p.query(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.is_nc, o.nc_amount, 
            o.total_amount, o.table_id,
            i.id as inv_id, i.grand_total, i.payment_status as inv_pay
     FROM orders o
     LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
     WHERE o.is_nc = 1 AND o.status = 'billed' AND i.payment_status = 'pending'
     LIMIT 5`
  );

  if (!rows.length) {
    console.log('No pending NC orders found');
    
    // Show order 877 which should be pending
    const [r877] = await p.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.is_nc, o.nc_amount,
              o.total_amount, o.table_id, o.table_session_id,
              i.id as inv_id, i.grand_total, i.nc_amount as inv_nc, i.payment_status as inv_pay
       FROM orders o
       LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
       WHERE o.id = 877`
    );
    if (r877[0]) {
      console.log('\nOrder 877:', JSON.stringify(r877[0], null, 2));
    }
  } else {
    for (const r of rows) {
      console.log(JSON.stringify(r, null, 2));
    }
  }

  // Also check table status for order 877
  const [t877] = await p.query(
    `SELECT o.table_id, t.table_number, t.status as table_status,
            ts.id as session_id, ts.status as session_status
     FROM orders o
     LEFT JOIN tables t ON o.table_id = t.id
     LEFT JOIN table_sessions ts ON o.table_session_id = ts.id
     WHERE o.id = 877`
  );
  if (t877[0]) {
    console.log('\nOrder 877 table/session:', JSON.stringify(t877[0], null, 2));
  }

  await p.end();
})();
