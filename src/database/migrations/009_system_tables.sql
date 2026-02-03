-- =====================================================
-- SYSTEM & CONFIGURATION TABLES
-- =====================================================

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description VARCHAR(255),
    is_editable BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_setting (outlet_id, setting_key),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_settings_outlet (outlet_id),
    INDEX idx_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Printers configuration
CREATE TABLE IF NOT EXISTS printers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    printer_type ENUM('thermal', 'dot_matrix', 'laser', 'inkjet') DEFAULT 'thermal',
    connection_type ENUM('usb', 'network', 'bluetooth', 'serial') DEFAULT 'network',
    ip_address VARCHAR(45),
    port INT,
    mac_address VARCHAR(20),
    paper_width ENUM('58mm', '80mm', 'a4', 'a5') DEFAULT '80mm',
    station ENUM('kot_kitchen', 'kot_bar', 'kot_dessert', 'bill', 'report', 'all') DEFAULT 'all',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_printers_outlet (outlet_id),
    INDEX idx_printers_station (station)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Devices registration
CREATE TABLE IF NOT EXISTS devices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(100),
    device_type ENUM('captain_app', 'manager_app', 'kds', 'pos_terminal', 'kiosk') NOT NULL,
    os VARCHAR(50),
    os_version VARCHAR(20),
    app_version VARCHAR(20),
    fcm_token TEXT,
    last_active_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_reason VARCHAR(255),
    registered_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device (outlet_id, device_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_devices_outlet (outlet_id),
    INDEX idx_devices_type (device_type),
    INDEX idx_devices_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity logs / Audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    user_id BIGINT UNSIGNED,
    user_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id BIGINT UNSIGNED,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_id VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_outlet (outlet_id),
    INDEX idx_activity_user (user_id),
    INDEX idx_activity_action (action),
    INDEX idx_activity_entity (entity_type, entity_id),
    INDEX idx_activity_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    user_id BIGINT UNSIGNED,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type ENUM('order', 'kot', 'payment', 'table', 'inventory', 'alert', 'system') DEFAULT 'system',
    priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
    data JSON,
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_notifications_outlet (outlet_id),
    INDEX idx_notifications_user (user_id),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- File uploads
CREATE TABLE IF NOT EXISTS file_uploads (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    mime_type VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id BIGINT UNSIGNED,
    uploaded_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_uploads_outlet (outlet_id),
    INDEX idx_uploads_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration tracking
CREATE TABLE IF NOT EXISTS migrations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    batch INT NOT NULL,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scheduled tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    cron_expression VARCHAR(100),
    task_type VARCHAR(50) NOT NULL,
    task_data JSON,
    last_run_at DATETIME,
    next_run_at DATETIME,
    last_status ENUM('success', 'failed', 'running') DEFAULT 'success',
    last_error TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_scheduled_tasks_is_active (is_active),
    INDEX idx_scheduled_tasks_next_run (next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API rate limiting tracking
CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INT DEFAULT 0,
    window_start DATETIME NOT NULL,
    window_end DATETIME NOT NULL,
    UNIQUE KEY uk_rate_limit (identifier, endpoint, window_start),
    INDEX idx_rate_limits_identifier (identifier),
    INDEX idx_rate_limits_window (window_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Error logs
CREATE TABLE IF NOT EXISTS error_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    user_id BIGINT UNSIGNED,
    error_code VARCHAR(50),
    error_message TEXT,
    stack_trace TEXT,
    request_url VARCHAR(500),
    request_method VARCHAR(10),
    request_body JSON,
    request_headers JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_error_logs_outlet (outlet_id),
    INDEX idx_error_logs_code (error_code),
    INDEX idx_error_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WhatsApp/SMS notification logs
CREATE TABLE IF NOT EXISTS notification_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    type ENUM('whatsapp', 'sms', 'email', 'push') NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    template_name VARCHAR(100),
    message TEXT,
    status ENUM('pending', 'sent', 'delivered', 'failed') DEFAULT 'pending',
    provider VARCHAR(50),
    provider_message_id VARCHAR(255),
    error_message TEXT,
    metadata JSON,
    sent_at DATETIME,
    delivered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_logs_outlet (outlet_id),
    INDEX idx_notification_logs_type (type),
    INDEX idx_notification_logs_status (status),
    INDEX idx_notification_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
