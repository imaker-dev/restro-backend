-- =====================================================
-- INVENTORY DOMAIN TABLES
-- =====================================================

-- Ingredients/Raw materials
CREATE TABLE IF NOT EXISTS ingredients (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255),
    category VARCHAR(100),
    unit ENUM('kg', 'gram', 'liter', 'ml', 'piece', 'dozen', 'packet', 'box', 'bottle', 'can') NOT NULL DEFAULT 'gram',
    base_unit_conversion DECIMAL(10, 4) DEFAULT 1,
    cost_per_unit DECIMAL(10, 2) DEFAULT 0,
    reorder_level DECIMAL(10, 3) DEFAULT 0,
    reorder_quantity DECIMAL(10, 3) DEFAULT 0,
    max_stock_level DECIMAL(10, 3),
    shelf_life_days INT,
    storage_instructions TEXT,
    supplier_id BIGINT UNSIGNED,
    is_perishable BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_ingredients_outlet (outlet_id),
    INDEX idx_ingredients_sku (sku),
    INDEX idx_ingredients_category (category),
    INDEX idx_ingredients_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recipes (ingredient mapping to items)
CREATE TABLE IF NOT EXISTS recipes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(10, 4) NOT NULL,
    unit ENUM('kg', 'gram', 'liter', 'ml', 'piece', 'dozen', 'packet', 'box', 'bottle', 'can') NOT NULL DEFAULT 'gram',
    wastage_percent DECIMAL(5, 2) DEFAULT 0,
    is_optional BOOLEAN DEFAULT FALSE,
    notes VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_recipe_item_ingredient (item_id, variant_id, ingredient_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_recipes_item (item_id),
    INDEX idx_recipes_variant (variant_id),
    INDEX idx_recipes_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Current stock levels
CREATE TABLE IF NOT EXISTS stock (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    current_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    reserved_quantity DECIMAL(12, 4) DEFAULT 0,
    available_quantity DECIMAL(12, 4) GENERATED ALWAYS AS (current_quantity - reserved_quantity) STORED,
    average_cost DECIMAL(10, 2) DEFAULT 0,
    last_purchase_price DECIMAL(10, 2) DEFAULT 0,
    last_purchase_date DATE,
    last_consumption_date DATE,
    expiry_date DATE,
    batch_number VARCHAR(50),
    location VARCHAR(100),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_stock_outlet_ingredient (outlet_id, ingredient_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_stock_outlet (outlet_id),
    INDEX idx_stock_ingredient (ingredient_id),
    INDEX idx_stock_quantity (current_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock movement logs
CREATE TABLE IF NOT EXISTS stock_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    movement_type ENUM('purchase', 'consumption', 'wastage', 'transfer_in', 'transfer_out', 'adjustment', 'opening', 'closing', 'return') NOT NULL,
    reference_type VARCHAR(50),
    reference_id BIGINT UNSIGNED,
    quantity DECIMAL(12, 4) NOT NULL,
    unit_cost DECIMAL(10, 2) DEFAULT 0,
    total_cost DECIMAL(12, 2) DEFAULT 0,
    balance_before DECIMAL(12, 4),
    balance_after DECIMAL(12, 4),
    batch_number VARCHAR(50),
    expiry_date DATE,
    notes TEXT,
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_stock_logs_outlet (outlet_id),
    INDEX idx_stock_logs_ingredient (ingredient_id),
    INDEX idx_stock_logs_type (movement_type),
    INDEX idx_stock_logs_created (created_at),
    INDEX idx_stock_logs_reference (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opening stock (daily)
CREATE TABLE IF NOT EXISTS opening_stock (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    stock_date DATE NOT NULL,
    system_quantity DECIMAL(12, 4) NOT NULL,
    physical_quantity DECIMAL(12, 4),
    variance DECIMAL(12, 4) GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
    unit_cost DECIMAL(10, 2) DEFAULT 0,
    total_value DECIMAL(12, 2) DEFAULT 0,
    notes TEXT,
    recorded_by BIGINT UNSIGNED,
    verified_by BIGINT UNSIGNED,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_opening_stock_date (outlet_id, ingredient_id, stock_date),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_opening_stock_outlet (outlet_id),
    INDEX idx_opening_stock_date (stock_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Closing stock (daily)
CREATE TABLE IF NOT EXISTS closing_stock (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    stock_date DATE NOT NULL,
    system_quantity DECIMAL(12, 4) NOT NULL,
    physical_quantity DECIMAL(12, 4),
    variance DECIMAL(12, 4) GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
    consumption_quantity DECIMAL(12, 4) DEFAULT 0,
    wastage_quantity DECIMAL(12, 4) DEFAULT 0,
    purchase_quantity DECIMAL(12, 4) DEFAULT 0,
    unit_cost DECIMAL(10, 2) DEFAULT 0,
    total_value DECIMAL(12, 2) DEFAULT 0,
    variance_reason VARCHAR(255),
    notes TEXT,
    recorded_by BIGINT UNSIGNED,
    verified_by BIGINT UNSIGNED,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_closing_stock_date (outlet_id, ingredient_id, stock_date),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_closing_stock_outlet (outlet_id),
    INDEX idx_closing_stock_date (stock_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    po_number VARCHAR(30) NOT NULL,
    supplier_id BIGINT UNSIGNED,
    supplier_name VARCHAR(150),
    status ENUM('draft', 'pending', 'approved', 'ordered', 'partial_received', 'received', 'cancelled') DEFAULT 'draft',
    order_date DATE,
    expected_date DATE,
    received_date DATE,
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    paid_amount DECIMAL(12, 2) DEFAULT 0,
    notes TEXT,
    approved_by BIGINT UNSIGNED,
    approved_at DATETIME,
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_po_outlet (outlet_id),
    INDEX idx_po_number (po_number),
    INDEX idx_po_status (status),
    INDEX idx_po_date (order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase order items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    ordered_quantity DECIMAL(12, 4) NOT NULL,
    received_quantity DECIMAL(12, 4) DEFAULT 0,
    unit_price DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total_price DECIMAL(12, 2) NOT NULL,
    batch_number VARCHAR(50),
    expiry_date DATE,
    notes VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_po_items_order (purchase_order_id),
    INDEX idx_po_items_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    alternate_phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    gstin VARCHAR(20),
    pan VARCHAR(20),
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    bank_ifsc VARCHAR(20),
    payment_terms VARCHAR(100),
    credit_limit DECIMAL(12, 2) DEFAULT 0,
    credit_days INT DEFAULT 0,
    rating TINYINT DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_suppliers_outlet (outlet_id),
    INDEX idx_suppliers_name (name),
    INDEX idx_suppliers_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wastage logs
CREATE TABLE IF NOT EXISTS wastage_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    wastage_date DATE NOT NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    unit_cost DECIMAL(10, 2) DEFAULT 0,
    total_cost DECIMAL(12, 2) DEFAULT 0,
    reason ENUM('expired', 'damaged', 'spillage', 'preparation', 'customer_return', 'other') NOT NULL,
    reason_notes TEXT,
    recorded_by BIGINT UNSIGNED,
    approved_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    INDEX idx_wastage_outlet (outlet_id),
    INDEX idx_wastage_ingredient (ingredient_id),
    INDEX idx_wastage_date (wastage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
