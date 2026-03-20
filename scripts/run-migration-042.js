/**
 * Run migration 042 — Production Reversal Support
 * Usage: node scripts/run-migration-042.js
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
      label: 'Add reversed_at column',
      sql: 'ALTER TABLE productions ADD COLUMN reversed_at DATETIME DEFAULT NULL AFTER notes'
    },
    {
      label: 'Add reversed_by column',
      sql: 'ALTER TABLE productions ADD COLUMN reversed_by BIGINT UNSIGNED DEFAULT NULL AFTER reversed_at'
    },
    {
      label: 'Add reversal_notes column',
      sql: 'ALTER TABLE productions ADD COLUMN reversal_notes TEXT DEFAULT NULL AFTER reversed_by'
    },
    {
      label: 'Update movement_type ENUM',
      sql: `ALTER TABLE inventory_movements MODIFY COLUMN movement_type ENUM('purchase','sale','production','wastage','adjustment','production_in','production_out','production_reversal') NOT NULL`
    },
    {
      label: 'Add index on reversed_at',
      sql: 'ALTER TABLE productions ADD INDEX idx_prod_reversed (reversed_at)'
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
