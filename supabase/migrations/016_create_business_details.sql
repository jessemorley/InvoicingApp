create table business_details (
    id                  integer primary key default 1,
    business_name       text not null default '',
    abn                 text not null default '',
    address             text not null default '',
    bsb                 text not null default '',
    account_number      text not null default '',
    super_fund          text not null default '',
    super_member_number text not null default '',
    super_fund_abn      text not null default '',
    super_usi           text not null default '',
    constraint single_row check (id = 1)
);

insert into business_details (id, business_name, abn, address, bsb, account_number, super_fund, super_member_number, super_fund_abn, super_usi)
values (1, 'Jesse Morley Photography', '62 622 680 864', '1 Scouller Street, Marrickville NSW 2204',
        '313140', '12239852', 'Smart Future Trust', '192726', '68964712340', '68964712340019');

alter table business_details enable row level security;
create policy "authenticated read" on business_details for select using (auth.role() = 'authenticated');
