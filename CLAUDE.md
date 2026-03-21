# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Invoicing App — Context for Claude

## What This Is
A macOS SwiftUI invoicing app for a freelance photographer (Jesse Morley). Logs shoot entries across multiple clients with different billing models, generates sequential invoices, exports PDFs, and tracks payment status. Supabase backend (Postgres + REST API + Auth).

## Build & Run

- **Open in Xcode**: `open InvoicingApp.xcodeproj` — build and run with ⌘R
- **Command line**: `xcodebuild -project InvoicingApp.xcodeproj -scheme InvoicingApp -configuration Debug build`
- **No tests**: No test target exists
- **No linting**: No SwiftLint or other lint tools configured

## Architecture

Data flows: **Views → ViewModels → Services → Supabase**

- **Views** create `@StateObject` ViewModels, bind to `@Published` properties, call async methods via `.task {}` or button actions
- **ViewModels** are `@MainActor final class` conforming to `ObservableObject`; each has `loadData()` called from `.task {}`. Computed properties (e.g. `groupedByClientWeek`) derive display data from `@Published` source arrays
- **SupabaseService** is a `@MainActor` singleton handling all DB access (auth, CRUD, RPC). Generic `fetch<T>()` overloads cover most queries; specialized methods handle invoice-entry linking
- **CalculationService** is pure static functions: `calculateDayRate()` (with ICONIC workflow bonus logic), `calculateHourly()`, `calculateManual()` — all return `CalculationResult`
- **InvoiceGenerationService** orchestrates: `scanUninvoicedEntries()` → select clients → `generateInvoices()` which calls `nextInvoiceNumber()` RPC, inserts `Invoice`, links entries via `invoice_id`
- **PDFExportService** renders an HTML template in a hidden `WKWebView`, calls `createPDF(configuration:completionHandler:)`, writes to `~/Documents/Invoices/`, opens in Finder

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
`EntriesListView` groups entries by client and ISO week (`ClientWeekGroup`), not by date. Each group has a summary row with subtotal (excluding super) and an Invoice button for uninvoiced groups. Invoiced groups show the invoice number as a green bordered button linking to the invoice detail.

### EntriesListViewModel loads invoices too
`EntriesListViewModel` fetches invoices alongside entries and clients, exposing `invoiceMap: [UUID: Invoice]`. This is used by both the entries list (invoice number buttons) and calendar view (status icons).

### Calendar view stretches to fill and shows invoice status
`CalendarView` uses `GeometryReader` to divide available height across rows. `CalendarDayCell` shows a small invoice status icon (orange doc for draft/issued, green checkmark for paid) right-aligned on the client name row.

### Sidebar "Summary" was renamed to "Invoices"
The sidebar item and navigation title use "Invoices" (not "Summary"). The enum case is still `.summary` but `rawValue` is `"Invoices"`.

## Current State
- Core flow working: log entries → edit entries → generate invoices → view in Invoices tab → export PDF
- Invoice deletion with option to keep or delete linked entries
- Client active toggle filters across log entry, entries list, and invoice generation
- Calendar view shows monthly grid with entry descriptions, amounts, and invoice status icons
- Entries list shows invoice numbers linking to invoice detail for invoiced groups
- Invoice detail shows line items in columns: date, description, hours, amount
- Toolbar uses native macOS segmented picker (List/Calendar) and Tahoe-style navigation controls
- PWA (mobile interface) not yet built
