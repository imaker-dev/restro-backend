-- Add item_type column to kot_items for veg/non-veg display on KOT
ALTER TABLE kot_items ADD COLUMN item_type VARCHAR(20) DEFAULT NULL AFTER variant_name;
