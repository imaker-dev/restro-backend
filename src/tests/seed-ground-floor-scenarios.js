/**
 * Seed Ground Floor Tables with Different Scenarios
 * 
 * Tables on Floor 1 (Ground Floor):
 * T1 (id:1) - AVAILABLE (clean, ready)
 * T2 (id:2) - RESERVED (guest expected)
 * T3 (id:3) - OCCUPIED (new order, KOTs pending)
 * T4 (id:4) - RUNNING (items being served, some KOTs ready)
 * T5 (id:5) - BILLING (bill generated, awaiting payment)
 * T6 (id:6) - Keep existing (already has order data)
 * B1 (id:7) - AVAILABLE
 * B2 (id:8) - BLOCKED (maintenance)
 * B3 (id:9) - OCCUPIED (large party, multiple KOTs)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function seedGroundFloorScenarios() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const connection = await pool.getConnection();

  try {
    console.log('='.repeat(70));
    console.log('SEEDING GROUND FLOOR TABLES WITH TEST SCENARIOS');
    console.log('='.repeat(70));

    // Clean up existing test data (except table 6 which has real data)
    console.log('\n🧹 Cleaning up old test sessions and orders...');
    
    // End old sessions
    await connection.query(`
      UPDATE table_sessions SET status = 'completed', ended_at = NOW() 
      WHERE table_id IN (1,2,3,4,5,7,8,9) AND status IN ('active', 'billing')
    `);
    
    // Delete old test orders and related data
    const [oldOrders] = await connection.query(`
      SELECT id FROM orders WHERE table_id IN (1,2,3,4,5,7,8,9) AND order_number LIKE 'ORD%T%' OR order_number LIKE 'ORD%B%'
    `);
    for (const order of oldOrders) {
      await connection.query('DELETE FROM kot_tickets WHERE order_id = ?', [order.id]);
      await connection.query('DELETE FROM order_items WHERE order_id = ?', [order.id]);
      await connection.query('DELETE FROM invoices WHERE order_id = ?', [order.id]);
      await connection.query('DELETE FROM orders WHERE id = ?', [order.id]);
    }
    console.log(`   Cleaned up ${oldOrders.length} old test orders`);

    // Get menu items for orders
    const [menuItems] = await connection.query(`
      SELECT i.id, i.name, i.base_price, i.item_type, ks.station_type
      FROM items i
      LEFT JOIN item_kitchen_stations iks ON i.id = iks.item_id
      LEFT JOIN kitchen_stations ks ON iks.kitchen_station_id = ks.id
      WHERE i.is_available = 1
      LIMIT 10
    `);
    console.log(`Found ${menuItems.length} menu items for orders`);

    // Get users for captain assignment
    const [users] = await connection.query(`SELECT id, name FROM users WHERE is_active = 1 LIMIT 3`);
    const captains = users.map(u => u.id);

    // ============================================
    // TABLE 1 (T1) - AVAILABLE
    // ============================================
    console.log('\n📋 T1 (id:1) - Setting to AVAILABLE');
    await connection.query(`UPDATE tables SET status = 'available' WHERE id = 1`);
    console.log('   ✅ Clean table, ready for guests');

    // ============================================
    // TABLE 2 (T2) - RESERVED
    // ============================================
    console.log('\n📋 T2 (id:2) - Setting to RESERVED with guest info');
    await connection.query(`UPDATE tables SET status = 'reserved' WHERE id = 2`);
    
    // Create reservation session
    await connection.query(`
      INSERT INTO table_sessions (table_id, guest_count, guest_name, guest_phone, started_by, notes, status)
      VALUES (2, 4, 'Mr. Sharma', '9876543210', ?, 'Birthday celebration - needs cake at 8pm', 'active')
    `, [captains[0]]);
    console.log('   ✅ Reserved for Mr. Sharma (4 guests) - Birthday celebration');

    // ============================================
    // TABLE 3 (T3) - OCCUPIED (New order, KOTs pending)
    // ============================================
    console.log('\n📋 T3 (id:3) - Setting to OCCUPIED with new order');
    await connection.query(`UPDATE tables SET status = 'occupied' WHERE id = 3`);
    
    // Create session
    const [sessionResult3] = await connection.query(`
      INSERT INTO table_sessions (table_id, guest_count, guest_name, started_by, status)
      VALUES (3, 2, 'Walk-in Guest', ?, 'active')
    `, [captains[1]]);
    const sessionId3 = sessionResult3.insertId;

    // Create order
    const orderNumber3 = `ORD${new Date().toISOString().slice(2,10).replace(/-/g,'')}T3`;
    const [orderResult3] = await connection.query(`
      INSERT INTO orders (uuid, outlet_id, order_number, order_type, table_id, table_session_id, 
        floor_id, section_id, guest_count, status, payment_status, created_by)
      VALUES (UUID(), 4, ?, 'dine_in', 3, ?, 1, 1, 2, 'confirmed', 'pending', ?)
    `, [orderNumber3, sessionId3, captains[1]]);
    const orderId3 = orderResult3.insertId;

    // Link order to session
    await connection.query(`UPDATE table_sessions SET order_id = ? WHERE id = ?`, [orderId3, sessionId3]);

    // Add order items
    const items3 = [
      { itemId: menuItems[0]?.id || 1, name: menuItems[0]?.name || 'Item 1', qty: 1, price: 350 },
      { itemId: menuItems[1]?.id || 2, name: menuItems[1]?.name || 'Item 2', qty: 2, price: 250 }
    ];
    let subtotal3 = 0;
    for (const item of items3) {
      const total = item.qty * item.price;
      subtotal3 += total;
      await connection.query(`
        INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, base_price, total_price, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [orderId3, item.itemId, item.name, item.qty, item.price, item.price, total, captains[1]]);
    }

    // Update order totals
    const tax3 = subtotal3 * 0.05;
    await connection.query(`
      UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?
    `, [subtotal3, tax3, Math.round(subtotal3 + tax3), orderId3]);

    // Create KOT (pending)
    const kotNumber3 = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}T3`;
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority)
      VALUES (4, ?, ?, 'kitchen', 'pending', 0)
    `, [orderId3, kotNumber3]);

    console.log(`   ✅ Order ${orderNumber3} created with 2 items, 1 pending KOT`);

    // ============================================
    // TABLE 4 (T4) - RUNNING (Items being served)
    // ============================================
    console.log('\n📋 T4 (id:4) - Setting to RUNNING with mixed KOT statuses');
    await connection.query(`UPDATE tables SET status = 'running' WHERE id = 4`);
    
    // Create session
    const [sessionResult4] = await connection.query(`
      INSERT INTO table_sessions (table_id, guest_count, guest_name, started_by, status)
      VALUES (4, 5, 'Corporate Lunch', ?, 'active')
    `, [captains[0]]);
    const sessionId4 = sessionResult4.insertId;

    // Create order
    const orderNumber4 = `ORD${new Date().toISOString().slice(2,10).replace(/-/g,'')}T4`;
    const [orderResult4] = await connection.query(`
      INSERT INTO orders (uuid, outlet_id, order_number, order_type, table_id, table_session_id, 
        floor_id, section_id, guest_count, status, payment_status, created_by)
      VALUES (UUID(), 4, ?, 'dine_in', 4, ?, 1, 1, 5, 'confirmed', 'pending', ?)
    `, [orderNumber4, sessionId4, captains[0]]);
    const orderId4 = orderResult4.insertId;

    await connection.query(`UPDATE table_sessions SET order_id = ? WHERE id = ?`, [orderId4, sessionId4]);

    // Add multiple items
    const items4 = [
      { itemId: menuItems[0]?.id || 1, name: menuItems[0]?.name || 'Starter', qty: 2, price: 350, status: 'served' },
      { itemId: menuItems[1]?.id || 2, name: menuItems[1]?.name || 'Main Course', qty: 3, price: 280, status: 'served' },
      { itemId: menuItems[2]?.id || 3, name: menuItems[2]?.name || 'Dessert', qty: 1, price: 450, status: 'sent_to_kitchen' },
      { itemId: menuItems[3]?.id || 4, name: menuItems[3]?.name || 'Beverage', qty: 2, price: 180, status: 'sent_to_kitchen' }
    ];
    let subtotal4 = 0;
    for (const item of items4) {
      const total = item.qty * item.price;
      subtotal4 += total;
      await connection.query(`
        INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, base_price, total_price, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [orderId4, item.itemId, item.name, item.qty, item.price, item.price, total, item.status, captains[0]]);
    }

    const tax4 = subtotal4 * 0.05;
    await connection.query(`
      UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?
    `, [subtotal4, tax4, Math.round(subtotal4 + tax4), orderId4]);

    // Create multiple KOTs with different statuses
    const kotNumber4a = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}T4A`;
    const kotNumber4b = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}T4B`;
    const kotNumber4c = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}T4C`;
    
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority, accepted_at, ready_at, served_at)
      VALUES (4, ?, ?, 'kitchen', 'served', 0, NOW(), NOW(), NOW())
    `, [orderId4, kotNumber4a]);
    
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority, accepted_at, ready_at)
      VALUES (4, ?, ?, 'kitchen', 'ready', 1, NOW(), NOW())
    `, [orderId4, kotNumber4b]);
    
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority)
      VALUES (4, ?, ?, 'bar', 'preparing', 0)
    `, [orderId4, kotNumber4c]);

    console.log(`   ✅ Order ${orderNumber4} with 4 items, KOTs: 1 served, 1 ready, 1 preparing`);

    // ============================================
    // TABLE 5 (T5) - BILLING (Bill generated)
    // ============================================
    console.log('\n📋 T5 (id:5) - Setting to BILLING with invoice');
    await connection.query(`UPDATE tables SET status = 'billing' WHERE id = 5`);
    
    // Create session
    const [sessionResult5] = await connection.query(`
      INSERT INTO table_sessions (table_id, guest_count, guest_name, started_by, status)
      VALUES (5, 2, 'Couple Dinner', ?, 'billing')
    `, [captains[2] || captains[0]]);
    const sessionId5 = sessionResult5.insertId;

    // Create order
    const orderNumber5 = `ORD${new Date().toISOString().slice(2,10).replace(/-/g,'')}T5`;
    const [orderResult5] = await connection.query(`
      INSERT INTO orders (uuid, outlet_id, order_number, order_type, table_id, table_session_id, 
        floor_id, section_id, guest_count, status, payment_status, created_by)
      VALUES (UUID(), 4, ?, 'dine_in', 5, ?, 1, 1, 2, 'billed', 'pending', ?)
    `, [orderNumber5, sessionId5, captains[2] || captains[0]]);
    const orderId5 = orderResult5.insertId;

    await connection.query(`UPDATE table_sessions SET order_id = ? WHERE id = ?`, [orderId5, sessionId5]);

    // Add items (all served)
    const items5 = [
      { itemId: menuItems[4]?.id || 5, name: menuItems[4]?.name || 'Special Dish', qty: 1, price: 650 },
      { itemId: menuItems[5]?.id || 6, name: menuItems[5]?.name || 'Premium Item', qty: 1, price: 550 },
      { itemId: menuItems[6]?.id || 7, name: menuItems[6]?.name || 'Drink', qty: 2, price: 120 }
    ];
    let subtotal5 = 0;
    for (const item of items5) {
      const total = item.qty * item.price;
      subtotal5 += total;
      await connection.query(`
        INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, base_price, total_price, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'served', ?)
      `, [orderId5, item.itemId, item.name, item.qty, item.price, item.price, total, captains[2] || captains[0]]);
    }

    const tax5 = subtotal5 * 0.05;
    const grandTotal5 = Math.round(subtotal5 + tax5);
    await connection.query(`
      UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?
    `, [subtotal5, tax5, grandTotal5, orderId5]);

    // Create invoice
    const invoiceNumber5 = `INV/${new Date().getFullYear()}/${String(orderId5).padStart(6, '0')}`;
    await connection.query(`
      INSERT INTO invoices (order_id, outlet_id, invoice_number, subtotal, total_tax, 
        grand_total, payment_status, generated_by)
      VALUES (?, 4, ?, ?, ?, ?, 'pending', ?)
    `, [orderId5, invoiceNumber5, subtotal5, tax5, grandTotal5, captains[2] || captains[0]]);

    // KOT (all served)
    const kotNumber5 = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}T5`;
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority, accepted_at, ready_at, served_at)
      VALUES (4, ?, ?, 'kitchen', 'served', 0, NOW(), NOW(), NOW())
    `, [orderId5, kotNumber5]);

    console.log(`   ✅ Order ${orderNumber5} billed - Invoice: ${invoiceNumber5}, Total: Rs.${grandTotal5}`);

    // ============================================
    // TABLE 7 (B1) - AVAILABLE
    // ============================================
    console.log('\n📋 B1 (id:7) - Setting to AVAILABLE');
    await connection.query(`UPDATE tables SET status = 'available' WHERE id = 7`);
    console.log('   ✅ Bar table ready for guests');

    // ============================================
    // TABLE 8 (B2) - BLOCKED
    // ============================================
    console.log('\n📋 B2 (id:8) - Setting to BLOCKED');
    await connection.query(`UPDATE tables SET status = 'blocked' WHERE id = 8`);
    console.log('   ✅ Table blocked for maintenance');

    // ============================================
    // TABLE 9 (B3) - OCCUPIED (Large party)
    // ============================================
    console.log('\n📋 B3 (id:9) - Setting to OCCUPIED with large party order');
    await connection.query(`UPDATE tables SET status = 'occupied' WHERE id = 9`);
    
    // Create session
    const [sessionResult9] = await connection.query(`
      INSERT INTO table_sessions (table_id, guest_count, guest_name, guest_phone, started_by, notes, status)
      VALUES (9, 6, 'Family Gathering', '9123456789', ?, 'Anniversary party - VIP treatment', 'active')
    `, [captains[0]]);
    const sessionId9 = sessionResult9.insertId;

    // Create order
    const orderNumber9 = `ORD${new Date().toISOString().slice(2,10).replace(/-/g,'')}B3`;
    const [orderResult9] = await connection.query(`
      INSERT INTO orders (uuid, outlet_id, order_number, order_type, table_id, table_session_id, 
        floor_id, section_id, guest_count, status, payment_status, special_instructions, created_by)
      VALUES (UUID(), 4, ?, 'dine_in', 9, ?, 1, 1, 6, 'confirmed', 'pending', 'VIP - Extra attention needed', ?)
    `, [orderNumber9, sessionId9, captains[0]]);
    const orderId9 = orderResult9.insertId;

    await connection.query(`UPDATE table_sessions SET order_id = ? WHERE id = ?`, [orderId9, sessionId9]);

    // Add many items
    const items9 = [
      { itemId: menuItems[0]?.id || 1, name: menuItems[0]?.name || 'Appetizer', qty: 2, price: 450 },
      { itemId: menuItems[1]?.id || 2, name: menuItems[1]?.name || 'Main 1', qty: 3, price: 380 },
      { itemId: menuItems[2]?.id || 3, name: menuItems[2]?.name || 'Main 2', qty: 2, price: 320 },
      { itemId: menuItems[3]?.id || 4, name: menuItems[3]?.name || 'Side Dish', qty: 4, price: 150 },
      { itemId: menuItems[4]?.id || 5, name: menuItems[4]?.name || 'Signature', qty: 1, price: 750 },
      { itemId: menuItems[5]?.id || 6, name: menuItems[5]?.name || 'Drinks', qty: 6, price: 80 }
    ];
    let subtotal9 = 0;
    for (const item of items9) {
      const total = item.qty * item.price;
      subtotal9 += total;
      await connection.query(`
        INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, base_price, total_price, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'sent_to_kitchen', ?)
      `, [orderId9, item.itemId, item.name, item.qty, item.price, item.price, total, captains[0]]);
    }

    const tax9 = subtotal9 * 0.05;
    await connection.query(`
      UPDATE orders SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?
    `, [subtotal9, tax9, Math.round(subtotal9 + tax9), orderId9]);

    // Multiple KOTs for different stations
    const kotNumber9a = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}B3A`;
    const kotNumber9b = `KOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}B3B`;
    const kotNumber9c = `BOT${new Date().toISOString().slice(2,10).replace(/-/g,'')}B3`;
    
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority)
      VALUES (4, ?, ?, 'kitchen', 'pending', 1)
    `, [orderId9, kotNumber9a]);
    
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority)
      VALUES (4, ?, ?, 'kitchen', 'accepted', 0)
    `, [orderId9, kotNumber9b]);
    
    await connection.query(`
      INSERT INTO kot_tickets (outlet_id, order_id, kot_number, station, status, priority)
      VALUES (4, ?, ?, 'bar', 'pending', 0)
    `, [orderId9, kotNumber9c]);

    console.log(`   ✅ Order ${orderNumber9} with 6 items (18 qty), 3 KOTs - VIP Family`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(70));
    console.log('SEEDING COMPLETE - GROUND FLOOR SUMMARY');
    console.log('='.repeat(70));

    const [summary] = await connection.query(`
      SELECT t.id, t.table_number, t.status, t.capacity,
        ts.guest_count, ts.guest_name,
        o.order_number, o.total_amount
      FROM tables t
      LEFT JOIN table_sessions ts ON t.id = ts.table_id AND ts.status IN ('active', 'billing')
      LEFT JOIN orders o ON ts.order_id = o.id
      WHERE t.floor_id = 1 AND t.is_active = 1
      ORDER BY t.id
    `);

    console.log('\nTable | Status    | Guests | Order         | Amount');
    console.log('-'.repeat(60));
    summary.forEach(t => {
      const guests = t.guest_count ? `${t.guest_count} (${t.guest_name || 'N/A'})` : '-';
      const order = t.order_number || '-';
      const amount = t.total_amount ? `Rs.${t.total_amount}` : '-';
      console.log(`${t.table_number.padEnd(5)} | ${t.status.padEnd(9)} | ${guests.padEnd(20).slice(0,20)} | ${order.padEnd(13)} | ${amount}`);
    });

    connection.release();
    await pool.end();

    console.log('\n✅ All scenarios seeded successfully!');
    console.log('Run: node src/tests/verify-table-details.js to test each table\n');

  } catch (error) {
    await connection.rollback();
    connection.release();
    await pool.end();
    console.error('Error seeding data:', error);
    throw error;
  }
}

seedGroundFloorScenarios().catch(console.error);
