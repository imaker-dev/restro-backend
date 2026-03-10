-- =====================================================
-- ONLINE ORDER INTEGRATION TABLES
-- Migration: 030_online_order_integration.sql
-- Purpose: Swiggy/Zomato integration via Dyno APIs
-- =====================================================

-- Integration Channels (Swiggy, Zomato, etc.)
CREATE TABLE IF NOT EXISTS integration_channels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    channel_name ENUM('swiggy', 'zomato', 'uber_eats', 'dunzo', 'other') NOT NULL,
    channel_display_name VARCHAR(50) NOT NULL,
    
    -- Dyno API Credentials
    dyno_order_id VARCHAR(50),
    dyno_access_token VARCHAR(100),
    property_id VARCHAR(50),
    property_name VARCHAR(100),
    property_area VARCHAR(100),
    
    -- Webhook Configuration
    webhook_secret VARCHAR(255),
    webhook_url VARCHAR(255),
    
    -- Settings
    is_active BOOLEAN DEFAULT TRUE,
    auto_accept_orders BOOLEAN DEFAULT FALSE,
    auto_print_kot BOOLEAN DEFAULT TRUE,
    default_prep_time INT DEFAULT 20,
    
    -- Sync Status
    last_sync_at DATETIME,
    sync_status ENUM('active', 'error', 'paused') DEFAULT 'active',
    sync_error_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_outlet_channel (outlet_id, channel_name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_channel_active (is_active, channel_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Online Orders (External Order Tracking)
CREATE TABLE IF NOT EXISTS online_orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    channel_id BIGINT UNSIGNED NOT NULL,
    pos_order_id BIGINT UNSIGNED,
    
    -- External IDs
    external_order_id VARCHAR(100) NOT NULL,
    dyno_order_id VARCHAR(100),
    
    -- Platform Info
    platform ENUM('swiggy', 'zomato', 'uber_eats', 'dunzo', 'other') NOT NULL,
    platform_order_number VARCHAR(50),
    
    -- Customer Info (from platform)
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    customer_address TEXT,
    customer_instructions TEXT,
    
    -- Order Details
    order_type ENUM('delivery', 'pickup') DEFAULT 'delivery',
    payment_method ENUM('prepaid', 'cod', 'wallet') NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    
    -- Amounts (from platform)
    item_total DECIMAL(12,2) DEFAULT 0,
    platform_discount DECIMAL(12,2) DEFAULT 0,
    delivery_charge DECIMAL(12,2) DEFAULT 0,
    packaging_charge DECIMAL(12,2) DEFAULT 0,
    taxes DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    
    -- Timing
    order_placed_at DATETIME,
    estimated_delivery_at DATETIME,
    accepted_at DATETIME,
    food_ready_at DATETIME,
    picked_up_at DATETIME,
    delivered_at DATETIME,
    cancelled_at DATETIME,
    
    -- Status Tracking
    platform_status VARCHAR(50),
    pos_status ENUM('received', 'accepted', 'rejected', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled') DEFAULT 'received',
    last_status_sync_at DATETIME,
    
    -- Cancellation
    cancel_reason VARCHAR(255),
    cancelled_by ENUM('restaurant', 'customer', 'platform'),
    
    -- Raw Data
    raw_order_data JSON,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_external_order (channel_id, external_order_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES integration_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (pos_order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_online_orders_outlet (outlet_id),
    INDEX idx_online_orders_platform (platform),
    INDEX idx_online_orders_status (pos_status),
    INDEX idx_online_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Channel Menu Mapping (Map external items to POS items)
CREATE TABLE IF NOT EXISTS channel_menu_mapping (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel_id BIGINT UNSIGNED NOT NULL,
    
    -- External Item
    external_item_id VARCHAR(100) NOT NULL,
    external_item_name VARCHAR(200),
    external_variant_id VARCHAR(100),
    external_variant_name VARCHAR(100),
    external_addon_id VARCHAR(100),
    external_addon_name VARCHAR(100),
    
    -- POS Item
    pos_item_id BIGINT UNSIGNED,
    pos_variant_id BIGINT UNSIGNED,
    pos_addon_id BIGINT UNSIGNED,
    
    -- Mapping Status
    is_mapped BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    
    -- Audit
    mapped_by BIGINT UNSIGNED,
    mapped_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_channel_external_item (channel_id, external_item_id, external_variant_id, external_addon_id),
    FOREIGN KEY (channel_id) REFERENCES integration_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (pos_item_id) REFERENCES items(id) ON DELETE SET NULL,
    FOREIGN KEY (pos_variant_id) REFERENCES variants(id) ON DELETE SET NULL,
    FOREIGN KEY (pos_addon_id) REFERENCES addons(id) ON DELETE SET NULL,
    INDEX idx_mapping_item (pos_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integration Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS integration_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    channel_id BIGINT UNSIGNED,
    online_order_id BIGINT UNSIGNED,
    
    -- Log Details
    log_type ENUM('webhook_received', 'order_created', 'status_update', 'status_sync', 'error', 'retry', 'menu_sync') NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    
    -- Request/Response
    endpoint VARCHAR(255),
    method VARCHAR(10),
    request_headers JSON,
    request_body JSON,
    response_status INT,
    response_body JSON,
    
    -- Status
    status ENUM('success', 'failed', 'pending') DEFAULT 'pending',
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timing
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    duration_ms INT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES integration_channels(id) ON DELETE SET NULL,
    FOREIGN KEY (online_order_id) REFERENCES online_orders(id) ON DELETE SET NULL,
    INDEX idx_logs_outlet (outlet_id),
    INDEX idx_logs_type (log_type),
    INDEX idx_logs_status (status),
    INDEX idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ALTER EXISTING ORDERS TABLE
-- =====================================================

-- Add source and external tracking columns to orders table
-- Using separate ALTER statements for compatibility

-- Add source column if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'source');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE orders ADD COLUMN source ENUM(''pos'', ''swiggy'', ''zomato'', ''uber_eats'', ''dunzo'', ''other'') DEFAULT ''pos'' AFTER order_type',
    'SELECT ''source column exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add external_order_id column if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'external_order_id');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE orders ADD COLUMN external_order_id VARCHAR(100) AFTER source',
    'SELECT ''external_order_id column exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add online_order_id column if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'online_order_id');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE orders ADD COLUMN online_order_id BIGINT UNSIGNED AFTER external_order_id',
    'SELECT ''online_order_id column exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indexes (will silently fail if exists)
CREATE INDEX idx_orders_source ON orders(source);
CREATE INDEX idx_orders_external ON orders(external_order_id);

-- =====================================================
-- SYSTEM USER FOR ONLINE ORDERS
-- =====================================================

-- Insert system user for online order creation (if not exists)
INSERT IGNORE INTO users (name, email, phone, password_hash, is_active, is_system_user)
VALUES ('Online Order System', 'system.online@restropos.local', '0000000000', 
        '$2b$10$placeholder_hash_not_for_login', 1, 1);
