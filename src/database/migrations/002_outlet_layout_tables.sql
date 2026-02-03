-- =====================================================
-- OUTLET & LAYOUT DOMAIN TABLES
-- =====================================================

-- Outlets (Restaurant locations)
CREATE TABLE IF NOT EXISTS outlets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    legal_name VARCHAR(200),
    outlet_type ENUM('restaurant', 'bar', 'cafe', 'banquet', 'cloud_kitchen', 'food_court') DEFAULT 'restaurant',
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    gstin VARCHAR(20),
    fssai_number VARCHAR(20),
    pan_number VARCHAR(20),
    logo_url VARCHAR(500),
    currency_code VARCHAR(3) DEFAULT 'INR',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    opening_time TIME,
    closing_time TIME,
    is_24_hours BOOLEAN DEFAULT FALSE,
    default_tax_group_id BIGINT UNSIGNED,
    invoice_prefix VARCHAR(10),
    invoice_sequence INT DEFAULT 1,
    kot_prefix VARCHAR(10),
    kot_sequence INT DEFAULT 1,
    settings JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_by BIGINT UNSIGNED,
    updated_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    INDEX idx_outlets_code (code),
    INDEX idx_outlets_type (outlet_type),
    INDEX idx_outlets_is_active (is_active),
    INDEX idx_outlets_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Floors within outlets
CREATE TABLE IF NOT EXISTS floors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20),
    description VARCHAR(255),
    floor_number INT DEFAULT 0,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_floor_outlet_name (outlet_id, name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_floors_outlet (outlet_id),
    INDEX idx_floors_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sections (AC, Non-AC, Bar, Outdoor, etc.)
CREATE TABLE IF NOT EXISTS sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20),
    section_type ENUM('dine_in', 'takeaway', 'delivery', 'bar', 'rooftop', 'private', 'outdoor', 'ac', 'non_ac') DEFAULT 'dine_in',
    description VARCHAR(255),
    color_code VARCHAR(7),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_section_outlet_name (outlet_id, name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_sections_outlet (outlet_id),
    INDEX idx_sections_type (section_type),
    INDEX idx_sections_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Floor-Section mapping (which sections are on which floors)
CREATE TABLE IF NOT EXISTS floor_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    floor_id BIGINT UNSIGNED NOT NULL,
    section_id BIGINT UNSIGNED NOT NULL,
    tax_override_group_id BIGINT UNSIGNED,
    price_modifier_percent DECIMAL(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_floor_section (floor_id, section_id),
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_floor_sections_floor (floor_id),
    INDEX idx_floor_sections_section (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tables
CREATE TABLE IF NOT EXISTS tables (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    floor_id BIGINT UNSIGNED NOT NULL,
    section_id BIGINT UNSIGNED,
    table_number VARCHAR(20) NOT NULL,
    name VARCHAR(50),
    capacity INT DEFAULT 4,
    min_capacity INT DEFAULT 1,
    shape ENUM('square', 'rectangle', 'round', 'oval', 'custom') DEFAULT 'square',
    status ENUM('available', 'occupied', 'reserved', 'billing', 'cleaning', 'blocked') DEFAULT 'available',
    is_mergeable BOOLEAN DEFAULT TRUE,
    is_splittable BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    qr_code VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_table_outlet_number (outlet_id, table_number),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
    INDEX idx_tables_outlet (outlet_id),
    INDEX idx_tables_floor (floor_id),
    INDEX idx_tables_section (section_id),
    INDEX idx_tables_status (status),
    INDEX idx_tables_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table layout positions (for visual grid display)
CREATE TABLE IF NOT EXISTS table_layouts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_id BIGINT UNSIGNED NOT NULL UNIQUE,
    position_x INT DEFAULT 0,
    position_y INT DEFAULT 0,
    width INT DEFAULT 100,
    height INT DEFAULT 100,
    rotation INT DEFAULT 0,
    z_index INT DEFAULT 0,
    custom_style JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table sessions (tracks current occupancy)
CREATE TABLE IF NOT EXISTS table_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED,
    guest_count INT DEFAULT 1,
    guest_name VARCHAR(100),
    guest_phone VARCHAR(20),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    started_by BIGINT UNSIGNED,
    ended_by BIGINT UNSIGNED,
    status ENUM('active', 'billing', 'completed', 'cancelled') DEFAULT 'active',
    notes TEXT,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
    INDEX idx_table_sessions_table (table_id),
    INDEX idx_table_sessions_order (order_id),
    INDEX idx_table_sessions_status (status),
    INDEX idx_table_sessions_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Merged tables tracking
CREATE TABLE IF NOT EXISTS table_merges (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    primary_table_id BIGINT UNSIGNED NOT NULL,
    merged_table_id BIGINT UNSIGNED NOT NULL,
    table_session_id BIGINT UNSIGNED,
    merged_by BIGINT UNSIGNED,
    merged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unmerged_at DATETIME,
    unmerged_by BIGINT UNSIGNED,
    FOREIGN KEY (primary_table_id) REFERENCES tables(id) ON DELETE CASCADE,
    FOREIGN KEY (merged_table_id) REFERENCES tables(id) ON DELETE CASCADE,
    INDEX idx_table_merges_primary (primary_table_id),
    INDEX idx_table_merges_session (table_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table reservations
CREATE TABLE IF NOT EXISTS table_reservations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    table_id BIGINT UNSIGNED,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    guest_count INT DEFAULT 1,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    duration_minutes INT DEFAULT 120,
    status ENUM('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show') DEFAULT 'pending',
    special_requests TEXT,
    internal_notes TEXT,
    confirmed_by BIGINT UNSIGNED,
    cancelled_by BIGINT UNSIGNED,
    cancelled_reason VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
    INDEX idx_reservations_outlet (outlet_id),
    INDEX idx_reservations_table (table_id),
    INDEX idx_reservations_date (reservation_date),
    INDEX idx_reservations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
