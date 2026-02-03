-- =====================================================
-- SCHEMA UPDATES - ENUM Modifications
-- Run after initial setup to update existing schemas
-- =====================================================

-- Update tables.status ENUM to include 'running'
ALTER TABLE tables 
    MODIFY COLUMN status ENUM('available', 'occupied', 'running', 'reserved', 'billing', 'cleaning', 'blocked') DEFAULT 'available';

-- Update outlets.outlet_type ENUM (remove cloud_kitchen, add pub, lounge)
ALTER TABLE outlets 
    MODIFY COLUMN outlet_type ENUM('restaurant', 'bar', 'cafe', 'banquet', 'food_court', 'pub', 'lounge') DEFAULT 'restaurant';

-- Update sections to use VARCHAR instead of ENUM for flexibility
-- First add new column, migrate data, then drop old
ALTER TABLE sections
    ADD COLUMN IF NOT EXISTS section_type_new VARCHAR(50) DEFAULT 'dine_in';

UPDATE sections SET section_type_new = section_type WHERE section_type IS NOT NULL;

ALTER TABLE sections
    DROP COLUMN IF EXISTS section_type;

ALTER TABLE sections
    CHANGE COLUMN section_type_new section_type VARCHAR(50) DEFAULT 'dine_in';

-- Add index on new section_type column
CREATE INDEX IF NOT EXISTS idx_sections_type ON sections(section_type);

-- Add time_slot_id references to category_rules and item_rules
ALTER TABLE category_rules
    ADD COLUMN IF NOT EXISTS time_slot_id BIGINT UNSIGNED AFTER section_id;

ALTER TABLE item_rules
    ADD COLUMN IF NOT EXISTS time_slot_id BIGINT UNSIGNED AFTER section_id;

-- Add time_slot_id to price_rules
ALTER TABLE price_rules
    ADD COLUMN IF NOT EXISTS time_slot_id BIGINT UNSIGNED AFTER section_id;
