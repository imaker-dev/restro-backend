-- =====================================================
-- Add 'completed' to orders.status ENUM
-- When cashier collects full payment, order moves to 'completed'
-- =====================================================

ALTER TABLE orders 
    MODIFY COLUMN status ENUM('pending', 'confirmed', 'preparing', 'ready', 'served', 'billed', 'paid', 'completed', 'cancelled') DEFAULT 'pending';

-- Migrate any existing 'paid' orders to 'completed'
UPDATE orders SET status = 'completed' WHERE status = 'paid';
