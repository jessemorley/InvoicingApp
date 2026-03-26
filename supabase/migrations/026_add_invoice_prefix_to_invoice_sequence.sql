ALTER TABLE invoice_sequence ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT 'INV';

-- Backfill Jesse's prefix
UPDATE invoice_sequence SET invoice_prefix = 'JM' WHERE user_id = (
    SELECT id FROM auth.users WHERE email = 'hi@jessemorley.com'
);
