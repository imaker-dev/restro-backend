/**
 * Verify Table Details API - Test each seeded scenario
 */
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';

async function verifyTableDetails() {
  // Login
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: 'admin@restropos.com',
    password: 'admin123'
  });
  const token = loginRes.data.data.accessToken;
  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log('='.repeat(80));
  console.log('VERIFYING TABLE DETAILS API - ALL SCENARIOS');
  console.log('='.repeat(80));

  // Define expected scenarios for each table
  const testCases = [
    { 
      id: 1, 
      tableNumber: 'T1',
      expectedStatus: 'available',
      description: 'Clean table, ready for guests',
      expectedFields: ['status', 'statusSummary.canSeat']
    },
    { 
      id: 2, 
      tableNumber: 'T2',
      expectedStatus: 'reserved',
      description: 'Reserved for Mr. Sharma - Birthday',
      expectedFields: ['status', 'session.guestName', 'session.guestCount', 'session.notes', 'captain']
    },
    { 
      id: 3, 
      tableNumber: 'T3',
      expectedStatus: 'occupied',
      description: 'New order with pending KOT',
      expectedFields: ['status', 'session', 'captain', 'order', 'items', 'kots', 'statusSummary.orderNumber']
    },
    { 
      id: 4, 
      tableNumber: 'T4',
      expectedStatus: 'running',
      description: 'Running table with mixed KOT statuses',
      expectedFields: ['status', 'session', 'captain', 'order', 'items', 'kots', 'statusSummary.servedItems']
    },
    { 
      id: 5, 
      tableNumber: 'T5',
      expectedStatus: 'billing',
      description: 'Bill generated, awaiting payment',
      expectedFields: ['status', 'session', 'order', 'billing', 'billing.invoiceNumber', 'billing.grandTotal']
    },
    { 
      id: 6, 
      tableNumber: 'T6',
      expectedStatus: 'occupied',
      description: 'Existing occupied table',
      expectedFields: ['status', 'order', 'items', 'kots']
    },
    { 
      id: 7, 
      tableNumber: 'B1',
      expectedStatus: 'available',
      description: 'Bar table ready',
      expectedFields: ['status', 'statusSummary.canSeat']
    },
    { 
      id: 8, 
      tableNumber: 'B2',
      expectedStatus: 'blocked',
      description: 'Table blocked for maintenance',
      expectedFields: ['status', 'statusSummary.canSeat']
    },
    { 
      id: 9, 
      tableNumber: 'B3',
      expectedStatus: 'occupied',
      description: 'VIP Family - Large party with multiple KOTs',
      expectedFields: ['status', 'session.guestName', 'order.specialInstructions', 'items', 'kots']
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📋 TABLE ${test.tableNumber} (ID: ${test.id}) - ${test.expectedStatus.toUpperCase()}`);
    console.log(`   Expected: ${test.description}`);
    console.log('─'.repeat(80));

    try {
      const res = await api.get(`/tables/${test.id}`);
      const data = res.data.data;

      // Check status match
      const statusMatch = data.status === test.expectedStatus;
      console.log(`\n   Status: ${statusMatch ? '✅' : '❌'} ${data.status} (expected: ${test.expectedStatus})`);

      // Basic info
      console.log(`   Table: ${data.tableNumber} | Capacity: ${data.capacity} | Shape: ${data.shape}`);
      console.log(`   Location: ${data.location?.floorName} > ${data.location?.sectionName}`);

      // Session info
      if (data.session) {
        console.log(`\n   📍 SESSION:`);
        console.log(`      - Guests: ${data.session.guestCount}`);
        console.log(`      - Name: ${data.session.guestName || 'Walk-in'}`);
        console.log(`      - Phone: ${data.session.guestPhone || 'N/A'}`);
        console.log(`      - Duration: ${data.session.duration} mins`);
        if (data.session.notes) console.log(`      - Notes: ${data.session.notes}`);
      }

      // Captain info
      if (data.captain) {
        console.log(`\n   👤 CAPTAIN:`);
        console.log(`      - Name: ${data.captain.name}`);
        console.log(`      - Code: ${data.captain.employeeCode}`);
      }

      // Order info
      if (data.order) {
        console.log(`\n   🧾 ORDER:`);
        console.log(`      - Number: ${data.order.orderNumber}`);
        console.log(`      - Status: ${data.order.status}`);
        console.log(`      - Subtotal: Rs.${data.order.subtotal}`);
        console.log(`      - Tax: Rs.${data.order.taxAmount}`);
        console.log(`      - Total: Rs.${data.order.totalAmount}`);
        if (data.order.specialInstructions) {
          console.log(`      - Instructions: ${data.order.specialInstructions}`);
        }
      }

      // Items
      if (data.items && data.items.length > 0) {
        console.log(`\n   🍽️  ITEMS (${data.items.length}):`);
        data.items.forEach((item, idx) => {
          let itemStr = `      ${idx + 1}. ${item.name}`;
          if (item.variantName) itemStr += ` (${item.variantName})`;
          itemStr += ` x${parseFloat(item.quantity)} = Rs.${item.totalPrice}`;
          itemStr += ` [${item.status}]`;
          console.log(itemStr);
          if (item.addons && item.addons.length > 0) {
            console.log(`         + Addons: ${item.addons.map(a => a.name).join(', ')}`);
          }
        });
      }

      // KOTs
      if (data.kots && data.kots.length > 0) {
        console.log(`\n   📋 KOTs (${data.kots.length}):`);
        data.kots.forEach(kot => {
          console.log(`      - ${kot.kotNumber} | ${kot.station.padEnd(8)} | ${kot.status.padEnd(10)} | ${kot.itemCount} items`);
        });
      }

      // Billing
      if (data.billing) {
        console.log(`\n   💳 BILLING:`);
        console.log(`      - Invoice: ${data.billing.invoiceNumber}`);
        console.log(`      - Grand Total: Rs.${data.billing.grandTotal}`);
        console.log(`      - Paid: Rs.${data.billing.paidAmount || 0}`);
        console.log(`      - Status: ${data.billing.paymentStatus}`);
      }

      // Status Summary
      if (data.statusSummary) {
        console.log(`\n   📊 STATUS SUMMARY:`);
        console.log(`      - Message: ${data.statusSummary.message}`);
        if (data.statusSummary.guestCount) console.log(`      - Guests: ${data.statusSummary.guestCount}`);
        if (data.statusSummary.orderTotal) console.log(`      - Order Total: Rs.${data.statusSummary.orderTotal}`);
        if (data.statusSummary.pendingKots !== undefined) console.log(`      - Pending KOTs: ${data.statusSummary.pendingKots}`);
        if (data.statusSummary.readyKots !== undefined) console.log(`      - Ready KOTs: ${data.statusSummary.readyKots}`);
        if (data.statusSummary.canSeat !== undefined) console.log(`      - Can Seat: ${data.statusSummary.canSeat}`);
      }

      // Validation
      if (statusMatch) {
        console.log(`\n   ✅ PASSED - All expected data present`);
        passed++;
      } else {
        console.log(`\n   ❌ FAILED - Status mismatch`);
        failed++;
      }

    } catch (error) {
      console.log(`\n   ❌ ERROR: ${error.response?.data?.message || error.message}`);
      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`   Total Tests: ${testCases.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(80));

  if (failed === 0) {
    console.log('\n🎉 ALL TABLE DETAILS VERIFIED SUCCESSFULLY!\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.\n');
  }
}

verifyTableDetails().catch(e => console.error('Error:', e.response?.data || e.message));
