-- =====================================================
-- CUSTOMER DUE BALANCE TRACKING
-- Allows partial payments when customer name & phone available
-- =====================================================

-- Add due_balance to customers table for tracking outstanding amounts
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS due_balance DECIMAL(14, 2) DEFAULT 0 AFTER total_spent,
    ADD COLUMN IF NOT EXISTS total_due_collected DECIMAL(14, 2) DEFAULT 0 AFTER due_balance;

-- Customer due transactions - tracks all due payments and settlements
CREATE TABLE IF NOT EXISTS customer_due_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    outlet_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED,
    invoice_id BIGINT UNSIGNED,
    payment_id BIGINT UNSIGNED,
    
    -- Transaction type: 'due_created' when payment is short, 'due_collected' when due is paid
    transaction_type ENUM('due_created', 'due_collected', 'due_adjusted', 'due_waived') NOT NULL,
    
    -- Amount (positive for due_created, negative for collected/waived)
    amount DECIMAL(12, 2) NOT NULL,
    
    -- Running balance after this transaction
    balance_after DECIMAL(14, 2) NOT NULL,
    
    -- Payment details for collection
    payment_mode ENUM('cash', 'card', 'upi', 'wallet', 'credit', 'adjustment') DEFAULT NULL,
    transaction_id VARCHAR(100),
    reference_number VARCHAR(100),
    
    notes TEXT,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    
    INDEX idx_due_trans_outlet (outlet_id),
    INDEX idx_due_trans_customer (customer_id),
    INDEX idx_due_trans_order (order_id),
    INDEX idx_due_trans_type (transaction_type),
    INDEX idx_due_trans_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add due amount tracking to invoices
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 2) DEFAULT 0 AFTER grand_total,
    ADD COLUMN IF NOT EXISTS due_amount DECIMAL(12, 2) DEFAULT 0 AFTER paid_amount,
    ADD COLUMN IF NOT EXISTS is_due_payment BOOLEAN DEFAULT FALSE AFTER due_amount;

-- Add index for due amount queries
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_is_due ON invoices(is_due_payment);
CREATE INDEX IF NOT EXISTS idx_customers_due ON customers(due_balance);

-- Add payment linkage for due collections
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS is_due_collection BOOLEAN DEFAULT FALSE AFTER refund_reference,
    ADD COLUMN IF NOT EXISTS due_transaction_id BIGINT UNSIGNED AFTER is_due_collection;
