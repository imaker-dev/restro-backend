-- =====================================================
-- CUSTOMER GST & ORDER HISTORY TABLES
-- =====================================================

-- Add GST detail columns to existing customers table (created in 007)
-- Each ALTER only references columns that already exist from the original table
-- or a prior ALTER, to avoid AFTER referencing not-yet-added columns.

-- Batch 1: AFTER targets only original columns from 007
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS is_gst_customer BOOLEAN DEFAULT FALSE AFTER address,
    ADD COLUMN IF NOT EXISTS gst_state VARCHAR(100) AFTER gstin,
    ADD COLUMN IF NOT EXISTS company_phone VARCHAR(20) AFTER company_name;

-- Batch 2: AFTER targets columns added in batch 1
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS gst_state_code VARCHAR(5) AFTER gst_state,
    ADD COLUMN IF NOT EXISTS company_address TEXT AFTER company_phone;

-- Batch 3: AFTER targets columns added in batch 2 + original
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0 AFTER company_address,
    ADD COLUMN IF NOT EXISTS last_order_at DATETIME AFTER total_spent;

-- Ensure index on gstin and name (may already exist)
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- Add customer GST fields to orders table
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN DEFAULT FALSE AFTER customer_phone,
    ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(20) AFTER is_interstate,
    ADD COLUMN IF NOT EXISTS customer_company_name VARCHAR(200) AFTER customer_gstin,
    ADD COLUMN IF NOT EXISTS customer_gst_state VARCHAR(100) AFTER customer_company_name,
    ADD COLUMN IF NOT EXISTS customer_gst_state_code VARCHAR(5) AFTER customer_gst_state;

-- Add is_interstate flag to invoices table
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN DEFAULT FALSE AFTER customer_gstin,
    ADD COLUMN IF NOT EXISTS customer_company_name VARCHAR(200) AFTER is_interstate,
    ADD COLUMN IF NOT EXISTS customer_gst_state VARCHAR(100) AFTER customer_company_name,
    ADD COLUMN IF NOT EXISTS customer_gst_state_code VARCHAR(5) AFTER customer_gst_state;

-- Add IGST fields to daily_sales if not exists
ALTER TABLE daily_sales
    ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14, 2) DEFAULT 0 AFTER sgst_amount,
    ADD COLUMN IF NOT EXISTS interstate_orders INT DEFAULT 0 AFTER igst_amount;

-- Create index for interstate orders
CREATE INDEX IF NOT EXISTS idx_orders_interstate ON orders(is_interstate);
CREATE INDEX IF NOT EXISTS idx_invoices_interstate ON invoices(is_interstate);
