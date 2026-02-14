require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');

(async () => {
  await initializeDatabase();
  const p = getPool();

  const tables = ['daily_sales', 'item_sales', 'staff_sales'];
  for (const t of tables) {
    try {
      const [r] = await p.query(`SELECT COUNT(*) as c FROM ${t} WHERE outlet_id=4`);
      console.log(`${t}: ${r[0].c} rows`);
    } catch (e) {
      console.log(`${t}: TABLE NOT FOUND - ${e.message}`);
    }
  }

  const [payments] = await p.query('SELECT COUNT(*) as c FROM payments WHERE outlet_id=4');
  const [invoices] = await p.query('SELECT COUNT(*) as c FROM invoices WHERE outlet_id=4 AND is_cancelled=0');
  const [orders] = await p.query('SELECT COUNT(*) as c FROM orders WHERE outlet_id=4 AND status IN ("paid","completed")');
  const [cancels] = await p.query('SELECT COUNT(*) as c FROM order_cancel_logs ocl JOIN orders o ON ocl.order_id=o.id WHERE o.outlet_id=4');

  console.log(`payments: ${payments[0].c}`);
  console.log(`invoices: ${invoices[0].c}`);
  console.log(`paid/completed orders: ${orders[0].c}`);
  console.log(`cancel_logs: ${cancels[0].c}`);

  // Check date range of data
  const [dateRange] = await p.query('SELECT MIN(DATE(created_at)) as minD, MAX(DATE(created_at)) as maxD FROM orders WHERE outlet_id=4');
  console.log(`orders date range: ${dateRange[0].minD} to ${dateRange[0].maxD}`);

  const [invDates] = await p.query('SELECT MIN(invoice_date) as minD, MAX(invoice_date) as maxD FROM invoices WHERE outlet_id=4 AND is_cancelled=0');
  console.log(`invoices date range: ${invDates[0].minD} to ${invDates[0].maxD}`);

  const [payDates] = await p.query('SELECT MIN(DATE(created_at)) as minD, MAX(DATE(created_at)) as maxD FROM payments WHERE outlet_id=4');
  console.log(`payments date range: ${payDates[0].minD} to ${payDates[0].maxD}`);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
