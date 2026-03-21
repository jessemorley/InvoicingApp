CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    invoice_id UUID,
    billing_type_snapshot billing_type NOT NULL,
    day_type day_type,
    workflow_type TEXT,
    brand TEXT,
    skus INTEGER,
    role TEXT,
    shoot_client TEXT,
    description TEXT,
    start_time TIME,
    finish_time TIME,
    break_minutes INTEGER DEFAULT 0,
    hours_worked DECIMAL,
    base_amount DECIMAL NOT NULL DEFAULT 0,
    bonus_amount DECIMAL NOT NULL DEFAULT 0,
    super_amount DECIMAL NOT NULL DEFAULT 0,
    total_amount DECIMAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entries_client ON entries(client_id);
CREATE INDEX idx_entries_invoice ON entries(invoice_id);
CREATE INDEX idx_entries_date ON entries(date);
