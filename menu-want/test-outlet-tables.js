/**
 * Identify all tables with outlet_id for hard delete
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restro'
};

async function identifyOutletTables() {
  console.log('='.repeat(70));
  console.log('IDENTIFYING ALL TABLES WITH outlet_id COLUMN');
  console.log('='.repeat(70));

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // Get all tables with outlet_id column
    const [tables] = await connection.query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'outlet_id'
      ORDER BY TABLE_NAME
    `, [dbConfig.database]);
    
    console.log(`\nFound ${tables.length} tables with outlet_id column:\n`);
    
    const tableList = [];
    for (const table of tables) {
      // Get row count for outlet 34 as example
      const [countResult] = await connection.query(
        `SELECT COUNT(*) as count FROM ${table.TABLE_NAME} WHERE outlet_id = 34`
      );
      const count = countResult[0].count;
      
      tableList.push({
        table: table.TABLE_NAME,
        type: table.DATA_TYPE,
        nullable: table.IS_NULLABLE,
        key: table.COLUMN_KEY,
        rowsInOutlet34: count
      });
      
      console.log(`  ${table.TABLE_NAME.padEnd(40)} | Rows(outlet 34): ${count}`);
    }
    
    // Categorize tables by dependency order (for deletion)
    console.log('\n' + '='.repeat(70));
    console.log('DELETION ORDER (child tables first, then parent tables)');
    console.log('='.repeat(70));
    
    // Order matters for foreign key constraints
    const deletionOrder = [
      // Level 1: Most dependent tables (delete first)
      'kot_items',
      'order_items',
      'order_item_addons',
      'order_item_modifiers',
      'payment_transactions',
      'bill_items',
      'bill_taxes',
      'bill_discounts',
      'inventory_transactions',
      'stock_adjustments',
      'purchase_order_items',
      'item_addon_groups',
      'item_floors',
      'item_sections',
      'item_time_slots',
      'item_kitchen_stations',
      'item_counters',
      'category_floors',
      'category_sections',
      'category_time_slots',
      'user_floor_assignments',
      'user_section_assignments',
      'user_stations',
      'role_permissions',
      
      // Level 2: Mid-level dependent tables
      'kots',
      'bills',
      'payments',
      'orders',
      'variants',
      'addons',
      'addon_groups',
      'items',
      'categories',
      'tables',
      'sections',
      'floors',
      'time_slots',
      'kitchen_stations',
      'counters',
      'printers',
      'kitchen_displays',
      
      // Level 3: Inventory tables
      'inventory_items',
      'suppliers',
      'purchase_orders',
      'stock_locations',
      
      // Level 4: Report tables
      'daily_sales_summary',
      'hourly_sales_data',
      'item_sales_summary',
      'category_sales_summary',
      'payment_method_summary',
      'tax_collection_summary',
      'discount_usage_summary',
      'table_turnover_stats',
      'staff_performance_stats',
      'inventory_movement_log',
      'customer_feedback',
      'audit_logs',
      'system_logs',
      'notification_logs',
      'bulk_upload_logs',
      
      // Level 5: Config/Master tables
      'tax_groups',
      'tax_group_components',
      'discount_rules',
      'pricing_rules',
      'happy_hours',
      'menu_schedules',
      'reservation_settings',
      'reservations',
      'customers',
      'customer_addresses',
      
      // Level 6: User related
      'users',
      'user_roles',
      'roles',
      
      // Level 7: Parent table (delete last)
      'outlets'
    ];
    
    console.log('\nRecommended deletion order:');
    let order = 1;
    for (const tableName of deletionOrder) {
      const found = tableList.find(t => t.table === tableName);
      if (found) {
        console.log(`  ${order}. ${tableName.padEnd(35)} (${found.rowsInOutlet34} rows)`);
        order++;
      }
    }
    
    // Check for any tables we might have missed
    console.log('\n' + '='.repeat(70));
    console.log('TABLES NOT IN DELETION ORDER (may need to add):');
    console.log('='.repeat(70));
    
    for (const table of tableList) {
      if (!deletionOrder.includes(table.table)) {
        console.log(`  ⚠️  ${table.table} (${table.rowsInOutlet34} rows)`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

identifyOutletTables();
