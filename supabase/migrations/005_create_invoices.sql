CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    issued_date DATE NOT NULL,
    due_date DATE NOT NULL,
    week_ending DATE,
    subtotal DECIMAL NOT NULL DEFAULT 0,
    super_amount DECIMAL NOT NULL DEFAULT 0,
    total DECIMAL NOT NULL DEFAULT 0,
    status invoice_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key from entries to invoices
ALTER TABLE entries
    ADD CONSTRAINT fk_entries_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
