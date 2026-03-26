-- MANUAL MIGRATION — run in Supabase SQL editor, not via migration runner.
-- Jesse is currently the only user so LIMIT 1 is safe.

DO $$
DECLARE jesse_uid UUID;
BEGIN
    SELECT id INTO jesse_uid FROM auth.users LIMIT 1;

    UPDATE clients          SET user_id = jesse_uid WHERE user_id IS NULL;
    UPDATE entries          SET user_id = jesse_uid WHERE user_id IS NULL;
    UPDATE invoices         SET user_id = jesse_uid WHERE user_id IS NULL;
    UPDATE invoice_sequence SET user_id = jesse_uid WHERE user_id IS NULL;
    UPDATE business_details SET user_id = jesse_uid WHERE user_id IS NULL;

    -- Populate Jesse's business_details row with real data so Supabase is
    -- the source of truth and syncs correctly to any device he signs in on.
    UPDATE business_details
    SET business_name       = 'Jesse Morley Photography',
        abn                 = '62 622 680 864',
        address             = '1 Scouller Street, Marrickville NSW 2204',
        bsb                 = '313140',
        account_number      = '12239852',
        super_fund          = 'Smart Future Trust',
        super_member_number = '192726',
        super_fund_abn      = '68964712340',
        super_usi           = '68964712340019'
    WHERE user_id = jesse_uid;
END; $$;

-- After confirming zero NULLs remain, add NOT NULL constraints:
-- SELECT COUNT(*) FROM clients WHERE user_id IS NULL;           -- expect 0
-- SELECT COUNT(*) FROM entries WHERE user_id IS NULL;           -- expect 0
-- SELECT COUNT(*) FROM invoices WHERE user_id IS NULL;          -- expect 0
-- SELECT COUNT(*) FROM invoice_sequence WHERE user_id IS NULL;  -- expect 0
-- SELECT COUNT(*) FROM business_details WHERE user_id IS NULL;  -- expect 0

ALTER TABLE clients          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE entries          ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE invoices         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE invoice_sequence ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE business_details ALTER COLUMN user_id SET NOT NULL;
