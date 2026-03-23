-- Add per-client invoicing configuration flags
-- entry_label: if set, shows a labelled text field in the entry form (e.g. "Job", "Description")
-- show_role: if true, shows Photographer/Operator role picker in entry form
-- default_start_time / default_finish_time: pre-fill time pickers for hourly clients

ALTER TABLE clients
  ADD COLUMN entry_label         TEXT,
  ADD COLUMN show_role           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN default_start_time  TIME,
  ADD COLUMN default_finish_time TIME;

-- Seed values matching current hardcoded behaviour
UPDATE clients SET entry_label = 'Job', show_role = true
  WHERE name ILIKE '%Images That Sell%';

UPDATE clients SET entry_label = 'Description'
  WHERE name ILIKE '%JD Sports%';
