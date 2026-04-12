# Supabase Schema — Invoicing App

**Project:** `invoicing` (`cmbycqzjlwvydemaxrtb`), region `ap-southeast-2`, Postgres 17.
**Auth:** Supabase Auth. All tables are RLS-enabled and scoped to `auth.uid()` via a `user_id uuid` column.

---

## Enums

| Enum | Values |
|------|--------|
| `billing_type` | `day_rate`, `hourly`, `manual` |
| `day_type` | `full`, `half` |
| `invoice_status` | `draft`, `issued`, `paid` |
| `invoice_frequency` | `weekly`, `per_job` |
| `expense_category` | `gear_permanent`, `gear_consumable`, `gear_rental`, `lab`, `education`, `software`, `travel`, `other` |

---

## Tables

### `clients`
Stores each billing client. ~15 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → `auth.users.id` | RLS owner |
| `name` | text | Client display name |
| `billing_type` | `billing_type` enum | `day_rate`, `hourly`, or `manual` |
| `rate_full_day` | numeric? | Day rate billing: full day rate |
| `rate_half_day` | numeric? | Day rate billing: half day rate |
| `rate_hourly` | numeric? | Hourly billing: base hourly rate |
| `rate_hourly_photographer` | numeric? | Hourly: role-specific rate (photographer) |
| `rate_hourly_operator` | numeric? | Hourly: role-specific rate (operator) |
| `pays_super` | boolean | Whether client pays superannuation (default false) |
| `super_rate` | numeric | Super rate, default 0.12 (12%) |
| `invoice_frequency` | `invoice_frequency` enum | `weekly` or `per_job`, default `per_job` |
| `is_active` | boolean | Soft-disable; filters out of UI (default true) |
| `show_role` | boolean | Whether to show role field on entries (default false) |
| `entry_label` | text? | Custom label for the entry description field |
| `default_start_time` | time? | Pre-fills start time on new entries |
| `default_finish_time` | time? | Pre-fills finish time on new entries |
| `address` | text | Client address |
| `suburb` | text | Client suburb |
| `contact_name` | text? | Contact person's name (used in email greeting) |
| `email` | text | Client email |
| `abn` | text? | Client ABN (Australian Business Number) |
| `notes` | text? | Free-form notes |
| `created_at` | timestamptz | |

---

### `client_workflow_rates`
Per-client ICONIC-style workflow bonus rate config. ~8 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `client_id` | uuid FK → `clients.id` | |
| `workflow` | text | Workflow name (e.g. "ICONIC") |
| `kpi` | integer | SKU target (KPI threshold for bonus) |
| `incentive_rate_per_sku` | numeric | Bonus per SKU above KPI |
| `upper_limit_skus` | integer | SKU cap after which bonus stops growing |
| `max_bonus` | numeric | Maximum bonus payable (default 40.00) |
| `is_flat_bonus` | boolean | If true, pay `max_bonus` flat once KPI is hit (default false) |

---

### `entries`
Individual work/shoot log entries. ~211 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users.id` | RLS owner |
| `client_id` | uuid FK → `clients.id` | |
| `invoice_id` | uuid? FK → `invoices.id` | Null = uninvoiced; set when included in an invoice |
| `date` | date | Shoot/work date (returned as `"YYYY-MM-DD"` string) |
| `billing_type_snapshot` | `billing_type` enum | Snapshot of client billing type at time of entry |
| `day_type` | `day_type`? | `full` or `half` — for day_rate entries |
| `workflow_type` | text? | Workflow label (e.g. "ICONIC") — for day_rate entries |
| `brand` | text? | Brand name — for day_rate entries |
| `skus` | integer? | SKU count — for day_rate ICONIC entries |
| `role` | text? | Role (photographer/operator) — for hourly entries |
| `shoot_client` | text? | End client name if different from billing client |
| `description` | text? | Free-form description |
| `start_time` | time? | Start time — for hourly entries |
| `finish_time` | time? | Finish time — for hourly entries |
| `break_minutes` | integer? | Break duration in minutes (default 0) |
| `hours_worked` | numeric? | Computed hours (finish − start − break) |
| `base_amount` | numeric | Base pay amount (default 0) |
| `bonus_amount` | numeric | Bonus/incentive amount (default 0) |
| `super_amount` | numeric | Superannuation amount (default 0) |
| `total_amount` | numeric | base + bonus + super (default 0) |
| `created_at` | timestamptz | |

---

### `invoices`
Invoice headers. ~144 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users.id` | RLS owner |
| `client_id` | uuid FK → `clients.id` | |
| `invoice_number` | text UNIQUE | e.g. `"INV-042"` |
| `issued_date` | date | Date invoice was issued (`"YYYY-MM-DD"`) |
| `due_date` | date | Payment due date (`"YYYY-MM-DD"`) |
| `paid_date` | date? | Date payment was received (`"YYYY-MM-DD"`) |
| `subtotal` | numeric | Sum of entry base+bonus amounts (excl. super) |
| `super_amount` | numeric | Total super across entries |
| `total` | numeric | subtotal + super_amount |
| `status` | `invoice_status` enum | `draft`, `issued`, `paid` (default `draft`) |
| `notes` | text? | Invoice notes |
| `created_at` | timestamptz | |

Entries are linked to an invoice by setting `entries.invoice_id`.

---

### `invoice_sequence`
One row per user. Tracks the last-used invoice number for sequential generation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid UNIQUE FK → `auth.users.id` | |
| `last_number` | integer | Incremented by `next_invoice_number()` RPC |
| `invoice_prefix` | text | Prepended to number, default `"INV"` |

---

### `business_details`
One row per user. Freelancer's own business info for PDF invoices.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid UNIQUE FK → `auth.users.id` | |
| `name` | text | Freelancer name |
| `business_name` | text | Trading/business name |
| `abn` | text | ABN |
| `address` | text | Business address |
| `bsb` | text | Bank BSB |
| `account_number` | text | Bank account number |
| `super_fund` | text | Superannuation fund name |
| `super_member_number` | text | Super member number |
| `super_fund_abn` | text | Super fund ABN |
| `super_usi` | text | Super fund USI |
| `include_super_in_totals` | boolean | Whether super is included in invoice totals (default true) |

---

### `invoice_line_items`
Custom line items attached to an invoice (free-form, not linked to entries). Cascade-deleted when invoice is deleted.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `invoice_id` | uuid FK → `invoices.id` ON DELETE CASCADE | |
| `user_id` | uuid FK → `auth.users.id` ON DELETE CASCADE | RLS owner |
| `description` | text NOT NULL | Line item description |
| `quantity` | numeric? | Optional quantity |
| `amount` | numeric NOT NULL | Line item amount |
| `sort_order` | integer | Display order (default 0) |
| `created_at` | timestamptz NOT NULL | |

---

### `scheduled_emails`
Queued invoice emails awaiting delivery by the send-invoice Edge Function. ~3 rows.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → `auth.users.id` | RLS owner |
| `invoice_id` | uuid? FK → `invoices.id` | The associated invoice (nullable) |
| `to_address` | text | Recipient email address |
| `subject` | text | Email subject line |
| `body_text` | text | Plain-text email body |
| `invoice_html` | text | HTML invoice content to attach/embed |
| `filename` | text | Suggested attachment filename |
| `scheduled_for` | timestamptz | When to send the email |
| `mark_issued` | boolean | If true, mark invoice as `issued` after sending (default false) |
| `status` | text | `pending`, `sent`, or `error` (default `pending`) |
| `error` | text? | Error message if sending failed |
| `sent_at` | timestamptz? | Timestamp when email was successfully sent |
| `created_at` | timestamptz | |

---

### `expenses`
Personal expense records for Australian sole trader tax purposes. ~0 rows initially.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → `auth.users.id` | RLS owner |
| `date` | date | Expense date (`"YYYY-MM-DD"`) |
| `category` | `expense_category` enum | |
| `description` | text | |
| `amount` | numeric | GST-inclusive when `gst_included = true` |
| `gst_included` | boolean | Whether amount includes GST (default true). BAS-ready for when user crosses GST threshold. |
| `notes` | text? | Optional free-form notes |
| `receipt_path` | text? | Supabase Storage path in `receipts` bucket (`{user_id}/{expense_id}/{filename}`) |
| `is_billable` | boolean | Default false — reserved for future invoice integration |
| `invoice_id` | uuid? FK → `invoices.id` | Always null in v1 |
| `created_at` | timestamptz | |

**GST helpers (computed):** GST component = `amount / 11`; ex-GST = `amount × 10/11`.

---

## RPC Functions

### `next_invoice_number() → integer`
Atomically increments `invoice_sequence.last_number` for the current user and returns the new value. Called during invoice generation to get the next sequential number.

```sql
UPDATE invoice_sequence SET last_number = last_number + 1
WHERE user_id = auth.uid() RETURNING last_number;
```

### `provision_new_user()` (trigger)
Fires `AFTER INSERT ON auth.users`. Creates a default `invoice_sequence` row (`last_number = 0`) and a blank `business_details` row for each new user.

---

## Key Relationships

```
auth.users
  ├── clients (user_id)
  │     └── client_workflow_rates (client_id)
  ├── entries (user_id)
  │     ├── clients (client_id)
  │     └── invoices (invoice_id)  ← null until invoiced
  ├── invoices (user_id)
  │     ├── clients (client_id)
  │     ├── invoice_line_items (invoice_id, cascade delete)
  │     └── scheduled_emails (invoice_id)
  ├── scheduled_emails (user_id)
  ├── invoice_sequence (user_id, 1:1)
  └── business_details (user_id, 1:1)
```

---

## Business Logic Notes

- **Billing types:** `day_rate` entries use `day_type` (full/half) and optionally `workflow_type`/`skus` for ICONIC bonus calculation. `hourly` entries use `start_time`/`finish_time`/`break_minutes`. `manual` entries have a flat `base_amount`.
- **ICONIC bonus:** When `workflow_type` is set on a day_rate entry, a bonus is calculated from `client_workflow_rates` — either flat (`is_flat_bonus=true`) or per-SKU above `kpi`, capped at `max_bonus`.
- **Super:** If `clients.pays_super = true`, super is calculated as `(base + bonus) × super_rate` and stored in `entries.super_amount`.
- **Invoice generation:** Scans entries where `invoice_id IS NULL`, groups by client, calls `next_invoice_number()` RPC, inserts `invoices` row, then bulk-updates `entries.invoice_id`.
- **Scheduled emails:** Created when user queues an invoice email for delivery. The send-invoice Edge Function polls for `status = 'pending'` rows where `scheduled_for <= now()`, sends the email, and updates `status` to `sent` (or `error`). If `mark_issued = true`, the linked invoice is also updated to `issued`.
- **Dates:** All `date` columns return `"YYYY-MM-DD"` strings via PostgREST. Do not decode as `Date` — use string handling.
- **Invoice number format:** `{invoice_prefix}-{last_number}` e.g. `INV-042`. Prefix stored in `invoice_sequence`.
