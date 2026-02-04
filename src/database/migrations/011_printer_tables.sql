-- =============================================
-- PRINTER MANAGEMENT TABLES
-- Supports: KOT printers (kitchen/bar/mocktail/dessert)
--           Bill printers (cashier)
--           Local bridge agent polling pattern
-- =============================================

-- Printer configuration per outlet/station
CREATE TABLE IF NOT EXISTS printers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    outlet_id INT NOT NULL,
    
    -- Printer identification
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    
    -- Printer type: kot, bot, bill, report, label
    printer_type ENUM('kot', 'bot', 'bill', 'report', 'label') NOT NULL DEFAULT 'kot',
    
    -- Station mapping (for KOT/BOT routing)
    station VARCHAR(50) NULL COMMENT 'kitchen, bar, mocktail, dessert, etc.',
    counter_id INT NULL,
    kitchen_station_id INT NULL,
    
    -- Connection details (for local bridge)
    ip_address VARCHAR(45) NULL,
    port INT DEFAULT 9100,
    connection_type ENUM('network', 'usb', 'bluetooth', 'cloud') DEFAULT 'network',
    
    -- Paper settings
    paper_width ENUM('58mm', '80mm') DEFAULT '80mm',
    characters_per_line INT DEFAULT 48,
    
    -- Features
    supports_cash_drawer BOOLEAN DEFAULT FALSE,
    supports_cutter BOOLEAN DEFAULT TRUE,
    supports_logo BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at DATETIME NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_printer_code (outlet_id, code),
    INDEX idx_printer_outlet (outlet_id),
    INDEX idx_printer_station (station),
    INDEX idx_printer_type (printer_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Print job queue
CREATE TABLE IF NOT EXISTS print_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    outlet_id INT NOT NULL,
    printer_id INT NULL,
    
    -- Job type: kot, bot, bill, duplicate_bill, report, test
    job_type ENUM('kot', 'bot', 'bill', 'duplicate_bill', 'report', 'test', 'cash_drawer') NOT NULL,
    
    -- Station for routing (kitchen, bar, mocktail, dessert, cashier)
    station VARCHAR(50) NOT NULL,
    
    -- Reference IDs
    kot_id INT NULL,
    order_id INT NULL,
    invoice_id INT NULL,
    
    -- Print content (formatted for thermal printer)
    content TEXT NOT NULL COMMENT 'ESC/POS formatted or plain text',
    content_type ENUM('escpos', 'text', 'html', 'json') DEFAULT 'text',
    
    -- Metadata for display
    reference_number VARCHAR(50) NULL COMMENT 'KOT number, Invoice number, etc.',
    table_number VARCHAR(20) NULL,
    
    -- Status tracking
    status ENUM('pending', 'processing', 'printed', 'failed', 'cancelled') DEFAULT 'pending',
    priority INT DEFAULT 0 COMMENT 'Higher = more urgent',
    
    -- Retry handling
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_error TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    printed_at DATETIME NULL,
    
    -- Who created the job
    created_by INT NULL,
    
    INDEX idx_job_outlet_station (outlet_id, station),
    INDEX idx_job_status (status),
    INDEX idx_job_pending (outlet_id, station, status, priority, created_at),
    INDEX idx_job_printer (printer_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Printer templates (customizable print formats)
CREATE TABLE IF NOT EXISTS print_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    outlet_id INT NULL COMMENT 'NULL = global template',
    
    -- Template identification
    name VARCHAR(100) NOT NULL,
    template_type ENUM('kot', 'bot', 'bill', 'duplicate_bill', 'report') NOT NULL,
    
    -- Template content (supports placeholders like {{order_number}})
    header_template TEXT NULL,
    body_template TEXT NOT NULL,
    footer_template TEXT NULL,
    
    -- Styling options
    show_logo BOOLEAN DEFAULT FALSE,
    logo_position ENUM('left', 'center', 'right') DEFAULT 'center',
    font_size ENUM('small', 'normal', 'large') DEFAULT 'normal',
    
    -- Content options
    show_prices BOOLEAN DEFAULT TRUE,
    show_tax_breakup BOOLEAN DEFAULT TRUE,
    show_qr_code BOOLEAN DEFAULT FALSE,
    qr_content VARCHAR(255) NULL COMMENT 'upi://pay?pa=... or custom',
    
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_template_type (template_type),
    INDEX idx_template_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bridge agent registration (local printer bridges)
CREATE TABLE IF NOT EXISTS printer_bridges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    outlet_id INT NOT NULL,
    
    -- Bridge identification
    name VARCHAR(100) NOT NULL,
    bridge_code VARCHAR(50) NOT NULL COMMENT 'Used for API authentication',
    api_key VARCHAR(255) NOT NULL COMMENT 'Hashed API key for bridge',
    
    -- Assigned printers (comma-separated printer IDs or stations)
    assigned_stations JSON NULL COMMENT '["kitchen", "bar"]',
    assigned_printer_ids JSON NULL COMMENT '[1, 2, 3]',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT FALSE,
    last_poll_at DATETIME NULL,
    last_ip VARCHAR(45) NULL,
    
    -- Stats
    total_jobs_printed INT DEFAULT 0,
    failed_jobs INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_bridge_code (outlet_id, bridge_code),
    INDEX idx_bridge_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Print job audit log
CREATE TABLE IF NOT EXISTS print_job_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    print_job_id INT NOT NULL,
    
    action ENUM('created', 'assigned', 'processing', 'printed', 'failed', 'retried', 'cancelled') NOT NULL,
    details TEXT NULL,
    bridge_id INT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_log_job (print_job_id),
    INDEX idx_log_bridge (bridge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default print templates
INSERT INTO print_templates (name, template_type, header_template, body_template, footer_template, is_default, is_active) VALUES
('Default KOT', 'kot', 
 '================================\n          KITCHEN ORDER\n================================',
 'KOT #: {{kot_number}}\nTable: {{table_number}}    Time: {{time}}\n--------------------------------\n{{#items}}\n{{quantity}} x {{item_name}}\n{{#variant}}   ({{variant}}){{/variant}}\n{{#instructions}}   >> {{instructions}}{{/instructions}}\n{{/items}}\n--------------------------------',
 'Captain: {{captain_name}}\n================================',
 TRUE, TRUE),

('Default BOT', 'bot',
 '================================\n           BAR ORDER\n================================',
 'BOT #: {{kot_number}}\nTable: {{table_number}}    Time: {{time}}\n--------------------------------\n{{#items}}\n{{quantity}} x {{item_name}}\n{{#variant}}   ({{variant}}){{/variant}}\n{{/items}}\n--------------------------------',
 'Captain: {{captain_name}}\n================================',
 TRUE, TRUE),

('Default Bill', 'bill',
 '================================\n       {{outlet_name}}\n       {{outlet_address}}\n   GSTIN: {{outlet_gstin}}\n================================',
 'Invoice: {{invoice_number}}\nDate: {{date}}    Time: {{time}}\nTable: {{table_number}}\n--------------------------------\n{{#items}}\n{{item_name}}\n   {{quantity}} x {{unit_price}} = {{total}}\n{{/items}}\n--------------------------------\nSubtotal:        {{subtotal}}\n{{#taxes}}\n{{name}} ({{rate}}%): {{amount}}\n{{/taxes}}\n{{#service_charge}}\nService Charge:  {{service_charge}}\n{{/service_charge}}\n{{#discount}}\nDiscount:       -{{discount}}\n{{/discount}}\n--------------------------------\nGRAND TOTAL:     {{grand_total}}\n================================',
 'Payment: {{payment_mode}}\n\nThank you for dining with us!\n================================',
 TRUE, TRUE);
