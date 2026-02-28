-- =====================================================
-- FLOOR-BASED SHIFT SYSTEM
-- Each floor has its own shift managed by assigned cashier
-- =====================================================

-- Add floor_id to day_sessions for floor-based shifts
ALTER TABLE day_sessions 
ADD COLUMN floor_id BIGINT UNSIGNED NULL AFTER outlet_id,
ADD COLUMN cashier_id BIGINT UNSIGNED NULL AFTER opened_by,
ADD INDEX idx_day_sessions_floor (floor_id),
ADD INDEX idx_day_sessions_cashier (cashier_id);

-- Drop the old unique constraint and add new one with floor_id
ALTER TABLE day_sessions DROP INDEX uk_day_session;
ALTER TABLE day_sessions ADD UNIQUE KEY uk_day_session_floor (outlet_id, floor_id, session_date);

-- Add floor_id to cash_drawer for floor-based cash tracking
ALTER TABLE cash_drawer
ADD COLUMN floor_id BIGINT UNSIGNED NULL AFTER outlet_id,
ADD INDEX idx_cash_drawer_floor (floor_id);

-- Add floor_id to payments for floor-based payment tracking
ALTER TABLE payments
ADD COLUMN floor_id BIGINT UNSIGNED NULL AFTER outlet_id,
ADD INDEX idx_payments_floor (floor_id);

-- Create view for active floor shifts
CREATE OR REPLACE VIEW v_active_floor_shifts AS
SELECT 
  ds.id as shift_id,
  ds.outlet_id,
  ds.floor_id,
  ds.session_date,
  ds.opening_time,
  ds.opening_cash,
  ds.status,
  ds.opened_by,
  ds.cashier_id,
  f.name as floor_name,
  f.floor_number,
  u.name as cashier_name,
  o.name as outlet_name
FROM day_sessions ds
LEFT JOIN floors f ON ds.floor_id = f.id
LEFT JOIN users u ON ds.cashier_id = u.id
LEFT JOIN outlets o ON ds.outlet_id = o.id
WHERE ds.status = 'open';

-- Add comment for documentation
-- Note: For backward compatibility, floor_id = NULL means outlet-level shift (legacy)
-- New shifts should always have floor_id set for floor-isolated operations
