-- Add is_flat_bonus to client_workflow_rates
-- When true, the max_bonus is applied directly (no SKU threshold calculation)
-- Used for Own Brand entries at The ICONIC

ALTER TABLE client_workflow_rates
  ADD COLUMN is_flat_bonus BOOLEAN NOT NULL DEFAULT false;

-- Insert Own Brand as a workflow rate row for The ICONIC
INSERT INTO client_workflow_rates (id, client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus, is_flat_bonus)
SELECT
  gen_random_uuid(),
  id,
  'Own Brand',
  0,
  0,
  0,
  40.00,
  true
FROM clients
WHERE name ILIKE '%ICONIC%' AND name NOT ILIKE '%Creative%';
