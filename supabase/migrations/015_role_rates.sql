-- Add per-role hourly rates for clients with Photographer/Operator distinction
-- When show_role = true, these rates are used instead of rate_hourly

ALTER TABLE clients
  ADD COLUMN rate_hourly_photographer DECIMAL(10,2),
  ADD COLUMN rate_hourly_operator     DECIMAL(10,2);

-- Seed with current rate for both roles
UPDATE clients SET
  rate_hourly_photographer = rate_hourly,
  rate_hourly_operator     = rate_hourly
WHERE show_role = true;
