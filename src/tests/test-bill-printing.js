/**
 * Test Bill Printing — Direct TCP to thermal printer
 * Printer: 192.168.1.13:9100
 * Tests: connectivity, bill generation print, duplicate bill print, charge update reprint
 */

require('dotenv').config();
const axios = require('axios');
const net = require('net');

const API = process.env.TEST_API_URL || 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const PRINTER_IP = '192.168.1.13';
const PRINTER_PORT = 9100;

let passed = 0, failed = 0;
const section = (title) => console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
const test = (name, condition, detail) => {
  if (condition) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
};

// TCP connectivity test
function testTcpConnection(ip, port, timeout = 3000) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timer = setTimeout(() => { client.destroy(); resolve({ success: false, error: 'timeout' }); }, timeout);
    client.connect(port, ip, () => {
      clearTimeout(timer);
      client.end();
      resolve({ success: true });
    });
    client.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  BILL PRINTING TEST — Direct TCP to Thermal Printer      ║');
  console.log('║  Printer: 192.168.1.13:9100                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // ─── LOGIN ───
  section('0. LOGIN + SETUP');

  const cashierLogin = await axios.post(`${API}/auth/login`, {
    email: 'cashier11@gmail.com', password: 'Cash@111'
  });
  const TOKEN = cashierLogin.data.data.accessToken;
  const cashier = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${TOKEN}` } });
  test('Cashier login', !!TOKEN);

  const captainLogin = await axios.post(`${API}/auth/login`, {
    email: 'captainall@gmail.com', password: 'Captain@123'
  });
  const captain = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${captainLogin.data.data.accessToken}` } });
  test('Captain login', !!captainLogin.data.data.accessToken);

  // DB setup
  const { initializeDatabase, getPool } = require('../database');
  await initializeDatabase();
  const pool = getPool();

  // Clean stale orders
  await pool.query(
    `UPDATE orders SET status='cancelled', cancelled_at=NOW()
     WHERE outlet_id=? AND status NOT IN ('paid','cancelled','completed')`, [OUTLET_ID]
  );
  await pool.query(
    `UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL
     WHERE table_id IN (SELECT id FROM tables WHERE outlet_id=?) AND status='active'`, [OUTLET_ID]
  );
  await pool.query('UPDATE tables SET status="available" WHERE outlet_id=?', [OUTLET_ID]);

  // Get available table
  const tablesRes = await captain.get(`/tables/outlet/${OUTLET_ID}`);
  const availTables = tablesRes.data.data.filter(t => t.status === 'available');
  test('Tables available', availTables.length >= 1);
  const TABLE_ID = availTables[0]?.id;

  // Get menu items
  const menuRes = await captain.get(`/menu/${OUTLET_ID}/captain`);
  const menuItems = [];
  for (const cat of (menuRes.data.data?.menu || [])) {
    for (const item of (cat.items || [])) {
      if (menuItems.length < 3 && !item.variants) {
        menuItems.push({ itemId: item.id, quantity: 2, price: item.price });
      }
    }
  }
  test('Menu items found', menuItems.length >= 2);

  // Helper: create served order
  async function createServedOrder(tableId) {
    if (tableId) {
      await pool.query(
        `UPDATE orders SET status='cancelled', cancelled_at=NOW()
         WHERE table_id=? AND status NOT IN ('paid','cancelled','completed')`, [tableId]
      );
      await pool.query(
        'UPDATE table_sessions SET status="completed", ended_at=NOW(), order_id=NULL WHERE table_id=? AND status="active"', [tableId]
      );
      await pool.query('UPDATE tables SET status="available" WHERE id=?', [tableId]);
    }
    const payload = { outletId: OUTLET_ID, orderType: 'dine_in', guestCount: 2 };
    if (tableId) payload.tableId = tableId;
    const orderRes = await captain.post('/orders', payload);
    const orderId = orderRes.data.data.id;
    await captain.post(`/orders/${orderId}/items`, { items: menuItems });
    const kotRes = await captain.post(`/orders/${orderId}/kot`);
    for (const t of (kotRes.data.data?.tickets || [])) {
      await cashier.post(`/orders/kot/${t.id}/ready`).catch(() => {});
      await captain.post(`/orders/kot/${t.id}/served`).catch(() => {});
    }
    return orderId;
  }

  // ─── 1. PRINTER CONNECTIVITY ───
  section('1. PRINTER CONNECTIVITY');

  const conn = await testTcpConnection(PRINTER_IP, PRINTER_PORT);
  test('TCP connection to 192.168.1.13:9100', conn.success, conn.error);

  if (!conn.success) {
    console.log('\n   ⚠ Printer not reachable — printing tests will test fallback behavior');
    console.log('   ⚠ Make sure printer is powered on and connected to network');
  }

  // ─── 2. VERIFY BILL PRINTER EXISTS ───
  section('2. VERIFY BILL PRINTER IN DB');

  const [dbPrinters] = await pool.query(
    "SELECT id, name, station, ip_address, port, is_active FROM printers WHERE outlet_id = ? AND station = 'bill'",
    [OUTLET_ID]
  );
  test('Bill printer found in DB', dbPrinters.length > 0);
  if (dbPrinters[0]) {
    test('Bill printer IP = 192.168.1.13', dbPrinters[0].ip_address === PRINTER_IP);
    test('Bill printer port = 9100', dbPrinters[0].port === PRINTER_PORT);
    test('Bill printer active', dbPrinters[0].is_active === 1);
    console.log(`   Printer: ${dbPrinters[0].name} @ ${dbPrinters[0].ip_address}:${dbPrinters[0].port} (station=${dbPrinters[0].station})`);
  }

  // ─── 3. CREATE ORDER + GENERATE BILL (should print) ───
  section('3. GENERATE BILL — Should print to 192.168.1.13:9100');

  let ORDER_ID, INVOICE;

  try {
    ORDER_ID = await createServedOrder(TABLE_ID);
    test('Served order created', !!ORDER_ID);
    console.log(`   Order ID: ${ORDER_ID}, Table: ${TABLE_ID}`);

    // Generate bill — THIS should trigger direct print to 192.168.1.13:9100
    console.log(`   Generating bill for order ${ORDER_ID}...`);
    const billRes = await cashier.post(`/orders/${ORDER_ID}/bill`, { applyServiceCharge: true });
    test('Bill generated', billRes.data.success);

    if (billRes.data.success) {
      INVOICE = billRes.data.data;
      console.log(`   Invoice: ${INVOICE.invoiceNumber} | Grand Total: ₹${INVOICE.grandTotal}`);
      console.log(`   Items: ${INVOICE.items?.length || 0}`);

      if (conn.success) {
        console.log(`   ✓ Bill should have printed on thermal printer at ${PRINTER_IP}:${PRINTER_PORT}`);
        console.log(`   ⏳ Check printer output — you should see the bill receipt`);
      } else {
        console.log(`   ℹ Printer offline — bill queued as print job (fallback)`);
      }

      test('Invoice has items', INVOICE.items?.length > 0);
      test('Invoice has grandTotal', INVOICE.grandTotal > 0);
      test('Invoice number format', INVOICE.invoiceNumber?.startsWith('INV/'));
    }
  } catch (e) {
    console.log(`   Error: ${e.response?.data?.message || e.message}`);
  }

  // ─── 4. DUPLICATE BILL PRINT ───
  section('4. DUPLICATE BILL — Should print with "DUPLICATE" header');

  if (INVOICE) {
    try {
      console.log(`   Printing duplicate for invoice ${INVOICE.invoiceNumber}...`);
      const dupRes = await cashier.post(`/orders/invoice/${INVOICE.id}/duplicate`, {
        reason: 'Customer requested copy'
      });
      test('Duplicate bill success', dupRes.data.success);

      if (dupRes.data.success) {
        const dup = dupRes.data.data;
        test('Duplicate: isDuplicate flag', dup.isDuplicate === true);
        test('Duplicate: has duplicate number', dup.duplicateNumber >= 1);
        console.log(`   Duplicate #${dup.duplicateNumber} for ${dup.invoiceNumber}`);

        if (conn.success) {
          console.log(`   ✓ Duplicate bill should have printed with "*** DUPLICATE BILL ***" header`);
          console.log(`   ⏳ Check printer — should see "Copy #${dup.duplicateNumber}" on receipt`);
        }
      }
    } catch (e) {
      console.log(`   Error: ${e.response?.data?.message || e.message}`);
    }

    // Second duplicate
    try {
      const dup2Res = await cashier.post(`/orders/invoice/${INVOICE.id}/duplicate`, {
        reason: 'Manager copy'
      });
      test('Second duplicate success', dup2Res.data.success);
      if (dup2Res.data.success) {
        test('Second duplicate: number = 2', dup2Res.data.data.duplicateNumber === 2);
        console.log(`   Duplicate #${dup2Res.data.data.duplicateNumber} — "Manager copy"`);
      }
    } catch (e) {
      console.log(`   Error: ${e.response?.data?.message || e.message}`);
    }
  } else {
    console.log('   Skipped — no invoice to duplicate');
  }

  // ─── 5. BILL AFTER CHARGE MODIFICATION ───
  section('5. CHARGE MODIFICATION — Verify modified bill data');

  if (INVOICE) {
    try {
      // Remove service charge
      const modRes = await cashier.put(`/orders/invoice/${INVOICE.id}/charges`, {
        removeServiceCharge: true
      });
      test('Charge modification success', modRes.data.success);

      if (modRes.data.success) {
        const modified = modRes.data.data;
        test('Service charge removed', modified.serviceCharge === 0);
        console.log(`   Modified: SC=₹${modified.serviceCharge}, GT=₹${modified.grandTotal}`);
        console.log(`   Original GT: ₹${INVOICE.grandTotal} → Modified GT: ₹${modified.grandTotal}`);
        test('Grand total reduced after SC removal', modified.grandTotal < INVOICE.grandTotal);
      }

      // Print duplicate of modified bill — should show updated amounts
      const modDupRes = await cashier.post(`/orders/invoice/${INVOICE.id}/duplicate`, {
        reason: 'Updated bill after charge modification'
      });
      test('Modified duplicate success', modDupRes.data.success);
      if (modDupRes.data.success) {
        test('Modified dup: SC = 0', modDupRes.data.data.serviceCharge === 0);
        console.log(`   Duplicate #${modDupRes.data.data.duplicateNumber} with updated charges`);
        if (conn.success) {
          console.log(`   ✓ Printer should show updated amounts (no service charge)`);
        }
      }
    } catch (e) {
      console.log(`   Error: ${e.response?.data?.message || e.message}`);
    }
  }

  // ─── 6. PAYMENT + VERIFY BILL STATUS ───
  section('6. PAYMENT — Process and verify final state');

  if (INVOICE) {
    try {
      // Get latest invoice (with modified charges)
      const latestInv = await cashier.get(`/orders/invoice/${INVOICE.id}`);
      const gt = latestInv.data.data.grandTotal;

      const payRes = await cashier.post('/orders/payment', {
        orderId: ORDER_ID,
        invoiceId: INVOICE.id,
        outletId: OUTLET_ID,
        paymentMode: 'cash',
        amount: gt
      });
      test('Payment success', payRes.data.success);
      console.log(`   Paid ₹${gt} via cash`);

      // Verify order status
      const [dbRow] = await pool.query('SELECT status, payment_status FROM orders WHERE id = ?', [ORDER_ID]);
      test('Order status = completed', dbRow[0]?.status === 'completed');
      test('Payment status = completed', dbRow[0]?.payment_status === 'completed');

      // Verify invoice payment status
      const paidInv = await cashier.get(`/orders/invoice/${INVOICE.id}`);
      test('Invoice payment_status = paid', paidInv.data.data.paymentStatus === 'paid');

      // Duplicate of paid bill should show payment mode
      const paidDup = await cashier.post(`/orders/invoice/${INVOICE.id}/duplicate`, {
        reason: 'Final receipt for customer'
      });
      test('Paid duplicate success', paidDup.data.success);
      if (paidDup.data.success && conn.success) {
        console.log(`   ✓ Final receipt should show "Payment: CASH" on printer`);
      }
    } catch (e) {
      console.log(`   Error: ${e.response?.data?.message || e.message}`);
    }
  }

  // ─── 7. CLEANUP ───
  section('7. CLEANUP');

  if (TABLE_ID) {
    await pool.query("UPDATE tables SET status = 'available' WHERE id = ?", [TABLE_ID]);
    await pool.query("UPDATE table_sessions SET status='completed', ended_at=NOW(), order_id=NULL WHERE table_id=? AND status='active'", [TABLE_ID]);
  }
  console.log('   Test data cleanup done');

  // ─── SUMMARY ───
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);

  if (conn.success) {
    console.log('\n  CHECK YOUR PRINTER — You should see:');
    console.log('     1. Original bill receipt (from step 3)');
    console.log('     2. Duplicate #1 with "*** DUPLICATE BILL ***" header');
    console.log('     3. Duplicate #2 (Manager copy)');
    console.log('     4. Duplicate #3 with modified charges (no SC)');
    console.log('     5. Duplicate #4 final receipt with "Payment: CASH"');
  }

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
})();
