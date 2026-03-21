-- Main clients
INSERT INTO clients (name, billing_type, rate_full_day, rate_half_day, pays_super, super_rate, invoice_frequency, address, suburb, email)
VALUES ('The ICONIC', 'day_rate', 350.00, 200.00, true, 0.12, 'weekly', 'Unit 206, 30-40 Harcourt Parade Rosebery', 'Rosebery, NSW 2018', 'jaime.linwood@theiconic.com.au');

INSERT INTO clients (name, billing_type, rate_full_day, pays_super, super_rate, invoice_frequency, address, suburb, email)
VALUES ('The ICONIC Creative', 'day_rate', 500.00, true, 0.12, 'per_job', 'Level 16 338 Pitt St', 'Sydney, NSW 2000', 'creativeinvoices@theiconic.com.au');

INSERT INTO clients (name, billing_type, rate_hourly, pays_super, super_rate, invoice_frequency, address, suburb, email)
VALUES ('Images That Sell', 'hourly', 45.00, true, 0.12, 'weekly', 'Suite 401/30-40 Harcourt Parade', 'Rosebery NSW 2018', 'jodie@imagesthatsell.com.au');

INSERT INTO clients (name, billing_type, rate_hourly, pays_super, invoice_frequency, address, suburb, email, abn)
VALUES ('JD Sports', 'hourly', 40.00, false, 'weekly', 'Level 12 338-340 Pitt St', 'Sydney, NSW 2000', 'lachlanmaroon@jdsf.com.au', '63 614 310 075');

-- One-off clients
INSERT INTO clients (name, billing_type, invoice_frequency, address, suburb, abn)
VALUES ('Accent Lifestyle Pty Ltd - Trading as Glue', 'manual', 'per_job', '719 Elizabeth St', 'Waterloo NSW 2017', '79 636 815 284');

INSERT INTO clients (name, billing_type, invoice_frequency, email, address, suburb)
VALUES ('Studio Messa', 'manual', 'per_job', 'micah.iovenitti@studio-messa.com', '8 Australia St', 'Camperdown NSW 2050');

INSERT INTO clients (name, billing_type, invoice_frequency, address, suburb, abn)
VALUES ('Paralia Beauty', 'manual', 'per_job', 'Suite 316 / Mezzanine, 388 George St', 'Sydney NSW 2000', '62 618 089 552');

INSERT INTO clients (name, billing_type, invoice_frequency, email, abn)
VALUES ('Kai Lao', 'manual', 'per_job', 'kailaophoto@gmail.com', '96 543 317 438');

INSERT INTO clients (name, billing_type, invoice_frequency, email, address, suburb)
VALUES ('Glassons', 'manual', 'per_job', 'kaylap@glassons.com', 'Dock B5 11 Lord St', 'Botany NSW 2019');
