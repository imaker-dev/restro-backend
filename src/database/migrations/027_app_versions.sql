-- Migration: App Versions Table
-- Description: Stores app version information for update checks across platforms

CREATE TABLE IF NOT EXISTS app_versions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(20) NOT NULL COMMENT 'Semantic version e.g., 1.1.0',
    build INT UNSIGNED DEFAULT NULL COMMENT 'Build number',
    force_update BOOLEAN DEFAULT FALSE COMMENT 'Whether this update is mandatory',
    release_notes TEXT COMMENT 'Release notes/changelog',
    released_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Release date',
    
    -- Platform URLs
    android_url VARCHAR(500) DEFAULT NULL COMMENT 'Play Store or APK URL',
    ios_url VARCHAR(500) DEFAULT NULL COMMENT 'App Store URL',
    windows_url VARCHAR(500) DEFAULT NULL COMMENT 'Windows installer URL',
    mac_url VARCHAR(500) DEFAULT NULL COMMENT 'macOS DMG URL',
    linux_url VARCHAR(500) DEFAULT NULL COMMENT 'Linux AppImage URL',
    
    -- Minimum supported versions (for force update logic)
    android_min_version VARCHAR(20) DEFAULT NULL,
    ios_min_version VARCHAR(20) DEFAULT NULL,
    windows_min_version VARCHAR(20) DEFAULT NULL,
    mac_min_version VARCHAR(20) DEFAULT NULL,
    linux_min_version VARCHAR(20) DEFAULT NULL,
    
    -- Checksums (optional)
    android_sha256 VARCHAR(64) DEFAULT NULL,
    ios_sha256 VARCHAR(64) DEFAULT NULL,
    windows_sha256 VARCHAR(64) DEFAULT NULL,
    mac_sha256 VARCHAR(64) DEFAULT NULL,
    linux_sha256 VARCHAR(64) DEFAULT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Whether this version is the current active release',
    channel ENUM('stable', 'beta', 'alpha') DEFAULT 'stable' COMMENT 'Release channel',
    
    -- Metadata
    created_by BIGINT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_version (version),
    INDEX idx_channel_active (channel, is_active),
    INDEX idx_released_at (released_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert initial version (placeholder - update with actual values)
INSERT INTO app_versions (
    version, 
    build, 
    force_update, 
    release_notes, 
    android_url, 
    ios_url, 
    windows_url,
    is_active,
    channel
) VALUES (
    '1.0.0',
    1,
    FALSE,
    'Initial release',
    NULL,
    NULL,
    NULL,
    TRUE,
    'stable'
);
