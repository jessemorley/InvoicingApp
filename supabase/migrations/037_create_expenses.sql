CREATE TYPE expense_category AS ENUM (
    'gear_permanent',
    'gear_consumable',
    'gear_rental',
    'lab',
    'education',
    'software',
    'travel',
    'other'
);

CREATE TABLE expenses (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date         DATE        NOT NULL,
    category     expense_category NOT NULL,
    description  TEXT        NOT NULL,
    amount       NUMERIC     NOT NULL,
    gst_included BOOLEAN     NOT NULL DEFAULT true,
    notes        TEXT,
    receipt_path TEXT,
    is_billable  BOOLEAN     NOT NULL DEFAULT false,
    invoice_id   UUID        REFERENCES invoices(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- amount is GST-inclusive when gst_included = true.
-- User is not yet GST-registered but the field is BAS-ready for when they cross the threshold.
-- GST component = amount / 11; ex-GST amount = amount * 10/11.

CREATE INDEX idx_expenses_user_date ON expenses(user_id, date DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns expenses" ON expenses
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
