-- Rename enum values and add 'office'
ALTER TYPE expense_category RENAME VALUE 'gear_permanent' TO 'gear';
ALTER TYPE expense_category RENAME VALUE 'gear_rental'    TO 'gear_hire';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'office';
