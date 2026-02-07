-- =====================================================
-- MENU ENGINE ENHANCEMENTS V2
-- isGlobal flags, addon images, improved routing
-- =====================================================

-- Add isGlobal flag to items (visible everywhere when true)
ALTER TABLE items 
    ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE AFTER is_active;

-- Add isGlobal flag to categories (visible everywhere when true)
ALTER TABLE categories 
    ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE AFTER is_active;

-- Add image_url to addons
ALTER TABLE addons 
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) AFTER item_type;

-- Add image_url to addon_groups
ALTER TABLE addon_groups 
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) AFTER description;

-- Add display_id to kitchen_stations for KDS routing
ALTER TABLE kitchen_stations 
    ADD COLUMN IF NOT EXISTS display_id BIGINT UNSIGNED AFTER printer_id;

-- Add display_id to counters for BOT display routing
ALTER TABLE counters 
    ADD COLUMN IF NOT EXISTS display_id BIGINT UNSIGNED AFTER printer_id;

-- Create index for faster global item queries
CREATE INDEX IF NOT EXISTS idx_items_is_global ON items(is_global);
CREATE INDEX IF NOT EXISTS idx_categories_is_global ON categories(is_global);

-- Add station priority for mixed order routing
ALTER TABLE kitchen_stations 
    ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0 AFTER display_order;

ALTER TABLE counters 
    ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0 AFTER display_order;
