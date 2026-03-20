-- ============================================================
-- Migration 042: Production Reversal Support
-- Adds reversal tracking columns + movement type
-- ============================================================

-- Add reversal tracking to productions table
ALTER TABLE productions
    ADD COLUMN reversed_at DATETIME DEFAULT NULL AFTER notes,
    ADD COLUMN reversed_by BIGINT UNSIGNED DEFAULT NULL AFTER reversed_at,
    ADD COLUMN reversal_notes TEXT DEFAULT NULL AFTER reversed_by;

-- Add 'production_reversal' to movement_type ENUM
ALTER TABLE inventory_movements
    MODIFY COLUMN movement_type ENUM(
        'purchase', 'sale', 'production', 'wastage', 'adjustment',
        'production_in', 'production_out', 'production_reversal'
    ) NOT NULL;

-- Add index for reversal lookups
ALTER TABLE productions ADD INDEX idx_prod_reversed (reversed_at);
