/**
 * Complete Order Lifecycle Test
 * Tests: Order → KOT → Kitchen Print → Modify → Serve → Bill → Bill Print
 * 
 * Printer: 192.168.1.13:9100 (ESC/POS thermal printer)
 */

const net = require('net');
const axios = require('axios');

// ========================
// CONFIGURATION
// ========================

const CONFIG = {
  API_URL: 'http://localhost:3000/api/v1',
  PRINTER_IP: '192.168.1.13',
  PRINTER_PORT: 9100,
  
  // Test credentials
  ADMIN_EMAIL: 'admin@restropos.com',
  ADMIN_PASSWORD: 'admin123'
};

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';
const ESCPOS = {
  INIT: ESC + '@',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT: ESC + 'a\x00',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  DOUBLE_ON: GS + '!\x11',
  DOUBLE_OFF: GS + '!\x00',
  CUT: GS + 'V\x00',
  FEED: ESC + 'd\x03',
  LINE: '================================\n'
};

let authToken = null;
let testData = {
  outletId: null,
  tableId: null,
  orderId: null,
  kotId: null,
  invoiceId: null
};

// ========================
// PRINTER FUNCTIONS
// ========================

function sendToPrinter(content) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(10000);

    console.log(`\n📠 Sending to printer ${CONFIG.PRINTER_IP}:${CONFIG.PRINTER_PORT}...`);

    client.connect(CONFIG.PRINTER_PORT, CONFIG.PRINTER_IP, () => {
      console.log('   ✅ Connected to printer');
      client.write(content);
      client.end();
    });

    client.on('close', () => {
      console.log('   ✅ Print job sent successfully');
      resolve();
    });

    client.on('error', (err) => {
      console.error(`   ❌ Printer error: ${err.message}`);
      reject(err);
    });

    client.on('timeout', () => {
      console.error('   ❌ Printer connection timeout');
      client.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

function formatKotReceipt(data) {
  let receipt = ESCPOS.INIT;
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += ESCPOS.BOLD_ON;
  receipt += ESCPOS.DOUBLE_ON;
  receipt += data.station === 'bar' ? 'BAR ORDER\n' : 'KITCHEN ORDER\n';
  receipt += ESCPOS.DOUBLE_OFF;
  receipt += ESCPOS.LINE;
  receipt += ESCPOS.BOLD_OFF;
  receipt += ESCPOS.ALIGN_LEFT;
  
  receipt += `KOT #: ${data.kotNumber}\n`;
  receipt += `Table: ${data.tableNumber}    Time: ${data.time}\n`;
  receipt += `Order #: ${data.orderNumber}\n`;
  receipt += '--------------------------------\n';
  
  receipt += ESCPOS.BOLD_ON;
  for (const item of data.items) {
    receipt += `${item.quantity} x ${item.itemName}\n`;
    if (item.variantName) {
      receipt += ESCPOS.BOLD_OFF;
      receipt += `   (${item.variantName})\n`;
      receipt += ESCPOS.BOLD_ON;
    }
    if (item.instructions) {
      receipt += ESCPOS.BOLD_OFF;
      receipt += `   >> ${item.instructions}\n`;
      receipt += ESCPOS.BOLD_ON;
    }
  }
  receipt += ESCPOS.BOLD_OFF;
  
  receipt += '--------------------------------\n';
  receipt += `Captain: ${data.captainName}\n`;
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += ESCPOS.LINE;
  receipt += ESCPOS.FEED;
  receipt += ESCPOS.CUT;
  
  return receipt;
}

function formatBillReceipt(data) {
  let receipt = ESCPOS.INIT;
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += ESCPOS.BOLD_ON;
  receipt += ESCPOS.DOUBLE_ON;
  receipt += `${data.outletName}\n`;
  receipt += ESCPOS.DOUBLE_OFF;
  receipt += ESCPOS.BOLD_OFF;
  
  if (data.outletAddress) {
    receipt += `${data.outletAddress}\n`;
  }
  if (data.outletGstin) {
    receipt += `GSTIN: ${data.outletGstin}\n`;
  }
  receipt += ESCPOS.LINE;
  
  receipt += ESCPOS.ALIGN_LEFT;
  receipt += `Invoice: ${data.invoiceNumber}\n`;
  receipt += `Date: ${data.date}  Time: ${data.time}\n`;
  receipt += `Table: ${data.tableNumber}\n`;
  receipt += '--------------------------------\n';
  
  // Items
  for (const item of data.items) {
    receipt += `${item.itemName}\n`;
    receipt += `  ${item.quantity} x ${item.unitPrice} = Rs.${item.totalPrice}\n`;
  }
  
  receipt += '--------------------------------\n';
  receipt += `Subtotal:          Rs.${data.subtotal}\n`;
  
  // Taxes
  if (data.taxes && data.taxes.length > 0) {
    for (const tax of data.taxes) {
      receipt += `${tax.name} (${tax.rate}%): Rs.${tax.amount}\n`;
    }
  }
  
  if (data.serviceCharge) {
    receipt += `Service Charge:    Rs.${data.serviceCharge}\n`;
  }
  
  if (data.discount) {
    receipt += `Discount:         -Rs.${data.discount}\n`;
  }
  
  receipt += '--------------------------------\n';
  receipt += ESCPOS.BOLD_ON;
  receipt += ESCPOS.DOUBLE_ON;
  receipt += `GRAND TOTAL: Rs.${data.grandTotal}\n`;
  receipt += ESCPOS.DOUBLE_OFF;
  receipt += ESCPOS.BOLD_OFF;
  receipt += ESCPOS.LINE;
  
  if (data.paymentMode) {
    receipt += `Payment: ${data.paymentMode}\n\n`;
  }
  
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += 'Thank you for dining with us!\n';
  receipt += ESCPOS.LINE;
  receipt += ESCPOS.FEED;
  receipt += ESCPOS.CUT;
  
  return receipt;
}

// ========================
// API FUNCTIONS
// ========================

async function login() {
  console.log('\n🔐 Logging in...');
  try {
    const response = await axios.post(`${CONFIG.API_URL}/auth/login`, {
      email: CONFIG.ADMIN_EMAIL,
      password: CONFIG.ADMIN_PASSWORD
    });
    authToken = response.data.data.accessToken;
    testData.userId = response.data.data.user?.id;
    console.log('   ✅ Logged in successfully');
    console.log(`   User ID: ${testData.userId}`);
    return true;
  } catch (error) {
    console.error('   ❌ Login failed:', error.response?.data?.message || error.message);
    return false;
  }
}

function api() {
  return axios.create({
    baseURL: CONFIG.API_URL,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });
}

async function getTestData() {
  console.log('\n📋 Fetching test data...');
  
  // Get outlet
  const outlets = await api().get('/outlets');
  testData.outletId = outlets.data.data[0]?.id;
  console.log(`   Outlet ID: ${testData.outletId}`);
  
  // Get available table
  const tables = await api().get(`/tables/outlet/${testData.outletId}`);
  const availableTable = tables.data.data.find(t => t.status === 'available');
  testData.tableId = availableTable?.id;
  testData.tableNumber = availableTable?.table_number;
  console.log(`   Table: ${testData.tableNumber} (ID: ${testData.tableId})`);
  
  // Get menu items
  const menu = await api().get(`/menu/items/outlet/${testData.outletId}?limit=10`);
  testData.menuItems = menu.data.data.items || menu.data.data;
  console.log(`   Menu items available: ${testData.menuItems?.length || 0}`);
  
  return testData.outletId && testData.tableId;
}

// ========================
// TEST STEPS
// ========================

async function step1_CreateOrder() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 1: CREATE ORDER');
  console.log('='.repeat(50));
  
  // Select items for order
  const items = testData.menuItems.slice(0, 3).map((item, index) => ({
    itemId: item.id,
    quantity: index + 1,
    specialInstructions: index === 0 ? 'Extra spicy' : null
  }));
  
  testData.orderItems = items;
  
  console.log('   Items to add:');
  items.forEach(item => {
    const menuItem = testData.menuItems.find(m => m.id === item.itemId);
    console.log(`   - ${item.quantity}x ${menuItem?.name || 'Item ' + item.itemId}`);
  });
  
  try {
    // Step 1a: Create empty order
    console.log('\n   Creating order...');
    const response = await api().post('/orders', {
      outletId: testData.outletId,
      tableId: testData.tableId,
      orderType: 'dine_in',
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      guestCount: 2,
      specialInstructions: 'Test order for lifecycle verification'
    });
    
    testData.orderId = response.data.data.id;
    testData.orderNumber = response.data.data.order_number;
    console.log(`   ✅ Order created: ${testData.orderNumber} (ID: ${testData.orderId})`);
    
    // Step 1b: Add items to order
    console.log('\n   Adding items to order...');
    const itemsResponse = await api().post(`/orders/${testData.orderId}/items`, {
      items: items
    });
    
    console.log(`   ✅ Items added: ${items.length} items`);
    
    return true;
  } catch (error) {
    console.error('   ❌ Order creation failed:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function step2_SendKotAndPrint() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 2: SEND KOT TO KITCHEN');
  console.log('='.repeat(50));
  
  try {
    const response = await api().post(`/orders/${testData.orderId}/kot`);
    const tickets = response.data.data.tickets;
    
    console.log(`   ✅ KOT sent: ${tickets.length} ticket(s) created`);
    
    // Print each KOT
    for (const ticket of tickets) {
      testData.kotId = ticket.id;
      testData.kotNumber = ticket.kotNumber;
      
      console.log(`\n   📋 KOT #${ticket.kotNumber} for ${ticket.station}`);
      console.log(`      Items: ${ticket.itemCount}`);
      
      // Format and print KOT
      const kotReceipt = formatKotReceipt({
        kotNumber: ticket.kotNumber,
        orderNumber: testData.orderNumber,
        tableNumber: testData.tableNumber,
        station: ticket.station,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: ticket.items.map(i => ({
          itemName: i.name,
          quantity: i.quantity,
          variantName: i.variant,
          instructions: i.instructions
        })),
        captainName: 'Admin'
      });
      
      await sendToPrinter(kotReceipt);
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ KOT send failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function step3_ModifyOrderAndPrint() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 3: MODIFY ORDER (Add Items)');
  console.log('='.repeat(50));
  
  // Add more items to the order
  const newItem = testData.menuItems[testData.menuItems.length - 1];
  if (!newItem) {
    console.log('   ⚠️ No additional items to add, skipping...');
    return true;
  }
  
  try {
    console.log(`   Adding: 2x ${newItem.name}`);
    
    const response = await api().post(`/orders/${testData.orderId}/items`, {
      items: [{
        itemId: newItem.id,
        quantity: 2,
        specialInstructions: 'Added after initial order'
      }]
    });
    
    console.log('   ✅ Items added to order');
    
    // Send new KOT for added items
    console.log('   Sending KOT for new items...');
    const kotResponse = await api().post(`/orders/${testData.orderId}/kot`);
    const tickets = kotResponse.data.data.tickets;
    
    if (tickets && tickets.length > 0) {
      for (const ticket of tickets) {
        console.log(`\n   📋 New KOT #${ticket.kotNumber} for ${ticket.station}`);
        
        const kotReceipt = formatKotReceipt({
          kotNumber: ticket.kotNumber,
          orderNumber: testData.orderNumber,
          tableNumber: testData.tableNumber,
          station: ticket.station,
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          items: ticket.items.map(i => ({
            itemName: i.name,
            quantity: i.quantity,
            variantName: i.variant,
            instructions: 'Added after initial order'
          })),
          captainName: 'Admin'
        });
        
        await sendToPrinter(kotReceipt);
      }
    } else {
      console.log('   ℹ️ No new pending items to send KOT');
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Order modification failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function step4_KitchenProcessItems() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 4: KITCHEN PROCESSES ITEMS');
  console.log('='.repeat(50));
  
  try {
    // Get KOT details
    const kotResponse = await api().get(`/orders/${testData.orderId}/kots`);
    const kots = kotResponse.data.data;
    
    for (const kot of kots) {
      console.log(`\n   Processing KOT #${kot.kot_number}...`);
      
      // Accept KOT
      console.log('   → Accepting KOT...');
      await api().post(`/orders/kot/${kot.id}/accept`);
      console.log('   ✅ KOT Accepted');
      
      // Start preparing
      console.log('   → Starting preparation...');
      await api().post(`/orders/kot/${kot.id}/preparing`);
      console.log('   ✅ KOT Preparing');
      
      // Mark ready
      console.log('   → Marking as ready...');
      await api().post(`/orders/kot/${kot.id}/ready`);
      console.log('   ✅ KOT Ready');
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Kitchen processing failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function step5_ServeItems() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 5: SERVE ITEMS TO TABLE');
  console.log('='.repeat(50));
  
  try {
    // Get KOTs and mark as served
    const kotResponse = await api().get(`/orders/${testData.orderId}/kots`);
    const kots = kotResponse.data.data;
    
    for (const kot of kots) {
      console.log(`   Serving KOT #${kot.kot_number}...`);
      await api().post(`/orders/kot/${kot.id}/served`);
      console.log(`   ✅ KOT #${kot.kot_number} served`);
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Serving failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function step6_GenerateBillAndPrint() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 6: GENERATE BILL');
  console.log('='.repeat(50));
  
  try {
    const response = await api().post(`/orders/${testData.orderId}/bill`, {
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      applyServiceCharge: true
    });
    
    const invoice = response.data.data;
    testData.invoiceId = invoice.id;
    testData.invoiceNumber = invoice.invoice_number;
    
    console.log(`   ✅ Bill generated: ${invoice.invoice_number}`);
    console.log('\n   📊 Bill Summary:');
    console.log(`      Subtotal:       Rs.${parseFloat(invoice.subtotal).toFixed(2)}`);
    console.log(`      CGST:           Rs.${parseFloat(invoice.cgst_amount || 0).toFixed(2)}`);
    console.log(`      SGST:           Rs.${parseFloat(invoice.sgst_amount || 0).toFixed(2)}`);
    console.log(`      Service Charge: Rs.${parseFloat(invoice.service_charge || 0).toFixed(2)}`);
    console.log(`      ─────────────────────────`);
    console.log(`      GRAND TOTAL:    Rs.${parseFloat(invoice.grand_total).toFixed(2)}`);
    
    // Build taxes array
    const taxes = [];
    if (invoice.cgst_amount > 0) {
      taxes.push({ name: 'CGST', rate: '2.5', amount: parseFloat(invoice.cgst_amount).toFixed(2) });
    }
    if (invoice.sgst_amount > 0) {
      taxes.push({ name: 'SGST', rate: '2.5', amount: parseFloat(invoice.sgst_amount).toFixed(2) });
    }
    if (invoice.vat_amount > 0) {
      taxes.push({ name: 'VAT', rate: '5', amount: parseFloat(invoice.vat_amount).toFixed(2) });
    }
    
    // Get order items for bill
    const orderResponse = await api().get(`/orders/${testData.orderId}`);
    const order = orderResponse.data.data;
    
    // Format and print bill
    const billReceipt = formatBillReceipt({
      outletName: 'RestroPos Restaurant',
      outletAddress: 'Test Address, City',
      outletGstin: '29ABCDE1234F1Z5',
      invoiceNumber: invoice.invoice_number,
      date: new Date().toLocaleDateString('en-IN'),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      tableNumber: testData.tableNumber,
      items: (order.items || []).filter(i => i.status !== 'cancelled').map(item => ({
        itemName: item.item_name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price).toFixed(2),
        totalPrice: parseFloat(item.total_price).toFixed(2)
      })),
      subtotal: parseFloat(invoice.subtotal).toFixed(2),
      taxes: taxes,
      serviceCharge: invoice.service_charge > 0 ? parseFloat(invoice.service_charge).toFixed(2) : null,
      discount: invoice.discount_amount > 0 ? parseFloat(invoice.discount_amount).toFixed(2) : null,
      grandTotal: parseFloat(invoice.grand_total).toFixed(2),
      paymentMode: null
    });
    
    await sendToPrinter(billReceipt);
    
    return true;
  } catch (error) {
    console.error('   ❌ Bill generation failed:', error.response?.data?.message || error.message);
    console.error('   Details:', error.response?.data);
    return false;
  }
}

async function step7_ProcessPayment() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 7: PROCESS PAYMENT');
  console.log('='.repeat(50));
  
  try {
    // Get invoice to get grand total
    const invoiceResponse = await api().get(`/orders/${testData.orderId}/invoice`);
    const invoice = invoiceResponse.data.data;
    
    console.log(`   Invoice ID: ${invoice?.id}, Grand Total: ${invoice?.grand_total}`);
    
    const response = await api().post(`/orders/payment`, {
      orderId: testData.orderId,
      invoiceId: testData.invoiceId,
      outletId: testData.outletId,
      paymentMode: 'cash',
      amount: parseFloat(invoice.grand_total),
      reference: 'CASH-' + Date.now()
    });
    
    console.log(`   ✅ Payment processed: Rs.${parseFloat(invoice.grand_total).toFixed(2)}`);
    console.log(`   Payment Mode: CASH`);
    
    return true;
  } catch (error) {
    console.error('   ❌ Payment failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function step8_CompleteOrder() {
  console.log('\n' + '='.repeat(50));
  console.log('STEP 8: COMPLETE ORDER & RESET TABLE');
  console.log('='.repeat(50));
  
  try {
    // Check order status
    const orderResponse = await api().get(`/orders/${testData.orderId}`);
    const order = orderResponse.data.data;
    
    console.log(`   Order Status: ${order.status}`);
    console.log(`   Payment Status: ${order.payment_status || 'N/A'}`);
    
    // Check table status
    const tableResponse = await api().get(`/tables/${testData.tableId}`);
    const table = tableResponse.data.data;
    
    console.log(`   Table Status: ${table.status}`);
    
    console.log('\n   ✅ Order lifecycle complete!');
    
    return true;
  } catch (error) {
    console.error('   ❌ Completion check failed:', error.response?.data?.message || error.message);
    return false;
  }
}

// ========================
// MAIN TEST RUNNER
// ========================

async function runTests() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       COMPLETE ORDER LIFECYCLE TEST                      ║');
  console.log('║       Printer: 192.168.1.13:9100                         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Testing:                                                ║');
  console.log('║  1. Order Creation                                       ║');
  console.log('║  2. KOT Generation → Kitchen Print                       ║');
  console.log('║  3. Order Modification → New KOT Print                   ║');
  console.log('║  4. Kitchen Processing (Accept → Prepare → Ready)        ║');
  console.log('║  5. Items Served                                         ║');
  console.log('║  6. Bill Generation → Bill Print                         ║');
  console.log('║  7. Payment Processing                                   ║');
  console.log('║  8. Order Completion                                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  const results = [];
  
  // Test printer connection first
  console.log('\n🔌 Testing printer connection...');
  try {
    await sendToPrinter(ESCPOS.INIT + 'Printer Test\n' + ESCPOS.CUT);
    console.log('   ✅ Printer is reachable');
  } catch (error) {
    console.error('   ❌ Cannot connect to printer. Please check:');
    console.error(`      - Printer IP: ${CONFIG.PRINTER_IP}`);
    console.error(`      - Printer Port: ${CONFIG.PRINTER_PORT}`);
    console.error('      - Printer is powered on and connected to network');
    return;
  }
  
  // Login
  if (!await login()) {
    console.error('\n❌ Cannot proceed without authentication');
    return;
  }
  
  // Get test data
  if (!await getTestData()) {
    console.error('\n❌ Cannot proceed without test data (outlet/table)');
    return;
  }
  
  // Run all steps
  const steps = [
    { name: 'Create Order', fn: step1_CreateOrder },
    { name: 'Send KOT & Print', fn: step2_SendKotAndPrint },
    { name: 'Modify Order & Print', fn: step3_ModifyOrderAndPrint },
    { name: 'Kitchen Process', fn: step4_KitchenProcessItems },
    { name: 'Serve Items', fn: step5_ServeItems },
    { name: 'Generate Bill & Print', fn: step6_GenerateBillAndPrint },
    { name: 'Process Payment', fn: step7_ProcessPayment },
    { name: 'Complete Order', fn: step8_CompleteOrder }
  ];
  
  for (const step of steps) {
    try {
      const success = await step.fn();
      results.push({ name: step.name, success });
      
      if (!success) {
        console.log(`\n⚠️ Step "${step.name}" had issues, continuing...`);
      }
    } catch (error) {
      console.error(`\n❌ Step "${step.name}" threw error:`, error.message);
      results.push({ name: step.name, success: false, error: error.message });
    }
  }
  
  // Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  
  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const name = result.name.padEnd(35);
    console.log(`║  ${name} ${status}          ║`);
  }
  
  console.log('╠══════════════════════════════════════════════════════════╣');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  console.log(`║  Total: ${passed}/${total} passed                                     ║`);
  console.log(`║  Duration: ${duration}s                                        ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  console.log('\n📝 Test Data Summary:');
  console.log(`   Order ID: ${testData.orderId}`);
  console.log(`   Order Number: ${testData.orderNumber}`);
  console.log(`   Invoice Number: ${testData.invoiceNumber}`);
  console.log(`   Table: ${testData.tableNumber}`);
}

// Run
runTests().catch(console.error);
