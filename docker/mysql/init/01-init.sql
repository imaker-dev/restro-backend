-- ============================================
-- Initial MySQL Setup for Docker
-- This runs automatically on first container start
-- ============================================

-- Ensure proper character set
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Grant privileges to application user
GRANT ALL PRIVILEGES ON restro_pos.* TO 'restro_user'@'%';
FLUSH PRIVILEGES;

-- Create migrations table if not exists (for fresh start)
CREATE TABLE IF NOT EXISTS migrations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    batch INT NOT NULL,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
