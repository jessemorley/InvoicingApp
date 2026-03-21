CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    billing_type billing_type NOT NULL,
    rate_full_day DECIMAL,
    rate_half_day DECIMAL,
    rate_hourly DECIMAL,
    pays_super BOOLEAN NOT NULL DEFAULT false,
    super_rate DECIMAL NOT NULL DEFAULT 0.12,
    invoice_frequency invoice_frequency NOT NULL DEFAULT 'per_job',
    address TEXT NOT NULL DEFAULT '',
    suburb TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    abn TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
