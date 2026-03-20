-- =====================================================
-- FIX: Rebuild recipes table with correct schema
-- Old migration 006 created recipes with (item_id, ingredient_id, quantity)
-- New schema from 038 expects (menu_item_id, name, version, is_current)
-- CREATE TABLE IF NOT EXISTS in 038 was silently skipped
-- =====================================================

-- Step 1: Drop recipe_ingredients (references recipes.id)
DROP TABLE IF EXISTS recipe_ingredients;

-- Step 2: Drop old recipes table
DROP TABLE IF EXISTS recipes;

-- Step 3: Recreate recipes with correct schema (from 038)
CREATE TABLE recipes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    menu_item_id BIGINT UNSIGNED,
    variant_id BIGINT UNSIGNED,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    portion_size VARCHAR(50),
    preparation_time_mins INT DEFAULT 0,
    instructions TEXT,
    version INT DEFAULT 1,
    is_current BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES items(id) ON DELETE SET NULL,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE SET NULL,
    INDEX idx_recipes_outlet (outlet_id),
    INDEX idx_recipes_menu_item (menu_item_id),
    INDEX idx_recipes_variant (variant_id),
    INDEX idx_recipes_active (is_active),
    INDEX idx_recipes_current (is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 4: Recreate recipe_ingredients
CREATE TABLE recipe_ingredients (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipe_id BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(15, 4) NOT NULL,
    unit_id BIGINT UNSIGNED NOT NULL,
    wastage_percentage DECIMAL(5, 2) DEFAULT 0.00,
    notes VARCHAR(255),
    display_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_recipe_ingredient (recipe_id, ingredient_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES units(id),
    INDEX idx_ri_recipe (recipe_id),
    INDEX idx_ri_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 5: Ensure cost_settings exists
CREATE TABLE IF NOT EXISTS cost_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    costing_method ENUM('average', 'latest', 'fifo', 'manual') DEFAULT 'average',
    updated_by BIGINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cost_settings_outlet (outlet_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
