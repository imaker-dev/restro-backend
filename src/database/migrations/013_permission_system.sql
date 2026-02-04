-- =====================================================
-- PERMISSION SYSTEM ENHANCEMENT
-- Feature-based permissions with inheritance & audit
-- =====================================================

-- User-specific permissions (overrides role permissions)
-- This allows granular per-user permission assignment
CREATE TABLE IF NOT EXISTS user_permissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    permission_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED,
    granted BOOLEAN DEFAULT TRUE,  -- TRUE = grant, FALSE = revoke (override)
    granted_by BIGINT UNSIGNED NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_permission_outlet (user_id, permission_id, outlet_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id),
    INDEX idx_user_perms_user (user_id),
    INDEX idx_user_perms_outlet (outlet_id),
    INDEX idx_user_perms_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permission change audit log (mandatory for compliance)
CREATE TABLE IF NOT EXISTS permission_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    changed_by BIGINT UNSIGNED NOT NULL,
    target_user_id BIGINT UNSIGNED NOT NULL,
    target_role_id BIGINT UNSIGNED,
    action ENUM('grant', 'revoke', 'bulk_update') NOT NULL,
    permission_ids JSON,  -- Array of permission IDs affected
    old_permissions JSON,  -- Previous state
    new_permissions JSON,  -- New state
    outlet_id BIGINT UNSIGNED,
    reason VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changed_by) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id),
    INDEX idx_perm_logs_changed_by (changed_by),
    INDEX idx_perm_logs_target (target_user_id),
    INDEX idx_perm_logs_action (action),
    INDEX idx_perm_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add permission categories for grouping in UI
ALTER TABLE permissions 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general' AFTER module,
ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0 AFTER category,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER display_order;

-- Add index for category
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
