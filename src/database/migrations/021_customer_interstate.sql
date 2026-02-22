-- =====================================================
-- ADD IS_INTERSTATE COLUMN TO CUSTOMERS TABLE
-- =====================================================

-- Add is_interstate flag to customers table for B2B interstate tracking
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN DEFAULT FALSE AFTER company_address;
