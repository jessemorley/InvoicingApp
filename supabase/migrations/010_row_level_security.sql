-- Enable RLS on all tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_workflow_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequence ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (single-user app)
CREATE POLICY "Authenticated full access" ON clients
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON client_workflow_rates
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON entries
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON invoices
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON invoice_sequence
    FOR ALL USING (auth.role() = 'authenticated');
