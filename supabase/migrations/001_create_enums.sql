CREATE TYPE billing_type AS ENUM ('day_rate', 'hourly', 'manual');
CREATE TYPE invoice_frequency AS ENUM ('weekly', 'per_job');
CREATE TYPE day_type AS ENUM ('full', 'half');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid');
