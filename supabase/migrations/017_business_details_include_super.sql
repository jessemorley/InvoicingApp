alter table business_details
    add column include_super_in_totals boolean not null default true;

update business_details set include_super_in_totals = true where id = 1;

create policy "authenticated update" on business_details
    for update using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
