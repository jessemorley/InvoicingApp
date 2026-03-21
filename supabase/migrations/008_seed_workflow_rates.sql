-- Seed workflow rates for The ICONIC
INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Apparel', 84, 5.00, 92, 40.00 FROM clients WHERE name = 'The ICONIC';

INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Model Shot', 126, 3.08, 139, 40.00 FROM clients WHERE name = 'The ICONIC';

INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Batch A', 70, 5.71, 77, 40.00 FROM clients WHERE name = 'The ICONIC';

INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Batch B', 42, 10.00, 46, 40.00 FROM clients WHERE name = 'The ICONIC';

INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Batch C', 49, 8.00, 54, 40.00 FROM clients WHERE name = 'The ICONIC';

INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Batch D', 56, 6.67, 62, 40.00 FROM clients WHERE name = 'The ICONIC';

INSERT INTO client_workflow_rates (client_id, workflow, kpi, incentive_rate_per_sku, upper_limit_skus, max_bonus)
SELECT id, 'Flatlay', 84, 5.00, 92, 40.00 FROM clients WHERE name = 'The ICONIC';
