-- =====================================================
-- PRICING & TAX ENGINE TABLES
-- =====================================================

-- Price rules (dynamic pricing based on time/floor/section)
CREATE TABLE IF NOT EXISTS price_rules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    rule_type ENUM('floor', 'section', 'time_slot', 'day_of_week', 'date_range', 'happy_hour') NOT NULL,
    item_id BIGINT UNSIGNED,
    variant_id BIGINT UNSIGNED,
    category_id BIGINT UNSIGNED,
    floor_id BIGINT UNSIGNED,
    section_id BIGINT UNSIGNED,
    time_start TIME,
    time_end TIME,
    days_of_week VARCHAR(20),
    date_start DATE,
    date_end DATE,
    adjustment_type ENUM('fixed', 'percentage', 'override') NOT NULL DEFAULT 'percentage',
    adjustment_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_price_rules_outlet (outlet_id),
    INDEX idx_price_rules_type (rule_type),
    INDEX idx_price_rules_item (item_id),
    INDEX idx_price_rules_category (category_id),
    INDEX idx_price_rules_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax types (GST, VAT, etc.)
CREATE TABLE IF NOT EXISTS tax_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tax_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax components (CGST, SGST, IGST, VAT, etc.)
CREATE TABLE IF NOT EXISTS tax_components (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tax_type_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20) NOT NULL,
    rate DECIMAL(5, 2) NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tax_type_id) REFERENCES tax_types(id) ON DELETE CASCADE,
    INDEX idx_tax_components_type (tax_type_id),
    INDEX idx_tax_components_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax groups (combination of tax components)
CREATE TABLE IF NOT EXISTS tax_groups (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    description VARCHAR(255),
    total_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    is_inclusive BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_tax_groups_outlet (outlet_id),
    INDEX idx_tax_groups_code (code),
    INDEX idx_tax_groups_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax group components mapping
CREATE TABLE IF NOT EXISTS tax_group_components (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tax_group_id BIGINT UNSIGNED NOT NULL,
    tax_component_id BIGINT UNSIGNED NOT NULL,
    rate_override DECIMAL(5, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tax_group_component (tax_group_id, tax_component_id),
    FOREIGN KEY (tax_group_id) REFERENCES tax_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (tax_component_id) REFERENCES tax_components(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax rules (override based on floor/section)
CREATE TABLE IF NOT EXISTS tax_rules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    rule_type ENUM('floor', 'section', 'item_type', 'category', 'order_type') NOT NULL,
    floor_id BIGINT UNSIGNED,
    section_id BIGINT UNSIGNED,
    category_id BIGINT UNSIGNED,
    item_type ENUM('veg', 'non_veg', 'egg', 'vegan'),
    order_type ENUM('dine_in', 'takeaway', 'delivery'),
    tax_group_id BIGINT UNSIGNED NOT NULL,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (tax_group_id) REFERENCES tax_groups(id) ON DELETE CASCADE,
    INDEX idx_tax_rules_outlet (outlet_id),
    INDEX idx_tax_rules_type (rule_type),
    INDEX idx_tax_rules_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Service charge configuration
CREATE TABLE IF NOT EXISTS service_charges (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    is_percentage BOOLEAN DEFAULT TRUE,
    min_bill_amount DECIMAL(10, 2) DEFAULT 0,
    max_charge_amount DECIMAL(10, 2),
    apply_on ENUM('subtotal', 'after_discount', 'after_tax') DEFAULT 'subtotal',
    is_taxable BOOLEAN DEFAULT FALSE,
    tax_group_id BIGINT UNSIGNED,
    floor_id BIGINT UNSIGNED,
    section_id BIGINT UNSIGNED,
    is_optional BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (tax_group_id) REFERENCES tax_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_service_charges_outlet (outlet_id),
    INDEX idx_service_charges_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discount master
CREATE TABLE IF NOT EXISTS discounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    discount_type ENUM('percentage', 'flat', 'item_level', 'bill_level', 'buy_x_get_y') NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    max_discount_amount DECIMAL(10, 2),
    min_order_amount DECIMAL(10, 2) DEFAULT 0,
    min_quantity INT DEFAULT 1,
    applicable_on ENUM('all', 'category', 'item', 'order_type') DEFAULT 'all',
    category_ids JSON,
    item_ids JSON,
    order_types JSON,
    valid_from DATETIME,
    valid_until DATETIME,
    usage_limit INT,
    usage_count INT DEFAULT 0,
    per_user_limit INT,
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_role_id BIGINT UNSIGNED,
    is_auto_apply BOOLEAN DEFAULT FALSE,
    is_combinable BOOLEAN DEFAULT FALSE,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_discounts_outlet (outlet_id),
    INDEX idx_discounts_code (code),
    INDEX idx_discounts_type (discount_type),
    INDEX idx_discounts_valid (valid_from, valid_until),
    INDEX idx_discounts_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
