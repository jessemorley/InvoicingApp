ALTER TABLE clients         ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE entries         ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE invoices        ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- invoice_sequence: drop single-row constraint, change int PK to UUID, add user_id
-- (migration 018 added id INTEGER PRIMARY KEY DEFAULT 1 with single_row CHECK constraint)
ALTER TABLE invoice_sequence DROP CONSTRAINT single_row;
ALTER TABLE invoice_sequence DROP CONSTRAINT invoice_sequence_pkey;
ALTER TABLE invoice_sequence ALTER COLUMN id DROP DEFAULT;
ALTER TABLE invoice_sequence ALTER COLUMN id TYPE UUID USING gen_random_uuid();
ALTER TABLE invoice_sequence ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE invoice_sequence ADD PRIMARY KEY (id);
ALTER TABLE invoice_sequence ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE invoice_sequence ADD CONSTRAINT invoice_sequence_user_id_unique UNIQUE (user_id);

-- business_details: drop single-row constraint, change PK to UUID, add user_id
ALTER TABLE business_details DROP CONSTRAINT single_row;
ALTER TABLE business_details DROP CONSTRAINT business_details_pkey;
ALTER TABLE business_details ALTER COLUMN id DROP DEFAULT;
ALTER TABLE business_details ALTER COLUMN id TYPE UUID USING gen_random_uuid();
ALTER TABLE business_details ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE business_details ADD PRIMARY KEY (id);
ALTER TABLE business_details ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE business_details ADD CONSTRAINT business_details_user_id_unique UNIQUE (user_id);
