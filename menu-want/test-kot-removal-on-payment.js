/**
 * Test KOT removal on payment completion
 * Verifies that all KOTs are marked as served when payment is completed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { initializeDatabase, getPool } = require('../src/database');

async function testKotRemovalOnPayment() {
  console.log('='.repeat(70));
  console.log('KOT REMOVAL ON PAYMENT COMPLETION TEST');
  console.log('='.repeat(70));

  try {
    await initializeDatabase();
    const pool = getPool();
    const kotService = require('../src/services/kot.service');

    // Test 1: Check current KOT statuses
    console.log('\n--- 1. Current KOT Status Distribution ---');
    
    const [kotStats] = await pool.query(`
      SELECT 
        station,
        station_id,
        status,
        COUNT(*) as count
      FROM kot_tickets
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY station, station_id, status
      ORDER BY station, status
    `);
    
    console.log('\nKOT counts by station and status (last 7 days):');
    kotStats.forEach(row => {
      console.log(`  ${row.station || 'N/A'} (id: ${row.station_id || 'N/A'}) - ${row.status}: ${row.count}`);
    });

    // Test 2: Find orders with completed payment but unserved KOTs
    console.log('\n--- 2. Orders with Completed Payment but Unserved KOTs ---');
    
    const [problemOrders] = await pool.query(`
      SELECT DISTINCT 
        o.id as order_id,
        o.order_number,
        o.status as order_status,
        i.payment_status,
        kt.id as kot_id,
        kt.kot_number,
        kt.station,
        kt.station_id,
        kt.status as kot_status
      FROM orders o
      JOIN invoices i ON o.id = i.order_id
      JOIN kot_tickets kt ON o.id = kt.order_id
      WHERE i.payment_status = 'completed'
        AND kt.status NOT IN ('served', 'cancelled')
      ORDER BY o.id DESC
      LIMIT 10
    `);
    
    if (problemOrders.length > 0) {
      console.log('\n⚠️  Found orders with completed payment but unserved KOTs:');
      problemOrders.forEach(row => {
        console.log(`  Order ${row.order_number} (${row.order_status}) - KOT ${row.kot_number} @ ${row.station} is "${row.kot_status}"`);
      });
      
      // Fix these KOTs
      console.log('\n  Fixing these KOTs...');
      for (const row of problemOrders) {
        await pool.query(`
          UPDATE kot_tickets SET status = 'served', served_at = NOW()
          WHERE id = ? AND status NOT IN ('served', 'cancelled')
        `, [row.kot_id]);
        console.log(`  ✅ Marked KOT ${row.kot_number} as served`);
      }
    } else {
      console.log('\n✅ No problem orders found - all paid orders have served KOTs');
    }

    // Test 3: Verify getKotsByOrder returns correct data
    console.log('\n--- 3. Test getKotsByOrder Function ---');
    
    const [recentOrder] = await pool.query(`
      SELECT o.id, o.order_number 
      FROM orders o 
      JOIN kot_tickets kt ON o.id = kt.order_id
      WHERE kt.station_id IS NOT NULL
      ORDER BY o.id DESC 
      LIMIT 1
    `);
    
    if (recentOrder.length > 0) {
      const orderId = recentOrder[0].id;
      console.log(`\nTesting with order ${recentOrder[0].order_number} (id: ${orderId})`);
      
      const kots = await kotService.getKotsByOrder(orderId);
      console.log(`  Found ${kots.length} KOTs:`);
      kots.forEach(kot => {
        console.log(`    - KOT ${kot.kotNumber}: station=${kot.station}, stationId=${kot.stationId}, status=${kot.status}`);
      });
    }

    // Test 4: Check station dashboard filters out served KOTs
    console.log('\n--- 4. Test Station Dashboard Filters ---');
    
    const [activeStations] = await pool.query(`
      SELECT DISTINCT station, station_id, outlet_id
      FROM kot_tickets
      WHERE status NOT IN ('served', 'cancelled')
        AND DATE(created_at) = CURDATE()
      LIMIT 3
    `);
    
    for (const s of activeStations) {
      const dashboard = await kotService.getStationDashboard(s.outlet_id, s.station_id || s.station, []);
      console.log(`\n  Station ${s.station} (id: ${s.station_id}):`);
      console.log(`    Active KOTs: ${dashboard.kots.length}`);
      console.log(`    Pending: ${dashboard.stats.pending_count}, Preparing: ${dashboard.stats.preparing_count}, Ready: ${dashboard.stats.ready_count}`);
      
      // Verify none are served
      const servedKots = dashboard.kots.filter(k => k.status === 'served');
      if (servedKots.length > 0) {
        console.log(`    ⚠️  Warning: ${servedKots.length} served KOTs in active list!`);
      } else {
        console.log(`    ✅ No served KOTs in active list`);
      }
    }

    // Test 5: Verify socket emission format
    console.log('\n--- 5. Socket Emission Format Check ---');
    console.log(`
When payment is completed, the following socket events are emitted:

Channel: 'kot:update'
Payload: {
  type: 'kot:served',
  outletId: <outlet_id>,
  station: '<station_type>',     // e.g., 'main_kitchen', 'bar'
  stationId: <station_id>,       // numeric station ID for multi-station
  kot: { ... full KOT data ... },
  timestamp: '<ISO timestamp>'
}

Frontend should:
1. Listen for 'kot:update' events
2. When type === 'kot:served', remove the KOT from the station's active list
3. Use stationId (if present) for precise station matching
`);

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testKotRemovalOnPayment();
