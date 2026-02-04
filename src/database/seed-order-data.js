/**
 * Seed Order Data for Testing All Scenarios
 * Tests: Table orders, KOT routing (Kitchen/Bar/Mocktail), Billing, Payments
 * Run: npm run seed:orders
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('./index');
const { v4: uuidv4 } = require('uuid');

async function seedOrderData() {
  console.log('\n🧾 Seeding order data for all scenarios...\n');

  try {
    await initializeDatabase();
    const pool = getPool();

    // Get outlet
    const [outlets] = await pool.query('SELECT id FROM outlets WHERE code = ? LIMIT 1', ['DTR001']);
    if (outlets.length === 0) {
      console.error('❌ Please run seed:outlets first');
      process.exit(1);
    }
    const outletId = outlets[0].id;

    // Get users with roles
    const [users] = await pool.query(
      `SELECT u.id, r.name as role_name 
       FROM users u 
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.is_active = 1
       LIMIT 10`
    );
    const captainUser = users.find(u => u.role_name === 'captain') || users[0];
    const cashierUser = users.find(u => u.role_name === 'cashier') || users[0];

    // Get tables
    const [tables] = await pool.query(
      `SELECT t.*, f.name as floor_name, s.name as section_name
       FROM tables t 
       JOIN floors f ON t.floor_id = f.id
       LEFT JOIN sections s ON t.section_id = s.id
       WHERE t.outlet_id = ? AND t.is_active = 1
       LIMIT 10`,
      [outletId]
    );

    // Get menu items by category
    const [items] = await pool.query(
      `SELECT i.*, c.name as category_name, ks.station_type, co.counter_type
       FROM items i 
       JOIN categories c ON i.category_id = c.id
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       LEFT JOIN counters co ON i.counter_id = co.id
       WHERE i.outlet_id = ? AND i.is_active = 1`,
      [outletId]
    );

    const foodItems = items.filter(i => !i.counter_type);
    const barItems = items.filter(i => i.counter_type);

    console.log(`  Found ${tables.length} tables`);
    console.log(`  Found ${foodItems.length} food items, ${barItems.length} bar items`);

    // Create cancel reasons
    const cancelReasons = [
      { type: 'item_cancel', reason: 'Customer changed mind', requiresApproval: false },
      { type: 'item_cancel', reason: 'Item not available', requiresApproval: false },
      { type: 'item_cancel', reason: 'Wrong order', requiresApproval: false },
      { type: 'item_cancel', reason: 'Quality issue', requiresApproval: true },
      { type: 'order_cancel', reason: 'Customer left', requiresApproval: false },
      { type: 'order_cancel', reason: 'Payment issue', requiresApproval: true }
    ];

    for (const reason of cancelReasons) {
      const [existing] = await pool.query(
        'SELECT id FROM cancel_reasons WHERE outlet_id = ? AND reason = ?',
        [outletId, reason.reason]
      );
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO cancel_reasons (outlet_id, reason_type, reason, requires_approval, is_active)
           VALUES (?, ?, ?, ?, 1)`,
          [outletId, reason.type, reason.reason, reason.requiresApproval]
        );
      }
    }
    console.log('  ✓ Created cancel reasons');

    // ========================
    // SCENARIO 1: Restaurant Order (Food Only)
    // ========================
    console.log('\n📋 Scenario 1: Restaurant Order (Food Only)');
    
    const table1 = tables[0];
    const order1 = await createTestOrder(pool, {
      outletId,
      table: table1,
      userId: captainUser.id,
      guestCount: 2,
      items: [
        { item: foodItems.find(i => i.name.includes('Paneer Tikka')), quantity: 1 },
        { item: foodItems.find(i => i.name.includes('Butter Chicken')), quantity: 1 },
        { item: foodItems.find(i => i.name.includes('Garlic Naan')), quantity: 4 },
        { item: foodItems.find(i => i.name.includes('Jeera Rice')), quantity: 2 }
      ].filter(i => i.item)
    });
    console.log(`  ✓ Created Order #${order1.orderNumber} for Table ${table1.table_number}`);

    // Send KOT
    const kot1 = await sendTestKot(pool, order1.id, outletId, captainUser.id);
    console.log(`  ✓ Sent KOT: ${kot1.map(k => k.kotNumber).join(', ')}`);

    // ========================
    // SCENARIO 2: Bar Order (Drinks Only)
    // ========================
    console.log('\n🍸 Scenario 2: Bar Order (Drinks Only)');
    
    const table2 = tables[1];
    const order2 = await createTestOrder(pool, {
      outletId,
      table: table2,
      userId: captainUser.id,
      guestCount: 4,
      items: [
        { item: barItems.find(i => i.name.includes('Jack Daniels')), quantity: 2, variantName: '60 ML' },
        { item: barItems.find(i => i.name.includes('Kingfisher')), quantity: 4, variantName: '650 ML' },
        { item: barItems.find(i => i.name.includes('Mojito')), quantity: 2 }
      ].filter(i => i.item)
    });
    console.log(`  ✓ Created Order #${order2.orderNumber} for Table ${table2.table_number}`);

    // Send BOT
    const bot2 = await sendTestKot(pool, order2.id, outletId, captainUser.id);
    console.log(`  ✓ Sent BOT: ${bot2.map(k => k.kotNumber).join(', ')}`);

    // ========================
    // SCENARIO 3: Mixed Order (Food + Drinks)
    // ========================
    console.log('\n🍽️🍺 Scenario 3: Mixed Order (Food + Drinks)');
    
    const table3 = tables[2];
    const order3 = await createTestOrder(pool, {
      outletId,
      table: table3,
      userId: captainUser.id,
      guestCount: 6,
      items: [
        { item: foodItems.find(i => i.name.includes('Chicken Tikka')), quantity: 2 },
        { item: foodItems.find(i => i.name.includes('Chicken Biryani')), quantity: 3 },
        { item: barItems.find(i => i.name.includes('Budweiser')), quantity: 6 },
        { item: barItems.find(i => i.name.includes('Long Island')), quantity: 2 }
      ].filter(i => i.item)
    });
    console.log(`  ✓ Created Order #${order3.orderNumber} for Table ${table3.table_number}`);

    // Send KOT/BOT - should create separate tickets for kitchen and bar
    const tickets3 = await sendTestKot(pool, order3.id, outletId, captainUser.id);
    console.log(`  ✓ Sent tickets: ${tickets3.map(k => `${k.kotNumber} (${k.station})`).join(', ')}`);

    // ========================
    // SCENARIO 4: Order with Modifications
    // ========================
    console.log('\n✏️ Scenario 4: Order with Item Modifications');
    
    const table4 = tables[3];
    const order4 = await createTestOrder(pool, {
      outletId,
      table: table4,
      userId: captainUser.id,
      guestCount: 2,
      items: [
        { item: foodItems.find(i => i.name.includes('Paneer Butter')), quantity: 2 },
        { item: foodItems.find(i => i.name.includes('Butter Naan')), quantity: 6 }
      ].filter(i => i.item)
    });
    console.log(`  ✓ Created Order #${order4.orderNumber}`);

    // Add more items after initial order
    const additionalItems = await addTestItems(pool, order4.id, [
      { item: foodItems.find(i => i.name.includes('Dal Makhani')), quantity: 1 }
    ].filter(i => i.item), captainUser.id);
    console.log(`  ✓ Added ${additionalItems.length} more items`);

    // Send KOT for all items
    await sendTestKot(pool, order4.id, outletId, captainUser.id);
    console.log('  ✓ Sent KOT');

    // ========================
    // SCENARIO 5: Complete Order Flow (Order → KOT → Ready → Bill → Pay)
    // ========================
    console.log('\n💳 Scenario 5: Complete Order Flow (Order → Bill → Pay)');
    
    const table5 = tables[4];
    const order5 = await createTestOrder(pool, {
      outletId,
      table: table5,
      userId: captainUser.id,
      guestCount: 2,
      items: [
        { item: foodItems.find(i => i.name.includes('Veg Biryani')), quantity: 2 },
        { item: foodItems.find(i => i.name.includes('Gulab Jamun')), quantity: 2 }
      ].filter(i => i.item)
    });

    // Send KOT
    const kot5 = await sendTestKot(pool, order5.id, outletId, captainUser.id);
    
    // Mark KOT as ready
    for (const k of kot5) {
      await pool.query(
        `UPDATE kot_tickets SET status = 'ready', ready_at = NOW() WHERE id = ?`,
        [k.id]
      );
      await pool.query(
        `UPDATE kot_items SET status = 'ready' WHERE kot_id = ?`,
        [k.id]
      );
    }
    
    // Mark items as served
    await pool.query(
      `UPDATE order_items SET status = 'served' WHERE order_id = ?`,
      [order5.id]
    );
    await pool.query(
      `UPDATE orders SET status = 'served' WHERE id = ?`,
      [order5.id]
    );

    // Generate bill
    const invoice5 = await generateTestBill(pool, order5.id, outletId, captainUser.id);
    console.log(`  ✓ Generated Invoice #${invoice5.invoiceNumber} - ₹${invoice5.grandTotal}`);

    // Process payment
    const payment5 = await processTestPayment(pool, {
      outletId,
      orderId: order5.id,
      invoiceId: invoice5.id,
      amount: invoice5.grandTotal,
      paymentMode: 'cash',
      receivedBy: cashierUser.id
    });
    console.log(`  ✓ Payment processed: ${payment5.paymentNumber}`);

    // Release table
    await pool.query(`UPDATE tables SET status = 'empty' WHERE id = ?`, [table5.id]);

    // ========================
    // SCENARIO 6: Split Payment
    // ========================
    console.log('\n💰 Scenario 6: Split Payment Order');
    
    const table6 = tables[5];
    const order6 = await createTestOrder(pool, {
      outletId,
      table: table6,
      userId: captainUser.id,
      guestCount: 4,
      items: [
        { item: foodItems.find(i => i.name.includes('Mutton Biryani')), quantity: 2 },
        { item: barItems.find(i => i.name.includes('Beer') || i.name.includes('Kingfisher')), quantity: 4 }
      ].filter(i => i.item)
    });

    await sendTestKot(pool, order6.id, outletId, captainUser.id);
    
    // Mark as served
    await pool.query(`UPDATE order_items SET status = 'served' WHERE order_id = ?`, [order6.id]);
    await pool.query(`UPDATE orders SET status = 'served' WHERE id = ?`, [order6.id]);

    const invoice6 = await generateTestBill(pool, order6.id, outletId, captainUser.id);

    // Split payment - half cash, half card
    const halfAmount = Math.floor(invoice6.grandTotal / 2);
    const payment6 = await processTestSplitPayment(pool, {
      outletId,
      orderId: order6.id,
      invoiceId: invoice6.id,
      splits: [
        { paymentMode: 'cash', amount: halfAmount },
        { paymentMode: 'card', amount: invoice6.grandTotal - halfAmount, cardLastFour: '4242' }
      ],
      receivedBy: cashierUser.id
    });
    console.log(`  ✓ Split payment: ₹${halfAmount} cash + ₹${invoice6.grandTotal - halfAmount} card`);

    await pool.query(`UPDATE tables SET status = 'empty' WHERE id = ?`, [table6.id]);

    // ========================
    // SCENARIO 7: Takeaway Order
    // ========================
    console.log('\n📦 Scenario 7: Takeaway Order');
    
    const order7 = await createTestOrder(pool, {
      outletId,
      table: null,
      userId: captainUser.id,
      orderType: 'takeaway',
      customerName: 'John Doe',
      customerPhone: '9876543210',
      guestCount: 1,
      items: [
        { item: foodItems.find(i => i.name.includes('Chicken Biryani')), quantity: 2 },
        { item: foodItems.find(i => i.name.includes('Raita') || i.name.includes('Gulab')), quantity: 2 }
      ].filter(i => i.item)
    });
    console.log(`  ✓ Created Takeaway Order #${order7.orderNumber}`);

    await sendTestKot(pool, order7.id, outletId, captainUser.id);
    console.log('  ✓ Sent KOT');

    // ========================
    // SUMMARY
    // ========================
    console.log('\n' + '='.repeat(70));
    console.log('ORDER TEST DATA SUMMARY');
    console.log('='.repeat(70));

    const [orderCount] = await pool.query(
      'SELECT COUNT(*) as count FROM orders WHERE outlet_id = ?',
      [outletId]
    );
    const [kotCount] = await pool.query(
      'SELECT COUNT(*) as count FROM kot_tickets WHERE outlet_id = ?',
      [outletId]
    );
    const [invoiceCount] = await pool.query(
      'SELECT COUNT(*) as count FROM invoices WHERE outlet_id = ?',
      [outletId]
    );
    const [paymentCount] = await pool.query(
      'SELECT COUNT(*) as count FROM payments WHERE outlet_id = ?',
      [outletId]
    );

    console.log(`\n📊 Created Data:`);
    console.log(`   - Orders: ${orderCount[0].count}`);
    console.log(`   - KOT/BOT Tickets: ${kotCount[0].count}`);
    console.log(`   - Invoices: ${invoiceCount[0].count}`);
    console.log(`   - Payments: ${paymentCount[0].count}`);

    console.log(`\n🧪 Test Scenarios:`);
    console.log(`   ✓ Scenario 1: Restaurant order (food only → Kitchen KOT)`);
    console.log(`   ✓ Scenario 2: Bar order (drinks only → Bar BOT)`);
    console.log(`   ✓ Scenario 3: Mixed order (food + drinks → Kitchen KOT + Bar BOT)`);
    console.log(`   ✓ Scenario 4: Order with modifications (add items)`);
    console.log(`   ✓ Scenario 5: Complete flow (Order → KOT → Served → Bill → Cash Payment)`);
    console.log(`   ✓ Scenario 6: Split payment (Cash + Card)`);
    console.log(`   ✓ Scenario 7: Takeaway order (no table)`);

    console.log(`\n✅ Order test data seeded successfully!\n`);

  } catch (error) {
    console.error('❌ Failed to seed order data:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Helper functions
async function createTestOrder(pool, data) {
  const { outletId, table, userId, orderType = 'dine_in', customerName, customerPhone, guestCount, items } = data;
  
  const today = new Date();
  const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, '');
  const [seqResult] = await pool.query(
    `SELECT COUNT(*) + 1 as seq FROM orders WHERE outlet_id = ? AND DATE(created_at) = CURDATE()`,
    [outletId]
  );
  const orderNumber = `ORD${datePrefix}${String(seqResult[0].seq).padStart(4, '0')}`;
  const uuid = uuidv4();

  const [orderResult] = await pool.query(
    `INSERT INTO orders (
      uuid, outlet_id, order_number, order_type,
      table_id, floor_id, section_id,
      customer_name, customer_phone, guest_count,
      status, payment_status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`,
    [
      uuid, outletId, orderNumber, orderType,
      table?.id || null, table?.floor_id || null, table?.section_id || null,
      customerName, customerPhone, guestCount, userId
    ]
  );

  const orderId = orderResult.insertId;

  // Update table status
  if (table) {
    await pool.query(`UPDATE tables SET status = 'occupied' WHERE id = ?`, [table.id]);
  }

  // Add items
  await addTestItems(pool, orderId, items, userId);

  // Calculate totals
  const [totals] = await pool.query(
    `SELECT SUM(total_price) as subtotal, SUM(tax_amount) as tax FROM order_items WHERE order_id = ?`,
    [orderId]
  );
  
  const subtotal = parseFloat(totals[0].subtotal) || 0;
  const taxAmount = parseFloat(totals[0].tax) || 0;
  const total = Math.round(subtotal + taxAmount);

  await pool.query(
    `UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?`,
    [subtotal, taxAmount, total, orderId]
  );

  return { id: orderId, orderNumber };
}

async function addTestItems(pool, orderId, items, userId) {
  const added = [];
  
  for (const { item, quantity, variantName } of items) {
    if (!item) continue;

    let unitPrice = parseFloat(item.base_price);
    let variantId = null;

    // Get variant if specified
    if (variantName) {
      const [variants] = await pool.query(
        'SELECT * FROM variants WHERE item_id = ? AND name LIKE ?',
        [item.id, `%${variantName}%`]
      );
      if (variants[0]) {
        variantId = variants[0].id;
        unitPrice = parseFloat(variants[0].price);
      }
    }

    const totalPrice = unitPrice * quantity;
    
    // Estimate tax (5% for food, 18% for drinks)
    const taxRate = item.counter_type ? 0.18 : 0.05;
    const taxAmount = totalPrice * taxRate;

    const [result] = await pool.query(
      `INSERT INTO order_items (
        order_id, item_id, variant_id, item_name, variant_name, item_type,
        quantity, unit_price, base_price, tax_amount, total_price,
        tax_group_id, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        orderId, item.id, variantId, item.name, variantName, item.item_type,
        quantity, unitPrice, unitPrice, taxAmount, totalPrice,
        item.tax_group_id, userId
      ]
    );

    added.push({ id: result.insertId, name: item.name });
  }

  return added;
}

async function sendTestKot(pool, orderId, outletId, userId) {
  // Get pending items with station info
  const [items] = await pool.query(
    `SELECT oi.*, i.kitchen_station_id, i.counter_id,
      ks.station_type, c.counter_type
     FROM order_items oi
     JOIN items i ON oi.item_id = i.id
     LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
     LEFT JOIN counters c ON i.counter_id = c.id
     WHERE oi.order_id = ? AND oi.status = 'pending'`,
    [orderId]
  );

  // Get order details
  const [orders] = await pool.query(
    `SELECT o.*, t.table_number FROM orders o
     LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?`,
    [orderId]
  );
  const order = orders[0];

  // Group by station
  const grouped = {};
  for (const item of items) {
    let station = item.counter_type ? 'bar' : (item.station_type || 'kitchen');
    if (!grouped[station]) grouped[station] = [];
    grouped[station].push(item);
  }

  const tickets = [];
  for (const [station, stationItems] of Object.entries(grouped)) {
    const prefix = station === 'bar' ? 'BOT' : 'KOT';
    const datePrefix = new Date().toISOString().slice(5, 10).replace(/-/g, '');
    
    const [seqResult] = await pool.query(
      `SELECT COUNT(*) + 1 as seq FROM kot_tickets WHERE outlet_id = ? AND station = ? AND DATE(created_at) = CURDATE()`,
      [outletId, station]
    );
    const kotNumber = `${prefix}${datePrefix}${String(seqResult[0].seq).padStart(3, '0')}`;

    const [kotResult] = await pool.query(
      `INSERT INTO kot_tickets (
        outlet_id, order_id, kot_number, table_number, station, status, created_by
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [outletId, orderId, kotNumber, order.table_number, station, userId]
    );

    const kotId = kotResult.insertId;

    for (const item of stationItems) {
      await pool.query(
        `INSERT INTO kot_items (kot_id, order_item_id, item_name, variant_name, quantity, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [kotId, item.id, item.item_name, item.variant_name, item.quantity]
      );

      await pool.query(
        `UPDATE order_items SET status = 'sent_to_kitchen', kot_id = ? WHERE id = ?`,
        [kotId, item.id]
      );
    }

    tickets.push({ id: kotId, kotNumber, station });
  }

  // Update order status
  await pool.query(`UPDATE orders SET status = 'confirmed' WHERE id = ?`, [orderId]);

  return tickets;
}

async function generateTestBill(pool, orderId, outletId, userId) {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  const order = orders[0];

  const [items] = await pool.query(
    `SELECT SUM(total_price) as subtotal, SUM(tax_amount) as tax 
     FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
    [orderId]
  );

  const subtotal = parseFloat(items[0].subtotal) || 0;
  const taxAmount = parseFloat(items[0].tax) || 0;
  const grandTotal = Math.round(subtotal + taxAmount);

  const today = new Date();
  const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const [seqResult] = await pool.query(
    `SELECT COUNT(*) + 1 as seq FROM invoices WHERE outlet_id = ? AND YEAR(invoice_date) = YEAR(CURDATE())`,
    [outletId]
  );
  const invoiceNumber = `INV/${String(fy).slice(2)}${String(fy + 1).slice(2)}/${String(seqResult[0].seq).padStart(6, '0')}`;

  const [result] = await pool.query(
    `INSERT INTO invoices (
      uuid, outlet_id, order_id, invoice_number, invoice_date, invoice_time,
      subtotal, taxable_amount, total_tax, grand_total,
      payment_status, generated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      uuidv4(), outletId, orderId, invoiceNumber,
      today.toISOString().slice(0, 10), today.toTimeString().slice(0, 8),
      subtotal, subtotal, taxAmount, grandTotal, userId
    ]
  );

  await pool.query(`UPDATE orders SET status = 'billed', billed_by = ?, billed_at = NOW() WHERE id = ?`, [userId, orderId]);

  return { id: result.insertId, invoiceNumber, grandTotal };
}

async function processTestPayment(pool, data) {
  const { outletId, orderId, invoiceId, amount, paymentMode, receivedBy } = data;

  const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const [seqResult] = await pool.query(
    `SELECT COUNT(*) + 1 as seq FROM payments WHERE outlet_id = ? AND DATE(created_at) = CURDATE()`,
    [outletId]
  );
  const paymentNumber = `PAY${datePrefix}${String(seqResult[0].seq).padStart(4, '0')}`;

  await pool.query(
    `INSERT INTO payments (
      uuid, outlet_id, order_id, invoice_id, payment_number,
      payment_mode, amount, total_amount, status, received_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
    [uuidv4(), outletId, orderId, invoiceId, paymentNumber, paymentMode, amount, amount, receivedBy]
  );

  await pool.query(`UPDATE orders SET status = 'paid', paid_amount = ?, payment_status = 'completed' WHERE id = ?`, [amount, orderId]);
  await pool.query(`UPDATE invoices SET payment_status = 'paid' WHERE id = ?`, [invoiceId]);

  return { paymentNumber };
}

async function processTestSplitPayment(pool, data) {
  const { outletId, orderId, invoiceId, splits, receivedBy } = data;

  const totalAmount = splits.reduce((sum, s) => sum + s.amount, 0);
  const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const [seqResult] = await pool.query(
    `SELECT COUNT(*) + 1 as seq FROM payments WHERE outlet_id = ? AND DATE(created_at) = CURDATE()`,
    [outletId]
  );
  const paymentNumber = `PAY${datePrefix}${String(seqResult[0].seq).padStart(4, '0')}`;

  const [payResult] = await pool.query(
    `INSERT INTO payments (
      uuid, outlet_id, order_id, invoice_id, payment_number,
      payment_mode, amount, total_amount, status, received_by
    ) VALUES (?, ?, ?, ?, ?, 'split', ?, ?, 'completed', ?)`,
    [uuidv4(), outletId, orderId, invoiceId, paymentNumber, totalAmount, totalAmount, receivedBy]
  );

  for (const split of splits) {
    await pool.query(
      `INSERT INTO split_payments (payment_id, payment_mode, amount, card_last_four)
       VALUES (?, ?, ?, ?)`,
      [payResult.insertId, split.paymentMode, split.amount, split.cardLastFour || null]
    );
  }

  await pool.query(`UPDATE orders SET status = 'paid', paid_amount = ?, payment_status = 'completed' WHERE id = ?`, [totalAmount, orderId]);
  await pool.query(`UPDATE invoices SET payment_status = 'paid' WHERE id = ?`, [invoiceId]);

  return { paymentNumber };
}

seedOrderData();
