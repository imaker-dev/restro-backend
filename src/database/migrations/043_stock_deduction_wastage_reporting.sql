-- ============================================================
-- Migration 043: Stock Deduction, Wastage Management, Reporting
-- Modules 9, 10, 11
-- ============================================================

-- 1. Add 'sale_reversal' to movement_type ENUM for order cancel reversals
ALTER TABLE inventory_movements
    MODIFY COLUMN movement_type ENUM(
        'purchase', 'sale', 'production', 'wastage', 'adjustment',
        'production_in', 'production_out', 'production_reversal', 'sale_reversal'
    ) NOT NULL;

-- 2. Wastage Logs table
CREATE TABLE IF NOT EXISTS wastage_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    inventory_item_id BIGINT UNSIGNED NOT NULL,
    inventory_batch_id BIGINT UNSIGNED,
    quantity DECIMAL(15, 4) NOT NULL,
    quantity_in_base DECIMAL(15, 4) NOT NULL,
    unit_id BIGINT UNSIGNED,
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    wastage_type ENUM('spoilage', 'expired', 'damaged', 'cooking_loss', 'other') NOT NULL DEFAULT 'spoilage',
    reason TEXT,
    reported_by BIGINT UNSIGNED,
    approved_by BIGINT UNSIGNED,
    wastage_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
    FOREIGN KEY (unit_id) REFERENCES units(id),
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_wastage_outlet (outlet_id),
    INDEX idx_wastage_item (inventory_item_id),
    INDEX idx_wastage_batch (inventory_batch_id),
    INDEX idx_wastage_type (wastage_type),
    INDEX idx_wastage_date (wastage_date),
    INDEX idx_wastage_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Add stock_deducted flag to order_items for tracking
ALTER TABLE order_items
    ADD COLUMN stock_deducted TINYINT(1) DEFAULT 0 AFTER is_complimentary;

-- 4. Add stock_reversed flag to orders for tracking cancel reversals
ALTER TABLE orders
    ADD COLUMN stock_reversed TINYINT(1) DEFAULT 0 AFTER cancel_reason;
