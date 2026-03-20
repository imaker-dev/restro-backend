-- =====================================================
-- PURCHASE PAYMENT HISTORY
-- Track individual payments made against purchases
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method ENUM('cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other') DEFAULT 'cash',
    payment_reference VARCHAR(100),
    payment_date DATE NOT NULL,
    notes VARCHAR(255),
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_pp_purchase (purchase_id),
    INDEX idx_pp_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
