-- Migration: 020_user_stations.sql
-- Description: Add user_stations table for mapping kitchen/bar users to their stations

-- Create user_stations table
CREATE TABLE IF NOT EXISTS user_stations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    station_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    is_primary TINYINT(1) DEFAULT 1,
    is_active TINYINT(1) DEFAULT 1,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    assigned_by BIGINT UNSIGNED NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_station (user_id, station_id),
    INDEX idx_user_stations_user (user_id),
    INDEX idx_user_stations_station (station_id),
    INDEX idx_user_stations_outlet (outlet_id)
);

-- Update kitchen_stations to link printers properly
-- Add index on printer_id if not exists
ALTER TABLE kitchen_stations ADD INDEX idx_kitchen_stations_printer (printer_id);

-- Update printers table - ensure station types match role types
-- Station ENUM: 'kot_kitchen','kot_bar','kot_dessert','bill','report','all'
