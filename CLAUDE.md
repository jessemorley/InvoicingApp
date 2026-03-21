# Invoicing App — Context for Claude

## What This Is
A macOS SwiftUI invoicing app for a freelance photographer (Jesse Morley). Logs shoot entries across multiple clients with different billing models, generates sequential invoices, exports PDFs, and tracks payment status. Supabase backend (Postgres + REST API + Auth).

## Tech Stack
- **macOS app**: SwiftUI, MVVM, targeting macOS 14+
- **Backend**: Supabase (supabase-swift v2 SDK)
- **PDF**: HTML template rendered in WKWebView → `createPDF(configuration:)` (no NSPrintOperation — sandbox incompatible)
- **Auth**: Supabase Auth, single user, tokens stored in UserDefaults (not Keychain — avoids sandbox prompt issues)

## Project Structure
- `InvoicingApp/Models/` — Codable structs matching Supabase tables
- `InvoicingApp/Services/` — SupabaseService (data), CalculationService (rates/bonus/super), InvoiceGenerationService, PDFExportService
- `InvoicingApp/ViewModels/` — one per screen
- `InvoicingApp/Views/` — SwiftUI views grouped by feature
- `supabase/migrations/` — numbered SQL files (enums, tables, seeds, RLS, functions)
- `plan.md` — full product spec with all business logic, rates, client details

## Key Gotchas

### Supabase date columns → use String, not Date
Supabase DATE columns return `"2026-03-21"` strings, TIMESTAMPTZ returns ISO 8601 strings. All model date fields are `String` with computed `dateValue` properties for display. Using `Date` causes silent decoding failures.

### supabase-swift v2 builder chains
`.select()` → `PostgrestFilterBuilder`, `.order()` → `PostgrestTransformBuilder`. These are different types — you cannot store in a single `var` and conditionally chain. Use separate method overloads with complete unbroken chains from `.from()` to `.execute()`.

### PostgREST UPDATE safety
PostgREST rejects UPDATE without a WHERE clause, even inside PL/pgSQL functions. Add `WHERE true` to any UPDATE in Supabase functions that operates on a single-row table (e.g. `invoice_sequence`).

### RLS policies need WITH CHECK
`FOR ALL USING (...)` only covers SELECT/DELETE. INSERT/UPDATE also need `WITH CHECK (...)`.

### WKWebView sandbox warnings are harmless
WKWebView's WebContent subprocess logs many sandbox errors (pasteboard, launchservicesd, audio, etc.) in sandboxed apps. These don't affect functionality — PDF export works fine despite them.

### createPDF uses completion handler, not async/await
`WKWebView.createPDF(configuration:completionHandler:)` — the async overload is not available on this SDK version. Wrap with `withCheckedThrowingContinuation`.

### LogEntryViewModel supports both create and edit
`LogEntryViewModel` is used for both new entries and editing existing ones. Call `populateFromEntry(_:client:)` and set `onEditSave` for edit mode. The same form components (`IconicEntryForm`, `HourlyEntryForm`, `ManualEntryForm`) are reused in `EntryDetailEditView`.

### Entries list groups by client + week
`EntriesListView` groups entries by client and ISO week (`ClientWeekGroup`), not by date. Each group has a summary row with subtotal (excluding super) and an Invoice button for uninvoiced groups.

## Current State
- Core flow working: log entries → edit entries → generate invoices → view in summary → export PDF
- Invoice deletion with option to keep or delete linked entries
- Client active toggle filters across log entry, entries list, and invoice generation
- Calendar view shows monthly grid with entry descriptions and amounts
- Toolbar uses native macOS segmented picker (List/Calendar) and Tahoe-style navigation controls
- PWA (mobile interface) not yet built
