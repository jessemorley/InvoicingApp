ALTER TABLE business_details ADD COLUMN name TEXT NOT NULL DEFAULT '';

-- Backfill Jesse's name
UPDATE business_details SET name = 'Jesse Morley' WHERE business_name = 'Jesse Morley Photography';
