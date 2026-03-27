CREATE TABLE IF NOT EXISTS menu_media (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  outlet_id BIGINT UNSIGNED NOT NULL,
  file_type ENUM('image','pdf') NOT NULL,
  title VARCHAR(255) NULL,
  path VARCHAR(500) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_menu_media_outlet (outlet_id),
  INDEX idx_menu_media_active (is_active),
  CONSTRAINT fk_menu_media_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
