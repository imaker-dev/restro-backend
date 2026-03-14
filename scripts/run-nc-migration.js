/**
 * Run NC (No Charge) migration
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('=== Running NC Migration ===\n');

    // 1. Create nc_reasons table
    console.log('1. Creating nc_reasons table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nc_reasons (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        outlet_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        display_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
        INDEX idx_nc_reasons_outlet (outlet_id),
        INDEX idx_nc_reasons_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ✓ nc_reasons table ready');

    // 2. Insert default NC reasons
    console.log('2. Inserting default NC reasons...');
    const reasons = [
      ['Staff Meal', 'Food provided to staff members', 1],
      ['Customer Complaint', 'Complimentary due to customer complaint', 2],
      ['Complimentary', 'Complimentary item/order for guest', 3],
      ['Owner Approval', 'NC approved by owner/management', 4],
      ['Testing Order', 'Order created for testing purposes', 5],
      ['Promotional', 'Promotional giveaway', 6]
    ];
    
    const [outlets] = await pool.query('SELECT id FROM outlets');
    for (const outlet of outlets) {
      for (const [name, desc, order] of reasons) {
        await pool.query(
          'INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order) VALUES (?, ?, ?, ?)',
          [outlet.id, name, desc, order]
        );
      }
    }
    console.log('   ✓ Default NC reasons inserted');

    // 3. Add NC columns to order_items
    console.log('3. Adding NC columns to order_items...');
    const orderItemCols = ['is_nc', 'nc_reason_id', 'nc_reason', 'nc_amount', 'nc_by', 'nc_at'];
    for (const col of orderItemCols) {
      const [existing] = await pool.query(`SHOW COLUMNS FROM order_items LIKE '${col}'`);
      if (existing.length === 0) {
        if (col === 'is_nc') {
          await pool.query('ALTER TABLE order_items ADD COLUMN is_nc BOOLEAN DEFAULT FALSE');
        } else if (col === 'nc_reason_id') {
          await pool.query('ALTER TABLE order_items ADD COLUMN nc_reason_id BIGINT UNSIGNED');
        } else if (col === 'nc_reason') {
          await pool.query('ALTER TABLE order_items ADD COLUMN nc_reason VARCHAR(255)');
        } else if (col === 'nc_amount') {
          await pool.query('ALTER TABLE order_items ADD COLUMN nc_amount DECIMAL(12, 2) DEFAULT 0');
        } else if (col === 'nc_by') {
          await pool.query('ALTER TABLE order_items ADD COLUMN nc_by BIGINT UNSIGNED');
        } else if (col === 'nc_at') {
          await pool.query('ALTER TABLE order_items ADD COLUMN nc_at DATETIME');
        }
        console.log(`   ✓ Added ${col}`);
      } else {
        console.log(`   - ${col} already exists`);
      }
    }

    // 4. Add NC columns to orders
    console.log('4. Adding NC columns to orders...');
    const orderCols = ['is_nc', 'nc_reason_id', 'nc_reason', 'nc_amount', 'nc_approved_by', 'nc_at'];
    for (const col of orderCols) {
      const [existing] = await pool.query(`SHOW COLUMNS FROM orders LIKE '${col}'`);
      if (existing.length === 0) {
        if (col === 'is_nc') {
          await pool.query('ALTER TABLE orders ADD COLUMN is_nc BOOLEAN DEFAULT FALSE');
        } else if (col === 'nc_reason_id') {
          await pool.query('ALTER TABLE orders ADD COLUMN nc_reason_id BIGINT UNSIGNED');
        } else if (col === 'nc_reason') {
          await pool.query('ALTER TABLE orders ADD COLUMN nc_reason VARCHAR(255)');
        } else if (col === 'nc_amount') {
          await pool.query('ALTER TABLE orders ADD COLUMN nc_amount DECIMAL(12, 2) DEFAULT 0');
        } else if (col === 'nc_approved_by') {
          await pool.query('ALTER TABLE orders ADD COLUMN nc_approved_by BIGINT UNSIGNED');
        } else if (col === 'nc_at') {
          await pool.query('ALTER TABLE orders ADD COLUMN nc_at DATETIME');
        }
        console.log(`   ✓ Added ${col}`);
      } else {
        console.log(`   - ${col} already exists`);
      }
    }

    // 5. Add NC columns to invoices
    console.log('5. Adding NC columns to invoices...');
    const invoiceCols = ['is_nc', 'nc_amount', 'payable_amount'];
    for (const col of invoiceCols) {
      const [existing] = await pool.query(`SHOW COLUMNS FROM invoices LIKE '${col}'`);
      if (existing.length === 0) {
        if (col === 'is_nc') {
          await pool.query('ALTER TABLE invoices ADD COLUMN is_nc BOOLEAN DEFAULT FALSE');
        } else if (col === 'nc_amount') {
          await pool.query('ALTER TABLE invoices ADD COLUMN nc_amount DECIMAL(12, 2) DEFAULT 0');
        } else if (col === 'payable_amount') {
          await pool.query('ALTER TABLE invoices ADD COLUMN payable_amount DECIMAL(12, 2)');
        }
        console.log(`   ✓ Added ${col}`);
      } else {
        console.log(`   - ${col} already exists`);
      }
    }

    // 6. Create nc_logs table
    console.log('6. Creating nc_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nc_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        outlet_id BIGINT UNSIGNED NOT NULL,
        order_id BIGINT UNSIGNED NOT NULL,
        order_item_id BIGINT UNSIGNED,
        action_type ENUM('item_nc', 'item_nc_removed', 'order_nc', 'order_nc_removed') NOT NULL,
        nc_reason_id BIGINT UNSIGNED,
        nc_reason VARCHAR(255),
        nc_amount DECIMAL(12, 2) NOT NULL,
        item_name VARCHAR(150),
        applied_by BIGINT UNSIGNED NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        INDEX idx_nc_logs_outlet (outlet_id),
        INDEX idx_nc_logs_order (order_id),
        INDEX idx_nc_logs_date (applied_at),
        INDEX idx_nc_logs_user (applied_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ✓ nc_logs table ready');

    // 7. Update existing invoices payable_amount
    console.log('7. Updating existing invoices payable_amount...');
    await pool.query('UPDATE invoices SET payable_amount = grand_total WHERE payable_amount IS NULL');
    console.log('   ✓ Existing invoices updated');

    // 8. Add indexes
    console.log('8. Adding indexes...');
    try {
      await pool.query('CREATE INDEX idx_order_items_nc ON order_items(is_nc)');
      console.log('   ✓ Added idx_order_items_nc');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') console.log('   - idx_order_items_nc already exists');
      else throw e;
    }
    try {
      await pool.query('CREATE INDEX idx_orders_nc ON orders(is_nc)');
      console.log('   ✓ Added idx_orders_nc');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') console.log('   - idx_orders_nc already exists');
      else throw e;
    }

    console.log('\n=== NC Migration Completed Successfully ===');

  } catch (error) {
    console.error('Migration error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
