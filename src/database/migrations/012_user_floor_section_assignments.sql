-- User Floor and Section Assignments
-- Allows assigning captains/managers to specific floors and sections

-- User Floor Assignments (which floors a user can access)
CREATE TABLE IF NOT EXISTS user_floors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  floor_id INT NOT NULL,
  outlet_id INT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_by INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_floor (user_id, floor_id),
  INDEX idx_user_floors_user (user_id),
  INDEX idx_user_floors_floor (floor_id),
  INDEX idx_user_floors_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User Section Assignments (which sections/menu categories a user can access)
CREATE TABLE IF NOT EXISTS user_sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  section_id INT NOT NULL,
  outlet_id INT NOT NULL,
  can_view_menu BOOLEAN DEFAULT TRUE,
  can_take_orders BOOLEAN DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_by INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_section (user_id, section_id),
  INDEX idx_user_sections_user (user_id),
  INDEX idx_user_sections_section (section_id),
  INDEX idx_user_sections_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User Menu Category Access (which menu categories a user can see/order)
CREATE TABLE IF NOT EXISTS user_menu_access (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  outlet_id INT NOT NULL,
  can_view BOOLEAN DEFAULT TRUE,
  can_order BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_category (user_id, category_id),
  INDEX idx_user_menu_user (user_id),
  INDEX idx_user_menu_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
