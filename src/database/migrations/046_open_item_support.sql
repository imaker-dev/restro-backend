-- =====================================================
-- OPEN ITEM SUPPORT
-- Allows cashier/manager to add manually-entered items
-- (name + price) to orders using category-based templates
-- =====================================================

-- 1. Mark items table entries as open-item templates
ALTER TABLE items
    ADD COLUMN IF NOT EXISTS is_open_item BOOLEAN DEFAULT FALSE AFTER is_active;

CREATE INDEX IF NOT EXISTS idx_items_is_open_item ON items(is_open_item);

-- 2. Track open items in order_items
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS is_open_item BOOLEAN DEFAULT FALSE AFTER stock_deducted;

CREATE INDEX IF NOT EXISTS idx_order_items_is_open_item ON order_items(is_open_item);
