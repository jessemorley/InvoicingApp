DROP POLICY IF EXISTS "Authenticated full access" ON clients;
DROP POLICY IF EXISTS "Authenticated full access" ON client_workflow_rates;
DROP POLICY IF EXISTS "Authenticated full access" ON entries;
DROP POLICY IF EXISTS "Authenticated full access" ON invoices;
DROP POLICY IF EXISTS "Authenticated full access" ON invoice_sequence;
DROP POLICY IF EXISTS "authenticated read" ON business_details;
DROP POLICY IF EXISTS "authenticated update" ON business_details;

CREATE POLICY "User owns clients" ON clients
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- client_workflow_rates has no user_id — scoped via parent clients table
CREATE POLICY "User owns workflow rates" ON client_workflow_rates
    FOR ALL
    USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
    WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

CREATE POLICY "User owns entries" ON entries
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User owns invoices" ON invoices
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User owns invoice sequence" ON invoice_sequence
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User owns business details" ON business_details
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
