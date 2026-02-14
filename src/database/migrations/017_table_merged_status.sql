-- Add 'merged' to tables.status ENUM so secondary merged tables can be clearly distinguished
ALTER TABLE tables 
    MODIFY COLUMN status ENUM('available', 'occupied', 'running', 'reserved', 'billing', 'cleaning', 'blocked', 'merged') DEFAULT 'available';
