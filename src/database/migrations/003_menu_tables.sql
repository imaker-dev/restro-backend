-- =====================================================
-- DYNAMIC MENU DOMAIN TABLES
-- =====================================================

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100),
    description TEXT,
    image_url VARCHAR(500),
    icon VARCHAR(50),
    color_code VARCHAR(7),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_categories_outlet (outlet_id),
    INDEX idx_categories_parent (parent_id),
    INDEX idx_categories_is_active (is_active),
    INDEX idx_categories_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Category rules (visibility based on floor/section/time)
CREATE TABLE IF NOT EXISTS category_rules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    rule_type ENUM('floor', 'section', 'time_slot', 'day_of_week', 'date_range') NOT NULL,
    floor_id BIGINT UNSIGNED,
    section_id BIGINT UNSIGNED,
    time_start TIME,
    time_end TIME,
    days_of_week VARCHAR(20),
    date_start DATE,
    date_end DATE,
    is_available BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_category_rules_category (category_id),
    INDEX idx_category_rules_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Items (menu items)
CREATE TABLE IF NOT EXISTS items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    short_name VARCHAR(50),
    slug VARCHAR(150),
    description TEXT,
    item_type ENUM('veg', 'non_veg', 'egg', 'vegan') DEFAULT 'veg',
    base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(10, 2) DEFAULT 0,
    tax_group_id BIGINT UNSIGNED,
    image_url VARCHAR(500),
    preparation_time_mins INT DEFAULT 15,
    spice_level TINYINT DEFAULT 0,
    calories INT,
    allergens VARCHAR(255),
    tags VARCHAR(255),
    is_customizable BOOLEAN DEFAULT FALSE,
    has_variants BOOLEAN DEFAULT FALSE,
    has_addons BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    is_recommended BOOLEAN DEFAULT FALSE,
    is_bestseller BOOLEAN DEFAULT FALSE,
    is_new BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    INDEX idx_items_outlet (outlet_id),
    INDEX idx_items_category (category_id),
    INDEX idx_items_sku (sku),
    INDEX idx_items_type (item_type),
    INDEX idx_items_is_available (is_available),
    INDEX idx_items_is_active (is_active),
    INDEX idx_items_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item rules (availability based on floor/section/time)
CREATE TABLE IF NOT EXISTS item_rules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    rule_type ENUM('floor', 'section', 'time_slot', 'day_of_week', 'date_range') NOT NULL,
    floor_id BIGINT UNSIGNED,
    section_id BIGINT UNSIGNED,
    time_start TIME,
    time_end TIME,
    days_of_week VARCHAR(20),
    date_start DATE,
    date_end DATE,
    is_available BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    INDEX idx_item_rules_item (item_id),
    INDEX idx_item_rules_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Variants (Size, Portion variations)
CREATE TABLE IF NOT EXISTS variants (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    sku VARCHAR(50),
    price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2) DEFAULT 0,
    tax_group_id BIGINT UNSIGNED,
    is_default BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    INDEX idx_variants_item (item_id),
    INDEX idx_variants_sku (sku),
    INDEX idx_variants_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Addon groups (Toppings, Extras, etc.)
CREATE TABLE IF NOT EXISTS addon_groups (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    selection_type ENUM('single', 'multiple') DEFAULT 'multiple',
    min_selection INT DEFAULT 0,
    max_selection INT DEFAULT 10,
    is_required BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_addon_groups_outlet (outlet_id),
    INDEX idx_addon_groups_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Addons
CREATE TABLE IF NOT EXISTS addons (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    addon_group_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    item_type ENUM('veg', 'non_veg', 'egg', 'vegan') DEFAULT 'veg',
    is_default BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (addon_group_id) REFERENCES addon_groups(id) ON DELETE CASCADE,
    INDEX idx_addons_group (addon_group_id),
    INDEX idx_addons_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item-Addon group mapping
CREATE TABLE IF NOT EXISTS item_addon_groups (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    addon_group_id BIGINT UNSIGNED NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_addon_group (item_id, addon_group_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (addon_group_id) REFERENCES addon_groups(id) ON DELETE CASCADE,
    INDEX idx_item_addon_groups_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quantity rules (for specific quantity pricing)
CREATE TABLE IF NOT EXISTS quantity_rules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED,
    variant_id BIGINT UNSIGNED,
    min_quantity INT NOT NULL DEFAULT 1,
    max_quantity INT,
    price_per_unit DECIMAL(10, 2),
    discount_percent DECIMAL(5, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
    INDEX idx_quantity_rules_item (item_id),
    INDEX idx_quantity_rules_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Combo/Bundle items
CREATE TABLE IF NOT EXISTS combo_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    combo_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED,
    quantity INT DEFAULT 1,
    is_replaceable BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    FOREIGN KEY (combo_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE SET NULL,
    INDEX idx_combo_items_combo (combo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
