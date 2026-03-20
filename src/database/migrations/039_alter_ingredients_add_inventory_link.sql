-- =====================================================
-- ALTER ingredients table to add inventory_item_id link
-- This bridges the existing ingredients table to inventory_items
-- =====================================================

-- Add inventory_item_id column if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'inventory_item_id');

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE ingredients ADD COLUMN inventory_item_id BIGINT UNSIGNED NULL AFTER outlet_id',
    'SELECT "inventory_item_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add yield_percentage if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'yield_percentage');

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE ingredients ADD COLUMN yield_percentage DECIMAL(5,2) DEFAULT 100.00 AFTER description',
    'SELECT "yield_percentage already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add wastage_percentage if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'wastage_percentage');

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE ingredients ADD COLUMN wastage_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER yield_percentage',
    'SELECT "wastage_percentage already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add preparation_notes if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'preparation_notes');

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE ingredients ADD COLUMN preparation_notes TEXT NULL AFTER wastage_percentage',
    'SELECT "preparation_notes already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on inventory_item_id
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND INDEX_NAME = 'idx_ingredients_item');

SET @sql = IF(@idx_exists = 0, 
    'ALTER TABLE ingredients ADD INDEX idx_ingredients_item (inventory_item_id)',
    'SELECT "idx_ingredients_item already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key if not exists (optional - may fail if orphan data exists)
-- ALTER TABLE ingredients ADD CONSTRAINT fk_ingredients_inventory_item 
--     FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
