-- =====================================================
-- CUSTOMER GST & ORDER HISTORY TABLES
-- =====================================================

-- Customers table with GST details for B2B billing
CREATE TABLE IF NOT EXISTS customers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    outlet_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    
    -- GST Details for B2B customers
    is_gst_customer BOOLEAN DEFAULT FALSE,
    company_name VARCHAR(200),
    gstin VARCHAR(20),
    gst_state VARCHAR(100),
    gst_state_code VARCHAR(5),
    company_phone VARCHAR(20),
    company_address TEXT,
    
    -- Customer metadata
    total_orders INT DEFAULT 0,
    total_spent DECIMAL(14, 2) DEFAULT 0,
    last_order_at DATETIME,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_customers_outlet (outlet_id),
    INDEX idx_customers_phone (phone),
    INDEX idx_customers_gstin (gstin),
    INDEX idx_customers_name (name),
    INDEX idx_customers_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Add IGST fields to daily_sales_summary if not exists
ALTER TABLE daily_sales_summary
    ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14, 2) DEFAULT 0 AFTER sgst_amount,
    ADD COLUMN IF NOT EXISTS interstate_orders INT DEFAULT 0 AFTER igst_amount;

-- Create index for interstate orders
CREATE INDEX IF NOT EXISTS idx_orders_interstate ON orders(is_interstate);
CREATE INDEX IF NOT EXISTS idx_invoices_interstate ON invoices(is_interstate);
