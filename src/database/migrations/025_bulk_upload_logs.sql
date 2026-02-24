-- =====================================================
-- BULK UPLOAD LOGS TABLE
-- Tracks all bulk CSV uploads for menu items
-- =====================================================

CREATE TABLE IF NOT EXISTS bulk_upload_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED,
    filename VARCHAR(255),
    status ENUM('success', 'failed', 'partial') DEFAULT 'success',
    summary JSON,
    errors JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_bulk_upload_outlet (outlet_id),
    INDEX idx_bulk_upload_user (user_id),
    INDEX idx_bulk_upload_status (status),
    INDEX idx_bulk_upload_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
