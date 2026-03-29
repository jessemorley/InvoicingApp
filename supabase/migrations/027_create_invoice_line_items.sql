CREATE TABLE invoice_line_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity    NUMERIC,
    amount      NUMERIC NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns invoice line items" ON invoice_line_items
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
