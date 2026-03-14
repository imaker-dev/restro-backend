-- =====================================================
-- ADD NC COLUMNS TO AGGREGATION TABLES
-- Stores NC order count and NC amount in daily/staff aggregations
-- =====================================================

ALTER TABLE daily_sales
    ADD COLUMN nc_orders INT DEFAULT 0 AFTER cancelled_orders,
    ADD COLUMN nc_amount DECIMAL(14, 2) DEFAULT 0 AFTER nc_orders;

ALTER TABLE staff_sales
    ADD COLUMN nc_orders INT DEFAULT 0 AFTER cancelled_amount,
    ADD COLUMN nc_amount DECIMAL(14, 2) DEFAULT 0 AFTER nc_orders;
