-- =====================================================
-- REPORTS & AGGREGATION TABLES
-- Never calculate reports directly from orders - always aggregate
-- =====================================================

-- Daily sales summary (aggregated)
CREATE TABLE IF NOT EXISTS daily_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    total_orders INT DEFAULT 0,
    dine_in_orders INT DEFAULT 0,
    takeaway_orders INT DEFAULT 0,
    delivery_orders INT DEFAULT 0,
    cancelled_orders INT DEFAULT 0,
    total_guests INT DEFAULT 0,
    gross_sales DECIMAL(14, 2) DEFAULT 0,
    net_sales DECIMAL(14, 2) DEFAULT 0,
    discount_amount DECIMAL(14, 2) DEFAULT 0,
    tax_amount DECIMAL(14, 2) DEFAULT 0,
    cgst_amount DECIMAL(14, 2) DEFAULT 0,
    sgst_amount DECIMAL(14, 2) DEFAULT 0,
    vat_amount DECIMAL(14, 2) DEFAULT 0,
    service_charge DECIMAL(14, 2) DEFAULT 0,
    packaging_charge DECIMAL(14, 2) DEFAULT 0,
    delivery_charge DECIMAL(14, 2) DEFAULT 0,
    round_off DECIMAL(10, 2) DEFAULT 0,
    total_collection DECIMAL(14, 2) DEFAULT 0,
    cash_collection DECIMAL(14, 2) DEFAULT 0,
    card_collection DECIMAL(14, 2) DEFAULT 0,
    upi_collection DECIMAL(14, 2) DEFAULT 0,
    wallet_collection DECIMAL(14, 2) DEFAULT 0,
    credit_collection DECIMAL(14, 2) DEFAULT 0,
    complimentary_amount DECIMAL(14, 2) DEFAULT 0,
    refund_amount DECIMAL(14, 2) DEFAULT 0,
    tip_amount DECIMAL(14, 2) DEFAULT 0,
    average_order_value DECIMAL(10, 2) DEFAULT 0,
    average_guest_spend DECIMAL(10, 2) DEFAULT 0,
    table_turnover_rate DECIMAL(5, 2) DEFAULT 0,
    peak_hour VARCHAR(10),
    peak_hour_sales DECIMAL(14, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_daily_sales (outlet_id, report_date),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_daily_sales_outlet (outlet_id),
    INDEX idx_daily_sales_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item sales summary (aggregated)
CREATE TABLE IF NOT EXISTS item_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED,
    item_name VARCHAR(150) NOT NULL,
    variant_name VARCHAR(50),
    category_id BIGINT UNSIGNED,
    category_name VARCHAR(100),
    quantity_sold DECIMAL(12, 3) DEFAULT 0,
    quantity_cancelled DECIMAL(12, 3) DEFAULT 0,
    gross_amount DECIMAL(14, 2) DEFAULT 0,
    discount_amount DECIMAL(14, 2) DEFAULT 0,
    net_amount DECIMAL(14, 2) DEFAULT 0,
    tax_amount DECIMAL(14, 2) DEFAULT 0,
    cost_amount DECIMAL(14, 2) DEFAULT 0,
    profit_amount DECIMAL(14, 2) DEFAULT 0,
    profit_margin DECIMAL(5, 2) DEFAULT 0,
    order_count INT DEFAULT 0,
    average_price DECIMAL(10, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_sales (outlet_id, report_date, item_id, variant_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_item_sales_outlet (outlet_id),
    INDEX idx_item_sales_date (report_date),
    INDEX idx_item_sales_item (item_id),
    INDEX idx_item_sales_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cash summary (aggregated)
CREATE TABLE IF NOT EXISTS cash_summary (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    opening_balance DECIMAL(14, 2) DEFAULT 0,
    cash_sales DECIMAL(14, 2) DEFAULT 0,
    cash_in DECIMAL(14, 2) DEFAULT 0,
    cash_out DECIMAL(14, 2) DEFAULT 0,
    cash_refunds DECIMAL(14, 2) DEFAULT 0,
    cash_expenses DECIMAL(14, 2) DEFAULT 0,
    cash_deposits DECIMAL(14, 2) DEFAULT 0,
    expected_balance DECIMAL(14, 2) DEFAULT 0,
    actual_balance DECIMAL(14, 2) DEFAULT 0,
    variance DECIMAL(14, 2) DEFAULT 0,
    closing_balance DECIMAL(14, 2) DEFAULT 0,
    reconciled BOOLEAN DEFAULT FALSE,
    reconciled_by BIGINT UNSIGNED,
    reconciled_at DATETIME,
    notes TEXT,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cash_summary (outlet_id, report_date),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_cash_summary_outlet (outlet_id),
    INDEX idx_cash_summary_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Category sales summary (aggregated)
CREATE TABLE IF NOT EXISTS category_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    item_count INT DEFAULT 0,
    quantity_sold DECIMAL(12, 3) DEFAULT 0,
    gross_amount DECIMAL(14, 2) DEFAULT 0,
    discount_amount DECIMAL(14, 2) DEFAULT 0,
    net_amount DECIMAL(14, 2) DEFAULT 0,
    tax_amount DECIMAL(14, 2) DEFAULT 0,
    contribution_percent DECIMAL(5, 2) DEFAULT 0,
    order_count INT DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_category_sales (outlet_id, report_date, category_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_category_sales_outlet (outlet_id),
    INDEX idx_category_sales_date (report_date),
    INDEX idx_category_sales_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hourly sales summary
CREATE TABLE IF NOT EXISTS hourly_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    hour TINYINT NOT NULL,
    order_count INT DEFAULT 0,
    guest_count INT DEFAULT 0,
    net_sales DECIMAL(14, 2) DEFAULT 0,
    average_order_value DECIMAL(10, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_hourly_sales (outlet_id, report_date, hour),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_hourly_sales_outlet (outlet_id),
    INDEX idx_hourly_sales_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Top selling items (aggregated weekly/monthly)
CREATE TABLE IF NOT EXISTS top_selling_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    period_type ENUM('daily', 'weekly', 'monthly') NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED,
    item_name VARCHAR(150) NOT NULL,
    variant_name VARCHAR(50),
    category_name VARCHAR(100),
    rank_position INT NOT NULL,
    quantity_sold DECIMAL(12, 3) DEFAULT 0,
    revenue DECIMAL(14, 2) DEFAULT 0,
    order_count INT DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_top_items (outlet_id, period_type, period_start, item_id, variant_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_top_items_outlet (outlet_id),
    INDEX idx_top_items_period (period_type, period_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Waiter/Staff sales summary
CREATE TABLE IF NOT EXISTS staff_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    order_count INT DEFAULT 0,
    guest_count INT DEFAULT 0,
    net_sales DECIMAL(14, 2) DEFAULT 0,
    discount_given DECIMAL(14, 2) DEFAULT 0,
    tips_received DECIMAL(14, 2) DEFAULT 0,
    cancelled_orders INT DEFAULT 0,
    cancelled_amount DECIMAL(14, 2) DEFAULT 0,
    average_order_value DECIMAL(10, 2) DEFAULT 0,
    average_table_time INT DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_staff_sales (outlet_id, report_date, user_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_staff_sales_outlet (outlet_id),
    INDEX idx_staff_sales_date (report_date),
    INDEX idx_staff_sales_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment mode summary
CREATE TABLE IF NOT EXISTS payment_mode_summary (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    payment_mode ENUM('cash', 'card', 'upi', 'wallet', 'credit', 'complimentary') NOT NULL,
    transaction_count INT DEFAULT 0,
    total_amount DECIMAL(14, 2) DEFAULT 0,
    tip_amount DECIMAL(14, 2) DEFAULT 0,
    refund_count INT DEFAULT 0,
    refund_amount DECIMAL(14, 2) DEFAULT 0,
    percentage_share DECIMAL(5, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_payment_mode (outlet_id, report_date, payment_mode),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_payment_mode_outlet (outlet_id),
    INDEX idx_payment_mode_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tax summary (for GST returns)
CREATE TABLE IF NOT EXISTS tax_summary (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    tax_type VARCHAR(20) NOT NULL,
    tax_rate DECIMAL(5, 2) NOT NULL,
    taxable_amount DECIMAL(14, 2) DEFAULT 0,
    tax_amount DECIMAL(14, 2) DEFAULT 0,
    invoice_count INT DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tax_summary (outlet_id, report_date, tax_type, tax_rate),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_tax_summary_outlet (outlet_id),
    INDEX idx_tax_summary_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discount summary
CREATE TABLE IF NOT EXISTS discount_summary (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    discount_id BIGINT UNSIGNED,
    discount_name VARCHAR(100),
    discount_type VARCHAR(50),
    usage_count INT DEFAULT 0,
    total_discount DECIMAL(14, 2) DEFAULT 0,
    affected_orders INT DEFAULT 0,
    average_discount DECIMAL(10, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_discount_summary (outlet_id, report_date, discount_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_discount_summary_outlet (outlet_id),
    INDEX idx_discount_summary_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cancellation summary
CREATE TABLE IF NOT EXISTS cancellation_summary (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    cancel_type ENUM('full_order', 'partial_item', 'void') NOT NULL,
    reason_id BIGINT UNSIGNED,
    reason_text VARCHAR(255),
    cancel_count INT DEFAULT 0,
    total_amount DECIMAL(14, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cancel_summary (outlet_id, report_date, cancel_type, reason_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_cancel_summary_outlet (outlet_id),
    INDEX idx_cancel_summary_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory consumption summary
CREATE TABLE IF NOT EXISTS inventory_consumption_summary (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    ingredient_name VARCHAR(150) NOT NULL,
    opening_stock DECIMAL(12, 4) DEFAULT 0,
    purchased DECIMAL(12, 4) DEFAULT 0,
    consumed DECIMAL(12, 4) DEFAULT 0,
    wastage DECIMAL(12, 4) DEFAULT 0,
    closing_stock DECIMAL(12, 4) DEFAULT 0,
    variance DECIMAL(12, 4) DEFAULT 0,
    consumption_cost DECIMAL(14, 2) DEFAULT 0,
    wastage_cost DECIMAL(14, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_inventory_consumption (outlet_id, report_date, ingredient_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_inventory_consumption_outlet (outlet_id),
    INDEX idx_inventory_consumption_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Floor/Section sales summary
CREATE TABLE IF NOT EXISTS floor_section_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    floor_id BIGINT UNSIGNED,
    section_id BIGINT UNSIGNED,
    floor_name VARCHAR(50),
    section_name VARCHAR(50),
    order_count INT DEFAULT 0,
    guest_count INT DEFAULT 0,
    net_sales DECIMAL(14, 2) DEFAULT 0,
    average_order_value DECIMAL(10, 2) DEFAULT 0,
    table_turnover DECIMAL(5, 2) DEFAULT 0,
    aggregated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_floor_section_sales (outlet_id, report_date, floor_id, section_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_floor_section_outlet (outlet_id),
    INDEX idx_floor_section_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
