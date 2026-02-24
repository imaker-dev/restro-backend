-- =====================================================
-- KOT STATION TYPE FIX
-- Change station column from ENUM to VARCHAR to support
-- all kitchen_stations.station_type values
-- =====================================================

-- Change kot_tickets.station from ENUM to VARCHAR(50)
ALTER TABLE kot_tickets 
  MODIFY COLUMN station VARCHAR(50) DEFAULT 'main_kitchen';

-- Add station_id column for direct station reference
ALTER TABLE kot_tickets 
  ADD COLUMN station_id BIGINT UNSIGNED NULL AFTER station;

-- Add foreign key for station_id (optional, for data integrity)
ALTER TABLE kot_tickets 
  ADD INDEX idx_kot_station_id (station_id);

-- Update existing records: map old ENUM values to new station_type values
UPDATE kot_tickets SET station = 'main_kitchen' WHERE station = 'kitchen';
-- 'bar', 'dessert', 'other' remain as-is
