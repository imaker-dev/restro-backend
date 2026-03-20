/**
 * Fix wastage_logs table — add missing columns for Module 10
 * The old table (migration 006) uses ingredient_id; we need inventory_item_id etc.
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

  const queries = [
    {
      label: 'Add inventory_item_id column',
      sql: 'ALTER TABLE wastage_logs ADD COLUMN inventory_item_id BIGINT UNSIGNED AFTER outlet_id'
    },
    {
      label: 'Add inventory_batch_id column',
      sql: 'ALTER TABLE wastage_logs ADD COLUMN inventory_batch_id BIGINT UNSIGNED AFTER inventory_item_id'
    },
    {
      label: 'Add quantity_in_base column',
      sql: 'ALTER TABLE wastage_logs ADD COLUMN quantity_in_base DECIMAL(15,4) NOT NULL DEFAULT 0 AFTER quantity'
    },
    {
      label: 'Add unit_id column',
      sql: 'ALTER TABLE wastage_logs ADD COLUMN unit_id BIGINT UNSIGNED AFTER quantity_in_base'
    },
    {
      label: 'Add wastage_type column',
      sql: "ALTER TABLE wastage_logs ADD COLUMN wastage_type ENUM('spoilage','expired','damaged','cooking_loss','other') NOT NULL DEFAULT 'spoilage' AFTER total_cost"
    },
    {
      label: 'Add reported_by column',
      sql: 'ALTER TABLE wastage_logs ADD COLUMN reported_by BIGINT UNSIGNED AFTER wastage_type'
    },
    {
      label: 'Add updated_at column',
      sql: 'ALTER TABLE wastage_logs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
    },
    {
      label: 'Add index on inventory_item_id',
      sql: 'ALTER TABLE wastage_logs ADD INDEX idx_wastage_inv_item (inventory_item_id)'
    },
    {
      label: 'Add index on wastage_type',
      sql: 'ALTER TABLE wastage_logs ADD INDEX idx_wastage_wtype (wastage_type)'
    },
    {
      label: 'Backfill inventory_item_id from ingredient_id',
      sql: `UPDATE wastage_logs wl
            JOIN ingredients ing ON wl.ingredient_id = ing.id
            SET wl.inventory_item_id = ing.inventory_item_id
            WHERE wl.inventory_item_id IS NULL AND ing.inventory_item_id IS NOT NULL`
    },
    {
      label: 'Backfill quantity_in_base = quantity where missing',
      sql: 'UPDATE wastage_logs SET quantity_in_base = quantity WHERE quantity_in_base = 0'
    },
    {
      label: 'Backfill reported_by from recorded_by',
      sql: 'UPDATE wastage_logs SET reported_by = recorded_by WHERE reported_by IS NULL AND recorded_by IS NOT NULL'
    },
    {
      label: 'Backfill wastage_type from reason column',
      sql: `UPDATE wastage_logs SET wastage_type = CASE
              WHEN reason = 'expired' THEN 'expired'
              WHEN reason = 'damaged' THEN 'damaged'
              WHEN reason = 'spillage' THEN 'spoilage'
              WHEN reason = 'preparation' THEN 'cooking_loss'
              ELSE 'other'
            END
            WHERE wastage_type = 'spoilage' AND reason IS NOT NULL`
    }
  ];

  for (const q of queries) {
    try {
      await pool.query(q.sql);
      console.log(`✅ ${q.label}`);
    } catch (e) {
      if (e.message.includes('Duplicate column') || e.message.includes('Duplicate key')) {
        console.log(`⏭️  ${q.label} — already exists`);
      } else {
        console.log(`❌ ${q.label}: ${e.message}`);
      }
    }
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
