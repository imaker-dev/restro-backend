-- =============================================
-- PRINTER TABLE SCHEMA UPDATE
-- Adds missing columns needed by printer service:
--   uuid, code, station_id, characters_per_line,
--   supports_cash_drawer, supports_cutter, supports_logo,
--   is_online, last_seen_at
-- Expands printer_type ENUM and changes station to VARCHAR
-- =============================================

-- 1. Add uuid column
ALTER TABLE printers ADD COLUMN IF NOT EXISTS uuid VARCHAR(36) NULL AFTER id;

-- 2. Add code column
ALTER TABLE printers ADD COLUMN IF NOT EXISTS code VARCHAR(50) NULL AFTER name;

-- 3. Add station_id (FK to kitchen_stations)
ALTER TABLE printers ADD COLUMN IF NOT EXISTS station_id BIGINT UNSIGNED NULL AFTER station;

-- 4. Add characters_per_line
ALTER TABLE printers ADD COLUMN IF NOT EXISTS characters_per_line INT DEFAULT 48 AFTER paper_width;

-- 5. Add feature flags
ALTER TABLE printers ADD COLUMN IF NOT EXISTS supports_cash_drawer BOOLEAN DEFAULT FALSE AFTER characters_per_line;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS supports_cutter BOOLEAN DEFAULT TRUE AFTER supports_cash_drawer;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS supports_logo BOOLEAN DEFAULT FALSE AFTER supports_cutter;

-- 6. Add online status columns
ALTER TABLE printers ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE AFTER is_active;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS last_seen_at DATETIME NULL AFTER is_online;

-- 7. Expand printer_type ENUM to include kot/bot/bill/report/label
ALTER TABLE printers MODIFY COLUMN printer_type ENUM(
  'thermal','dot_matrix','laser','inkjet',
  'kot','bot','bill','report','label'
) DEFAULT 'thermal';

-- 8. Change station from ENUM to VARCHAR for flexibility
ALTER TABLE printers MODIFY COLUMN station VARCHAR(50) NULL;

-- 9. Add unique constraint on uuid (only non-null)
-- Backfill existing rows with generated UUIDs
UPDATE printers SET uuid = UUID() WHERE uuid IS NULL;

-- 10. Add index on station_id
ALTER TABLE printers ADD INDEX IF NOT EXISTS idx_printer_station_id (station_id);

-- 11. Add unique constraint on outlet_id + code (only if code is set)
-- Note: existing rows don't have code, so we skip unique constraint for now
