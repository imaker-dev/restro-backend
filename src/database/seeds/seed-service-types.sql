-- =====================================================
-- SEED DATA FOR SERVICE TYPE (Restaurant/Bar) TESTING
-- Run this AFTER running migration 018_category_service_type.sql
-- =====================================================

-- Update existing categories with service_type based on naming convention
-- Bar categories (liquor, drinks, cocktails, etc.)
UPDATE categories SET service_type = 'bar' 
WHERE LOWER(name) LIKE '%whiskey%' 
   OR LOWER(name) LIKE '%vodka%' 
   OR LOWER(name) LIKE '%wine%' 
   OR LOWER(name) LIKE '%beer%' 
   OR LOWER(name) LIKE '%cocktail%' 
   OR LOWER(name) LIKE '%rum%' 
   OR LOWER(name) LIKE '%gin%' 
   OR LOWER(name) LIKE '%brandy%' 
   OR LOWER(name) LIKE '%liquor%' 
   OR LOWER(name) LIKE '%alcohol%' 
   OR LOWER(name) LIKE '%spirits%' 
   OR LOWER(name) LIKE '%scotch%' 
   OR LOWER(name) LIKE '%bourbon%' 
   OR LOWER(name) LIKE '%tequila%' 
   OR LOWER(name) LIKE '%champagne%'
   OR LOWER(name) LIKE '%mocktail%'
   OR LOWER(name) LIKE '%drinks%'
   OR LOWER(name) LIKE '%beverages%';

-- Restaurant categories (food items) - set explicitly
UPDATE categories SET service_type = 'restaurant' 
WHERE LOWER(name) LIKE '%starter%' 
   OR LOWER(name) LIKE '%appetizer%' 
   OR LOWER(name) LIKE '%main course%' 
   OR LOWER(name) LIKE '%biryani%' 
   OR LOWER(name) LIKE '%curry%' 
   OR LOWER(name) LIKE '%tandoor%' 
   OR LOWER(name) LIKE '%naan%' 
   OR LOWER(name) LIKE '%bread%' 
   OR LOWER(name) LIKE '%rice%' 
   OR LOWER(name) LIKE '%dal%' 
   OR LOWER(name) LIKE '%soup%' 
   OR LOWER(name) LIKE '%salad%' 
   OR LOWER(name) LIKE '%dessert%' 
   OR LOWER(name) LIKE '%sweet%' 
   OR LOWER(name) LIKE '%paneer%' 
   OR LOWER(name) LIKE '%chicken%' 
   OR LOWER(name) LIKE '%mutton%' 
   OR LOWER(name) LIKE '%fish%' 
   OR LOWER(name) LIKE '%seafood%' 
   OR LOWER(name) LIKE '%pizza%' 
   OR LOWER(name) LIKE '%pasta%' 
   OR LOWER(name) LIKE '%burger%' 
   OR LOWER(name) LIKE '%sandwich%' 
   OR LOWER(name) LIKE '%wrap%' 
   OR LOWER(name) LIKE '%roll%'
   OR LOWER(name) LIKE '%snack%'
   OR LOWER(name) LIKE '%fries%'
   OR LOWER(name) LIKE '%combo%';

-- Categories available in both (shared items like soft drinks, tea, coffee)
UPDATE categories SET service_type = 'both' 
WHERE LOWER(name) LIKE '%soft drink%' 
   OR LOWER(name) LIKE '%tea%' 
   OR LOWER(name) LIKE '%coffee%' 
   OR LOWER(name) LIKE '%juice%' 
   OR LOWER(name) LIKE '%water%' 
   OR LOWER(name) LIKE '%shake%' 
   OR LOWER(name) LIKE '%smoothie%'
   OR LOWER(name) LIKE '%combo%';

-- For outlet_id = 4 (if exists), create some sample categories if none exist
-- This is for testing purposes

-- Sample Bar Categories for testing
INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Whiskey & Scotch', 'whiskey-scotch', 'Premium whiskey and scotch collection', 'bar', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%whiskey%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Cocktails', 'cocktails', 'Signature cocktails and mixed drinks', 'bar', 1, 2
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%cocktail%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Beer & Wine', 'beer-wine', 'Imported and domestic beers and wines', 'bar', 1, 3
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%beer%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

-- Sample Restaurant Categories for testing
INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Starters', 'starters', 'Delicious appetizers and starters', 'restaurant', 1, 10
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%starter%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Main Course', 'main-course', 'Hearty main course dishes', 'restaurant', 1, 11
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%main course%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Biryani & Rice', 'biryani-rice', 'Aromatic biryanis and rice preparations', 'restaurant', 1, 12
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%biryani%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

-- Sample Both/Shared Categories for testing
INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Soft Drinks & Beverages', 'soft-drinks', 'Refreshing soft drinks and beverages', 'both', 1, 20
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%soft drink%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

INSERT INTO categories (outlet_id, name, slug, description, service_type, is_active, display_order)
SELECT 4, 'Mocktails', 'mocktails', 'Non-alcoholic cocktails', 'both', 1, 21
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE outlet_id = 4 AND LOWER(name) LIKE '%mocktail%')
AND EXISTS (SELECT 1 FROM outlets WHERE id = 4);

-- Verify the update
SELECT id, name, service_type, is_active FROM categories WHERE outlet_id = 4 ORDER BY service_type, display_order;
