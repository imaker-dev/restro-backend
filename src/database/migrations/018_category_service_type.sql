-- =====================================================
-- CATEGORY SERVICE TYPE (Restaurant/Bar/Both)
-- =====================================================

-- Add service_type column to categories table
-- Values: 'restaurant', 'bar', 'both' (default: 'both')
ALTER TABLE categories 
    ADD COLUMN IF NOT EXISTS service_type ENUM('restaurant', 'bar', 'both') DEFAULT 'both' AFTER is_global;

-- Create index for faster service_type queries
CREATE INDEX IF NOT EXISTS idx_categories_service_type ON categories(service_type);

-- Add service_type to items table as well for item-level filtering
ALTER TABLE items 
    ADD COLUMN IF NOT EXISTS service_type ENUM('restaurant', 'bar', 'both') DEFAULT 'both' AFTER is_active;

-- Create index for faster item service_type queries
CREATE INDEX IF NOT EXISTS idx_items_service_type ON items(service_type);
