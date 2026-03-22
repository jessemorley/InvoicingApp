-- Backfill super_amount and total for invoices that should have 12% super
-- but were generated without it. Covers Images That Sell and The ICONIC Creative.
-- Super = 12% of subtotal; total = subtotal + super_amount
UPDATE invoices
SET
    super_amount = ROUND(subtotal * 0.12, 2),
    total        = subtotal + ROUND(subtotal * 0.12, 2)
WHERE client_id IN (
    SELECT id FROM clients WHERE name IN ('Images That Sell', 'The ICONIC Creative')
)
AND super_amount = 0;
