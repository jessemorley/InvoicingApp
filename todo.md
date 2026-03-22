Entries View:
- Add start finish and break times to list view where applicable
- Add option to add new client from client selection dropdown in entries creation view

Invoices View:

Settings:
- Add option to mark invoice as issued when exported as pdf (on by default)
- Move settings to separate window (like a typical macos app), with tabs for General, Personal Info, Login, Import
- Add next invoice options: Prefix and count from fields

Invoice Preview:
- Information like start/finish/break times, full day/half day, etc. should be shown on the invoice line items

Generate Invoices:
- Remove this is a separate tab. Instead, move the bottom bar showing "1 invoice 4 entries uninvoiced, $1738, Generate. Clicking generate should show a popup with a summary of the invoices that will be created along with options to create invoices or cancel. Creating the invoices should switch the user to invoices view.

Features
- Build export feature
- App seems to be relying on network connection to pull all data from supabase as needed without a local caching system, making the interface sluggish and unusable without a network connection. Plan a system to solve this.

- Build the mobile PWA

    A simple web interface hosted on Cloudflare Pages, hitting the same Supabase backend.

    Screens:
    1. **Log entry** — same client-aware form as macOS app, mobile-optimised layout
    2. **Recent entries** — last 14 days, read-only list

    No invoice generation, no PDF export, no summary view — those stay on the Mac app.

    Auth via Supabase magic link or password, same credentials as macOS app.