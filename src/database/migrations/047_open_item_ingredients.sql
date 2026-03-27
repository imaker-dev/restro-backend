-- =====================================================
-- MIGRATION 047: Open Item Ingredients
-- Allows cashiers to optionally attach ingredients to
-- open items for stock deduction tracking.
-- =====================================================

-- Store ad-hoc ingredients chosen by cashier for open items
-- These are used for stock deduction (same as recipe ingredients for regular items)
-- Reversal/cancellation is handled automatically via inventory_movements
CREATE TABLE IF NOT EXISTS order_item_ingredients (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_item_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(15, 4) NOT NULL,
    unit_id BIGINT UNSIGNED NOT NULL,
    conversion_factor DECIMAL(15, 6) NOT NULL DEFAULT 1.000000,
    quantity_in_base DECIMAL(15, 4) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id),
    INDEX idx_oii_order_item (order_item_id),
    INDEX idx_oii_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
