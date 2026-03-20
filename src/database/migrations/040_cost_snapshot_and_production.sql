-- Migration 040: Cost Snapshot + Production Module
-- 1. order_item_costs — freeze cost at order time for accurate historical reports
-- 2. production_recipes — templates for semi-finished goods (gravy, sauce, dough)
-- 3. production_recipe_ingredients — input ingredients for production recipe
-- 4. productions — log of each production run

-- ============================================================
-- COST SNAPSHOT — stores making cost at order time
-- ============================================================

CREATE TABLE IF NOT EXISTS order_item_costs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    order_item_id BIGINT UNSIGNED NOT NULL,
    recipe_id BIGINT UNSIGNED,
    costing_method VARCHAR(20) NOT NULL DEFAULT 'average',
    making_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    profit DECIMAL(12, 2) NOT NULL DEFAULT 0,
    food_cost_percentage DECIMAL(6, 2) NOT NULL DEFAULT 0,
    cost_breakdown JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
    INDEX idx_oic_order (order_id),
    INDEX idx_oic_order_item (order_item_id),
    INDEX idx_oic_recipe (recipe_id),
    INDEX idx_oic_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PRODUCTION RECIPES — templates for semi-finished goods
-- ============================================================

CREATE TABLE IF NOT EXISTS production_recipes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    output_inventory_item_id BIGINT UNSIGNED NOT NULL,
    output_quantity DECIMAL(15, 4) NOT NULL,
    output_unit_id BIGINT UNSIGNED NOT NULL,
    preparation_time_mins INT DEFAULT 0,
    instructions TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (output_inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (output_unit_id) REFERENCES units(id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_pr_outlet (outlet_id),
    INDEX idx_pr_output_item (output_inventory_item_id),
    INDEX idx_pr_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Input ingredients for production recipe
CREATE TABLE IF NOT EXISTS production_recipe_ingredients (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_recipe_id BIGINT UNSIGNED NOT NULL,
    inventory_item_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(15, 4) NOT NULL,
    unit_id BIGINT UNSIGNED NOT NULL,
    display_order INT DEFAULT 0,
    notes VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (production_recipe_id) REFERENCES production_recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id),
    UNIQUE KEY uk_pr_ingredient (production_recipe_id, inventory_item_id),
    INDEX idx_pri_recipe (production_recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PRODUCTIONS — log of each production run
-- ============================================================

CREATE TABLE IF NOT EXISTS productions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    production_recipe_id BIGINT UNSIGNED,
    production_number VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status ENUM('completed', 'cancelled') DEFAULT 'completed',

    -- Output
    output_inventory_item_id BIGINT UNSIGNED NOT NULL,
    output_quantity DECIMAL(15, 4) NOT NULL,
    output_unit_id BIGINT UNSIGNED NOT NULL,
    output_batch_id BIGINT UNSIGNED,

    -- Cost
    total_input_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    cost_per_output_unit DECIMAL(12, 4) NOT NULL DEFAULT 0,

    notes TEXT,
    produced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (production_recipe_id) REFERENCES production_recipes(id) ON DELETE SET NULL,
    FOREIGN KEY (output_inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (output_unit_id) REFERENCES units(id),
    FOREIGN KEY (output_batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_prod_outlet (outlet_id),
    INDEX idx_prod_recipe (production_recipe_id),
    INDEX idx_prod_output (output_inventory_item_id),
    INDEX idx_prod_batch (output_batch_id),
    INDEX idx_prod_number (production_number),
    INDEX idx_prod_status (status),
    INDEX idx_prod_date (produced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Input items consumed during production
CREATE TABLE IF NOT EXISTS production_inputs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_id BIGINT UNSIGNED NOT NULL,
    inventory_item_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(15, 4) NOT NULL,
    unit_id BIGINT UNSIGNED NOT NULL,
    quantity_in_base DECIMAL(15, 4) NOT NULL,
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id),
    INDEX idx_pi_production (production_id),
    INDEX idx_pi_item (inventory_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add 'production_in' and 'production_out' to movement_type ENUM
-- Note: MySQL requires ALTER TABLE to add ENUM values
ALTER TABLE inventory_movements
    MODIFY COLUMN movement_type ENUM('purchase', 'sale', 'production', 'wastage', 'adjustment', 'production_in', 'production_out') NOT NULL;
