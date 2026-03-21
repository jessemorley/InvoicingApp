# Invoicing App — Claude Code Brief

## Overview

A macOS SwiftUI app for a freelance photographer to log shoot entries, generate weekly invoices, export PDFs, and track payment status. A lightweight mobile-accessible web interface (PWA) served from the same Supabase backend allows entry logging on the go.

---

## Tech Stack

- **macOS app**: SwiftUI, targeting macOS 14+
- **Database / API**: Supabase (Postgres + auto-generated REST API)
- **PDF export**: WKWebView rendering an HTML invoice template, printed to PDF via NSPrintOperation
- **Mobile interface**: A separate PWA (HTML/JS, hosted on Cloudflare Pages or Vercel) hitting the same Supabase backend — used for quick entry logging only
- **Auth**: Supabase Auth, single user (personal app)

---

## My Details (pre-populate in app settings, all editable)

- **Name**: Jesse Morley
- **Business**: Jesse Morley Photography
- **ABN**: 62 622 680 864
- **Address**: 1 Scouller Street, Marrickville NSW 2204
- **BSB**: 313140
- **Account number**: 12239852
- **Super fund**: Smart Future Trust
- **Super member number**: 192726
- **Super fund ABN**: 68964712340
- **Super USI**: 68964712340019

---

## Database Schema

### `clients`
| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| name | text | display name |
| billing_type | enum | `day_rate`, `hourly`, `manual` |
| rate_full_day | decimal | nullable |
| rate_half_day | decimal | nullable |
| rate_hourly | decimal | nullable |
| pays_super | boolean | |
| super_rate | decimal | default 0.12 |
| invoice_frequency | enum | `weekly`, `per_job` |
| address | text | |
| suburb | text | |
| email | text | |
| abn | text | nullable |
| notes | text | nullable |
| is_active | boolean | default true |
| created_at | timestamp | |

### `client_workflow_rates` (The ICONIC commission table)
| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| client_id | uuid | foreign key → clients |
| workflow | text | e.g. "Apparel", "Model Shot", "Batch A" etc |
| kpi | integer | target SKU count |
| incentive_rate_per_sku | decimal | bonus per SKU above KPI |
| upper_limit_skus | integer | SKU count at which max bonus is reached |
| max_bonus | decimal | maximum bonus payable ($40) |

Seed data from TSV:
| Workflow | KPI | Incentive rate/SKU | Upper limit | Max bonus |
|---|---|---|---|---|
| Apparel | 84 | 5.00 | 92 | 40.00 |
| Model Shot | 126 | 3.08 | 139 | 40.00 |
| Batch A | 70 | 5.71 | 77 | 40.00 |
| Batch B | 42 | 10.00 | 46 | 40.00 |
| Batch C | 49 | 8.00 | 54 | 40.00 |
| Batch D | 56 | 6.67 | 62 | 40.00 |
| Flatlay | 84 | 5.00 | 92 | 40.00 |

### `entries`
| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| client_id | uuid | foreign key → clients |
| date | date | |
| invoice_id | uuid | nullable — null until invoice generated |
| billing_type_snapshot | enum | `day_rate`, `hourly`, `manual` — snapshot at time of entry |
| day_type | enum | `full`, `half` — nullable, day rate clients only |
| workflow_type | text | nullable — The ICONIC only (Apparel/Product/Own Brand) |
| brand | text | nullable — The ICONIC Own Brand only |
| skus | integer | nullable — The ICONIC Apparel/Product only |
| role | text | nullable — Images That Sell only (Photographer/Operator) |
| shoot_client | text | nullable — Images That Sell: who they're shooting for |
| description | text | freeform — JD Sports and one-off clients |
| start_time | time | nullable — hourly clients |
| finish_time | time | nullable — hourly clients |
| break_minutes | integer | nullable — hourly clients, default 0 |
| hours_worked | decimal | computed: (finish - start - break) in hours |
| base_amount | decimal | computed and stored |
| bonus_amount | decimal | computed and stored, default 0 |
| super_amount | decimal | computed and stored, default 0 |
| total_amount | decimal | computed and stored |
| created_at | timestamp | |

### `invoices`
| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| invoice_number | text | e.g. "JM170" — globally incrementing |
| client_id | uuid | foreign key → clients |
| issued_date | date | |
| due_date | date | issued_date + 30 days |
| week_ending | date | nullable — for weekly clients |
| subtotal | decimal | sum of entry base + bonus amounts |
| super_amount | decimal | sum of entry super amounts |
| total | decimal | subtotal + super |
| status | enum | `draft`, `issued`, `paid` |
| notes | text | nullable |
| created_at | timestamp | |

### `invoice_sequence`
Single-row table storing the last used invoice number integer. Increment on each invoice creation.
| Field | Type |
|---|---|
| last_number | integer |

Seed with `169` so first generated invoice is JM170.

---

## Rate Calculation Logic

### The ICONIC (day rate + SKU commission)
```
Full day, Own Brand:
  base = 350.00
  bonus = 40.00 (always, no SKU threshold)
  subtotal = 390.00

Full day, Apparel or Product:
  base = 350.00
  if skus >= upper_limit:
    bonus = 40.00
  elif skus > kpi:
    bonus = min((skus - kpi) * incentive_rate_per_sku, 40.00)
  else:
    bonus = 0.00
  subtotal = base + bonus

Half day (any type):
  base = 200.00
  bonus = 0.00
  subtotal = 200.00

Super = subtotal * 0.12
Total = subtotal + super
```

### Images That Sell (hourly)
```
hours_worked = (finish_time - start_time) - break_minutes / 60
subtotal = hours_worked * 45.00
super = subtotal * 0.12
total = subtotal + super
```

### JD Sports (hourly, no super)
```
hours_worked = (finish_time - start_time) - break_minutes / 60
subtotal = hours_worked * 40.00
super = 0.00
total = subtotal
```

### One-off / manual clients
```
subtotal = manually entered amount
super = subtotal * 0.12 if pays_super else 0.00
total = subtotal + super
```

All rates are stored in the `clients` table and editable — none are hardcoded in app logic.

---

## Pre-loaded Clients

Seed the `clients` table with these on first launch:

| Name | Billing type | Full day | Half day | Hourly | Super | Frequency |
|---|---|---|---|---|---|---|
| The ICONIC | day_rate | 350.00 | 200.00 | — | Yes | weekly |
| The ICONIC Creative | day_rate | 500.00 | (editable, leave blank) | — | Yes | per_job |
| Images That Sell | hourly | — | — | 45.00 | Yes | weekly |
| JD Sports | hourly | — | — | 40.00 | No | weekly |

Client contact details to seed:

**The ICONIC**
- Address: Unit 206, 30-40 Harcourt Parade Rosebery
- Suburb: Rosebery, NSW 2018
- Email: jaime.linwood@theiconic.com.au

**The ICONIC Creative**
- Address: Level 16 338 Pitt St
- Suburb: Sydney, NSW 2000
- Email: creativeinvoices@theiconic.com.au

**Images That Sell**
- Address: Suite 401/30-40 Harcourt Parade
- Suburb: Rosebery NSW 2018
- Email: jodie@imagesthatsell.com.au

**JD Sports**
- Address: Level 12 338-340 Pitt St
- Suburb: Sydney, NSW 2000
- Email: lachlanmaroon@jdsf.com.au
- ABN: 63 614 310 075

Also seed the following as one-off clients (manual billing type, per_job frequency):
- Accent Lifestyle Pty Ltd - Trading as Glue (ABN 79 636 815 284, 719 Elizabeth St, Waterloo NSW 2017)
- Studio Messa (micah.iovenitti@studio-messa.com, 8 Australia St, Camperdown NSW 2050)
- Paralia Beauty (ABN 62 618 089 552, Suite 316 / Mezzanine, 388 George St, Sydney NSW 2000)
- Kai Lao (ABN 96 543 317 438, kailaophoto@gmail.com)
- Glassons (kaylap@glassons.com, Dock B5 11 Lord St, Botany NSW 2019)

---

## App Structure — Screens

### 1. Log Entry
The primary daily-use screen. Client dropdown at the top — selecting a client shows only the relevant fields.

**The ICONIC fields:**
- Date (date picker, defaults to today)
- Day type (segmented control: Full / Half)
- Workflow type (picker: Apparel / Product / Own Brand) — hidden if half day
- Brand (text field) — visible only if Own Brand
- SKUs (number field) — visible only if Apparel or Product

Show a calculated amount preview below the form before saving. For Own Brand show "$390.00 + $46.80 super = $436.80". For Apparel/Product show base + calculated bonus + super in real time as SKUs are entered.

**Images That Sell fields:**
- Date
- Shoot client (text field — who they're shooting for, appears in line description)
- Role (segmented control: Photographer / Operator)
- Start time, Finish time, Break (minutes)
- Show calculated hours and amount preview

**JD Sports fields:**
- Date
- Description (text field)
- Start time, Finish time, Break (minutes)
- Show calculated hours and amount preview

**The ICONIC Creative fields:**
- Date
- Day type (Full / Half)
- Show calculated amount preview

**One-off / manual client fields:**
- Date
- Description (text field)
- Amount (manual entry)
- Super toggle (pre-set from client settings, but overridable per entry)

**Add New Client button** at bottom of client dropdown — opens client management screen.

---

### 2. Entries List

Two view modes toggled at the top: **List** and **Calendar**.

**List view:**
- Chronological, newest first
- Filter bar: client dropdown + date range picker
- Each row shows: date, client badge, description summary, calculated amount
- Amount column toggleable (show/hide)
- Uninvoiced entries shown with a subtle indicator (e.g. open circle vs filled)
- Tapping an entry opens a detail/edit view

**Calendar view:**
- Week grid, Mon–Sun
- Each day shows entries as cards with client colour coding
- Scroll back through previous weeks
- Same amount toggle as list view

---

### 3. Generate Invoices

Accessible via a prominent **Generate Invoices** button (toolbar or sidebar).

On tap:
- App scans all uninvoiced entries
- Groups them by client
- Shows a list: "3 invoices ready — The ICONIC (4 entries), JD Sports (3 entries), Images That Sell (2 entries)"
- Each group shows the date range covered and total amount
- User can deselect any group or individual entries before confirming
- On confirm: invoices are created, invoice numbers assigned sequentially (JM170, JM171 etc in order of creation), entries marked as invoiced

---

### 4. Invoice Detail & PDF Export

- Shows the invoice rendered in the app matching the PDF layout (see below)
- Status toggle: Draft → Issued → Paid
- Edit button — allows changing due date, adding notes, or removing entries
- Export PDF button — renders via WKWebView to PDF, saves to ~/Documents/Invoices/[InvoiceNumber].pdf and opens in Preview

---

### 5. Summary View

Mirrors the layout of summary.pdf.

- Table of all invoices: Date | Invoice No. | Client | Description | Amount | Status
- Grouped by client with subtotals
- Outstanding balance called out per client
- Overall gross total and outstanding total at the bottom
- Filter by date range (default: current financial year, Jul–Jun)
- Status column is tappable to toggle Issued → Paid inline

---

### 6. Client Management

List of all clients. Each client has an edit screen with all fields:
- Name, address, suburb, email, ABN
- Billing type (day_rate / hourly / manual)
- Rates (full day, half day, hourly — whichever are relevant)
- Super toggle + rate (default 12%)
- Invoice frequency (weekly / per_job)
- For The ICONIC: editable workflow rate table (KPI, incentive rate, upper limit, max bonus per workflow type)
- Active/inactive toggle (inactive clients hidden from entry dropdown but data retained)
- Add new client button

---

## Invoice PDF Layout

Match the existing invoice layout exactly. Render as HTML → PDF via WKWebView.

```
[TOP LEFT]                          [TOP RIGHT]
Jesse Morley Photography            Invoice [NUMBER]
ABN 62 622 680 864                  [CLIENT NAME]
1 Scouller Street                   [CLIENT EMAIL]
Marrickville, NSW 2204              [CLIENT ADDRESS LINE 1]
                                    [CLIENT SUBURB]
Issued [DATE]
Due [DATE + 30 days]

─────────────────────────────────────────────────────
Item                          Qty    Rate      Amount
─────────────────────────────────────────────────────
[LINE ITEMS — see below]       1    [rate]    [amount]
─────────────────────────────────────────────────────
                                    Subtotal  $xxx.xx
                               Super (12%)    $xxx.xx
                                    Total    $xxx.xx

[FOOTER]
BSB [BSB]  Account Number [ACCOUNT]
[SUPER FUND NAME], Member [MEMBER NO.], ABN [ABN]
USI [USI]
```

Footer only shown if client pays_super = true.

### Line item description format by client:

**The ICONIC:**
- `[Day], [Mon] [D] [Brand]` for Own Brand (e.g. "Mon, Feb 9 Dazie")
- `[Day], [Mon] [D] [Workflow]` for Apparel/Product (e.g. "Wed, Feb 11 Branded")

**The ICONIC Creative:**
- `[Day], [Mon] [D] Creative Assist`

**Images That Sell:**
- `[Day], [Mon] [D] [Shoot client] ([Role]) [Xh]` (e.g. "Mon, Feb 9 Glassons (Photographer) 7.5h")

**JD Sports:**
- `[Day], [Mon] [D] [Description] [Xh]` (e.g. "Mon, Feb 9 Studio shoot 8h")

**One-off:**
- `[Day], [Mon] [D] [Description]`

If SKU bonus applies for The ICONIC, show it as a separate line item directly below the base day entry:
- `  + SKU bonus ([N] SKUs)`  → Amount: $xx.xx

---

## Mobile PWA

A simple web interface hosted on Cloudflare Pages, hitting the same Supabase backend.

Screens:
1. **Log entry** — same client-aware form as macOS app, mobile-optimised layout
2. **Recent entries** — last 14 days, read-only list

No invoice generation, no PDF export, no summary view — those stay on the Mac app.

Auth via Supabase magic link or password, same credentials as macOS app.

---

## Settings Screen

- All "My Details" fields editable (name, ABN, address, BSB, account, super fund details)
- Supabase connection credentials
- Default due date offset (default: 30 days)
- Financial year start month (default: July)