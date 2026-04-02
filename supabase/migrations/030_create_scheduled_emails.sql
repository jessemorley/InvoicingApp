create table scheduled_emails (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  invoice_id   uuid        references invoices(id) on delete set null,
  to_address   text        not null,
  subject      text        not null,
  body_text    text        not null,
  invoice_html text        not null,
  filename     text        not null,
  scheduled_for timestamptz not null,
  mark_issued  boolean     not null default false,
  status       text        not null default 'pending',
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

alter table scheduled_emails enable row level security;

create policy "Users manage own scheduled emails"
  on scheduled_emails for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
