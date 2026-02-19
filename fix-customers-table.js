/**
 * Fix customers table - add missing GST columns
 */
require('dotenv').config();
const { initializeDatabase, getPool } = require('./src/database');

async function fixCustomersTable() {
  await initializeDatabase();
  const pool = getPool();

  console.log('Connected to database');

  try {
    // Check if customers table exists
    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers'`,
      [process.env.DB_NAME || 'restro']
    );

    if (tables.length === 0) {
      console.log('Customers table does not exist. Creating...');
      await pool.query(`
        CREATE TABLE customers (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          uuid VARCHAR(36) NOT NULL UNIQUE,
          outlet_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(150) NOT NULL,
          phone VARCHAR(20),
          email VARCHAR(255),
          address TEXT,
          is_gst_customer BOOLEAN DEFAULT FALSE,
          company_name VARCHAR(200),
          gstin VARCHAR(20),
          gst_state VARCHAR(100),
          gst_state_code VARCHAR(5),
          company_phone VARCHAR(20),
          company_address TEXT,
          total_orders INT DEFAULT 0,
          total_spent DECIMAL(14, 2) DEFAULT 0,
          last_order_at DATETIME,
          notes TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_customers_outlet (outlet_id),
          INDEX idx_customers_phone (phone),
          INDEX idx_customers_gstin (gstin),
          INDEX idx_customers_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Customers table created');
    } else {
      console.log('Customers table exists. Checking for missing columns...');

      // Get existing columns
      const [columns] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers'`,
        [process.env.DB_NAME || 'restro']
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      console.log('Existing columns:', existingColumns.join(', '));

      // Add missing columns
      const columnsToAdd = [
        { name: 'is_gst_customer', definition: 'BOOLEAN DEFAULT FALSE AFTER address' },
        { name: 'company_name', definition: 'VARCHAR(200) AFTER is_gst_customer' },
        { name: 'gstin', definition: 'VARCHAR(20) AFTER company_name' },
        { name: 'gst_state', definition: 'VARCHAR(100) AFTER gstin' },
        { name: 'gst_state_code', definition: 'VARCHAR(5) AFTER gst_state' },
        { name: 'company_phone', definition: 'VARCHAR(20) AFTER gst_state_code' },
        { name: 'company_address', definition: 'TEXT AFTER company_phone' },
        { name: 'total_orders', definition: 'INT DEFAULT 0 AFTER company_address' },
        { name: 'total_spent', definition: 'DECIMAL(14, 2) DEFAULT 0 AFTER total_orders' },
        { name: 'last_order_at', definition: 'DATETIME AFTER total_spent' },
        { name: 'notes', definition: 'TEXT AFTER last_order_at' },
        { name: 'is_active', definition: 'BOOLEAN DEFAULT TRUE AFTER notes' }
      ];

      for (const col of columnsToAdd) {
        if (!existingColumns.includes(col.name)) {
          try {
            await pool.query(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.definition}`);
            console.log(`✅ Added column: ${col.name}`);
          } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
              console.log(`⏭️  Column ${col.name} already exists`);
            } else {
              console.error(`❌ Error adding ${col.name}:`, err.message);
            }
          }
        } else {
          console.log(`⏭️  Column ${col.name} already exists`);
        }
      }
    }

    console.log('\n✅ Customers table fix complete!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixCustomersTable();
