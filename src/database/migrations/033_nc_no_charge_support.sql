-- =====================================================
-- NC (NO CHARGE) SUPPORT MIGRATION
-- Adds support for marking items/orders as NC (No Charge)
-- NC items are not charged but still appear in reports
-- =====================================================

-- NC Reasons table - predefined reasons for NC
CREATE TABLE IF NOT EXISTS nc_reasons (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_nc_reasons_outlet (outlet_id),
    INDEX idx_nc_reasons_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default NC reasons
INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order)
SELECT o.id, 'Staff Meal', 'Food provided to staff members', 1 FROM outlets o;

INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order)
SELECT o.id, 'Customer Complaint', 'Complimentary due to customer complaint', 2 FROM outlets o;

INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order)
SELECT o.id, 'Complimentary', 'Complimentary item/order for guest', 3 FROM outlets o;

INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order)
SELECT o.id, 'Owner Approval', 'NC approved by owner/management', 4 FROM outlets o;

INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order)
SELECT o.id, 'Testing Order', 'Order created for testing purposes', 5 FROM outlets o;

INSERT IGNORE INTO nc_reasons (outlet_id, name, description, display_order)
SELECT o.id, 'Promotional', 'Promotional giveaway', 6 FROM outlets o;

-- Add NC columns to order_items table
ALTER TABLE order_items
    ADD COLUMN is_nc BOOLEAN DEFAULT FALSE AFTER is_complimentary,
    ADD COLUMN nc_reason_id BIGINT UNSIGNED AFTER is_nc,
    ADD COLUMN nc_reason VARCHAR(255) AFTER nc_reason_id,
    ADD COLUMN nc_amount DECIMAL(12, 2) DEFAULT 0 AFTER nc_reason,
    ADD COLUMN nc_by BIGINT UNSIGNED AFTER nc_amount,
    ADD COLUMN nc_at DATETIME AFTER nc_by,
    ADD INDEX idx_order_items_nc (is_nc);

-- Add NC columns to orders table
ALTER TABLE orders
    ADD COLUMN is_nc BOOLEAN DEFAULT FALSE AFTER is_complimentary,
    ADD COLUMN nc_reason_id BIGINT UNSIGNED AFTER is_nc,
    ADD COLUMN nc_reason VARCHAR(255) AFTER nc_reason_id,
    ADD COLUMN nc_amount DECIMAL(12, 2) DEFAULT 0 AFTER nc_reason,
    ADD COLUMN nc_approved_by BIGINT UNSIGNED AFTER nc_amount,
    ADD COLUMN nc_at DATETIME AFTER nc_approved_by,
    ADD INDEX idx_orders_nc (is_nc);

-- Add NC columns to invoices table
ALTER TABLE invoices
    ADD COLUMN is_nc BOOLEAN DEFAULT FALSE AFTER is_cancelled,
    ADD COLUMN nc_amount DECIMAL(12, 2) DEFAULT 0 AFTER is_nc,
    ADD COLUMN payable_amount DECIMAL(12, 2) AFTER nc_amount;

-- NC Audit Logs table - track all NC actions
CREATE TABLE IF NOT EXISTS nc_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    order_item_id BIGINT UNSIGNED,
    action_type ENUM('item_nc', 'item_nc_removed', 'order_nc', 'order_nc_removed') NOT NULL,
    nc_reason_id BIGINT UNSIGNED,
    nc_reason VARCHAR(255),
    nc_amount DECIMAL(12, 2) NOT NULL,
    item_name VARCHAR(150),
    applied_by BIGINT UNSIGNED NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_nc_logs_outlet (outlet_id),
    INDEX idx_nc_logs_order (order_id),
    INDEX idx_nc_logs_date (applied_at),
    INDEX idx_nc_logs_user (applied_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update existing invoices to set payable_amount = grand_total (for backward compatibility)
UPDATE invoices SET payable_amount = grand_total WHERE payable_amount IS NULL;
