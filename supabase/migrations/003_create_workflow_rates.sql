CREATE TABLE client_workflow_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workflow TEXT NOT NULL,
    kpi INTEGER NOT NULL,
    incentive_rate_per_sku DECIMAL NOT NULL,
    upper_limit_skus INTEGER NOT NULL,
    max_bonus DECIMAL NOT NULL DEFAULT 40.00
);

CREATE INDEX idx_workflow_rates_client ON client_workflow_rates(client_id);
