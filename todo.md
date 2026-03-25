## MacOS App

### Entries View
- [ ] Add start finish and break times to list view where applicable
- [ ] Add option to add new client from client selection dropdown in entries creation view
- [ ] Remember last view instead of showing list view when returning from elsewhere
- [ ] Calendar view: click day to add entry for that day
- [ ] Entries inspector: click invoice chip to open that invoice
- [ ] List view: Instead of tick for group invoice button when invoiced, continue to use document icon; colour invoice button to correspond to invoice chips (grey, orange (issued) or green (paid))
- [ ] Entries list view: move invoice button/number to group header (the line with client name and date range), but right-aligned. Then align group total with the subtotals.

### Invoices Summary View
- [ ] Add column for super amount

### Settings
- [ ] Resize window to fit tab contents

### Invoice Preview
- [ ] Information like start/finish/break times, full day/half day, etc. should be shown on the invoice line items

## Features
- [ ] Export feature
- [ ] App seems to be relying on network connection to pull all data from supabase as needed without a local caching system, making the interface sluggish and unusable without a network connection. Plan a system to solve this.
- [ ] System that flags potential errors:
    - [ ] Invoice with dates from more than one week
    - [ ] Duplicate invoice numbers
    - [ ] More than one entry per date
- [ ] Add line items to invoice (e.g. gear hire)
- [ ] Client Settings — Currently per-client invoicing rules such as day rate vs hours, role, super, etc. are set in the app code, but ideally these variables would be set from within the client view in the app. That way it's consistent and transparent, and easier to manage moving forward.
    - [ ] Write a plan summarising all the current differences between existing client invoicing rules and how these could be set with a consistent client options interface.
    - [ ] Outline the changes that would need to happen to the database to make this possible.
    - [ ] Confirm whether a database backup in some form would be advisable before beginning implementation.

## PWA
- [ ] Lazy load entries on scroll

---

## Code Quality (from audit 2026-03-24)

### P0 — Crashes / Broken behaviour
- [x] **CalendarView.swift:98** — Force unwrap on `cal.range(of:in:for:)!` crashes if calendar returns nil. Replace with `guard let`.
- [x] **app.js:1305** — `dx` computed as `clientX - clientX` (always zero). Removed the dead line.
- [ ] **app.js:184** — `loadInitialData` Promise.all has no error handling; any failed fetch leaves globals in partial/null state and UI breaks silently.

### P1 — Data integrity / silent failures
- [x] **app.js:1762 vs 192** — `businessDetails` `let` declared at line 1762 but assigned at line 192. Moved declaration to top of file with other globals.
- [ ] **SupabaseService.swift:261** — `updateEntries()` fires one UPDATE per entry; a mid-loop failure leaves orphaned entries with no invoice_id. Batch with `IN (...)`.
- [ ] **app.js:623-699** — Race condition: `loadRecentEntries()` and `loadMoreEntries()` both read/write `entriesOldestDate` concurrently. Add a loading guard flag.
- [x] **app.js:1476** — `invoicesScrollLoading` flag never checked (load is synchronous from cache). Removed unused variable.

### P2 — Silent errors, maintainability
- [ ] **Entry.swift:51, Invoice.swift:46** — `dateValue` silently returns `Date()` on parse failure. Should log or return optional.
- [ ] **UserSettings.swift:71-83** — `save()` uses `try?`, `load()` returns defaults on any decode error — no indication of corruption.
- [ ] **Duplicated calc logic** — `CalculationService.swift` and `app.js calcDayRate()` implement the same ICONIC bonus logic. Any rule change must be made twice.

### P3 — Config / dead code
- [x] Add `.swiftlint.yml` whitelisting `vm`, `f`, `x`, `y` short-name conventions. SwiftLint findings: 91 → 22.
- [ ] Add `package.json` to `pwa/` for dependency pinning; add subresource integrity hash to CDN `<script>` tag in `index.html`.
- [x] **app.js:1765** — `fmtInvoiceCurrency` defined but never called. Deleted.
- [x] **app.js:2184** — `bonusHidden` assigned but never read. Deleted.
- [ ] **app.js:818** — `_list` and `_cardIndex` params unused; rename with `_` prefix to signal intent consistently.
