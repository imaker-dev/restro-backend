-- =====================================================
-- ALLOW MULTIPLE SHIFTS PER DAY PER FLOOR
-- Remove unique constraint to allow multiple shifts (e.g., morning, evening)
-- =====================================================

-- Drop the unique constraint that restricts one shift per day per floor
ALTER TABLE day_sessions DROP INDEX uk_day_session_floor;

-- Add a non-unique index for querying (replaces the dropped unique key)
ALTER TABLE day_sessions ADD INDEX idx_day_session_floor_date (outlet_id, floor_id, session_date);

-- Note: Multiple shifts per day per floor are now allowed
-- Each open/close cycle creates a new shift record
-- Shift history will show all shifts for a given day
