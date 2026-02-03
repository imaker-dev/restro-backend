-- =====================================================
-- MENU ENGINE ENHANCEMENTS
-- Time Slots, Counters, Kitchen Stations
-- =====================================================

-- Time Slots (for time-based menu visibility)
CREATE TABLE IF NOT EXISTS time_slots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20),
    description VARCHAR(255),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    active_days JSON DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_time_slot_outlet_name (outlet_id, name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_time_slots_outlet (outlet_id),
    INDEX idx_time_slots_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Counters / Service Points (Bar counters, live counters, etc.)
CREATE TABLE IF NOT EXISTS counters (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    floor_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    counter_type VARCHAR(50) DEFAULT 'main_bar',
    description VARCHAR(255),
    printer_id BIGINT UNSIGNED,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_counter_outlet_name (outlet_id, name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE SET NULL,
    INDEX idx_counters_outlet (outlet_id),
    INDEX idx_counters_floor (floor_id),
    INDEX idx_counters_type (counter_type),
    INDEX idx_counters_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kitchen Stations (for KOT routing)
CREATE TABLE IF NOT EXISTS kitchen_stations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    station_type VARCHAR(50) DEFAULT 'main_kitchen',
    description VARCHAR(255),
    printer_id BIGINT UNSIGNED,
    display_id BIGINT UNSIGNED,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_station_outlet_name (outlet_id, name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_kitchen_stations_outlet (outlet_id),
    INDEX idx_kitchen_stations_type (station_type),
    INDEX idx_kitchen_stations_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item to Kitchen Station mapping (which station prepares which items)
CREATE TABLE IF NOT EXISTS item_kitchen_stations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    kitchen_station_id BIGINT UNSIGNED NOT NULL,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_station (item_id, kitchen_station_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (kitchen_station_id) REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    INDEX idx_item_stations_item (item_id),
    INDEX idx_item_stations_station (kitchen_station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item to Counter mapping (for bar items)
CREATE TABLE IF NOT EXISTS item_counters (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    counter_id BIGINT UNSIGNED NOT NULL,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_counter (item_id, counter_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE CASCADE,
    INDEX idx_item_counters_item (item_id),
    INDEX idx_item_counters_counter (counter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Category visibility by time slot
CREATE TABLE IF NOT EXISTS category_time_slots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    time_slot_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_category_time_slot (category_id, time_slot_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
    INDEX idx_category_time_slots_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item visibility by time slot
CREATE TABLE IF NOT EXISTS item_time_slots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    time_slot_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    price_override DECIMAL(10, 2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_time_slot (item_id, time_slot_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
    INDEX idx_item_time_slots_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Category visibility by outlet (multi-outlet support)
CREATE TABLE IF NOT EXISTS category_outlets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_category_outlet (category_id, outlet_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_category_outlets_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Category visibility by floor
CREATE TABLE IF NOT EXISTS category_floors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    floor_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_category_floor (category_id, floor_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    INDEX idx_category_floors_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Category visibility by section
CREATE TABLE IF NOT EXISTS category_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    section_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_category_section (category_id, section_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_category_sections_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item visibility by floor
CREATE TABLE IF NOT EXISTS item_floors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    floor_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    price_override DECIMAL(10, 2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_floor (item_id, floor_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    INDEX idx_item_floors_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item visibility by section
CREATE TABLE IF NOT EXISTS item_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    section_id BIGINT UNSIGNED NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    price_override DECIMAL(10, 2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_section (item_id, section_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_item_sections_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Business profile / Company settings (for invoices, GST logic)
CREATE TABLE IF NOT EXISTS business_profile (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    business_name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    gstin VARCHAR(20),
    pan_number VARCHAR(20),
    cin_number VARCHAR(25),
    state VARCHAR(100),
    state_code VARCHAR(5),
    country VARCHAR(100) DEFAULT 'India',
    currency_code VARCHAR(3) DEFAULT 'INR',
    currency_symbol VARCHAR(5) DEFAULT '₹',
    logo_url VARCHAR(500),
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    financial_year_start TINYINT DEFAULT 4,
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    time_format VARCHAR(10) DEFAULT '12h',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alter tables to add new columns and update ENUMs
-- Note: These are safe ALTER statements that add columns if they don't exist

-- Add kitchen_station_id to items table
ALTER TABLE items 
    ADD COLUMN IF NOT EXISTS kitchen_station_id BIGINT UNSIGNED AFTER preparation_time_mins,
    ADD COLUMN IF NOT EXISTS counter_id BIGINT UNSIGNED AFTER kitchen_station_id,
    ADD COLUMN IF NOT EXISTS allow_special_notes BOOLEAN DEFAULT TRUE AFTER is_customizable,
    ADD COLUMN IF NOT EXISTS min_quantity INT DEFAULT 1 AFTER allow_special_notes,
    ADD COLUMN IF NOT EXISTS max_quantity INT AFTER min_quantity,
    ADD COLUMN IF NOT EXISTS step_quantity INT DEFAULT 1 AFTER max_quantity;

-- Add inventory_multiplier to variants
ALTER TABLE variants
    ADD COLUMN IF NOT EXISTS inventory_multiplier DECIMAL(5, 3) DEFAULT 1.000 AFTER is_default;
