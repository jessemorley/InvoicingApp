# Invoicing App — Context for Claude

## What This Is
A macOS SwiftUI invoicing app for a freelance photographer (Jesse Morley). Logs shoot entries across multiple clients with different billing models, generates sequential invoices, exports PDFs, and tracks payment status. Supabase backend (Postgres + REST API + Auth).

## Tech Stack
- **macOS app**: SwiftUI, MVVM, targeting macOS 14+
- **Backend**: Supabase (supabase-swift v2 SDK)
- **PDF**: HTML template rendered in WKWebView → NSPrintOperation
- **Auth**: Supabase Auth, single user

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

## Current State
- Core flow working: log entries → generate invoices → view in summary
- PDF export, status toggling, client management, calendar view exist but may need testing
- PWA (mobile interface) not yet built
