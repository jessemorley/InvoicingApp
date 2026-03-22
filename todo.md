Entries View:
- Add start finish and break times to list view where applicable
- Add option to add new client from client selection dropdown in entries creation view
- Remember last view instead of showing list view when returning from elsewhere

Invoices Summary View:
- Add column for super amount

PDF Invoice:
- Match styling to example PDF

Settings:
- Add option to mark invoice as issued when exported as pdf (on by default)
- Move settings to separate window (like a typical macos app), with tabs for General, Personal Info, Login, Import
- Add next invoice options: Prefix and count from fields

Invoice Preview:
- Information like start/finish/break times, full day/half day, etc. should be shown on the invoice line items

Generate Invoices:


Features
- Build export feature
- App seems to be relying on network connection to pull all data from supabase as needed without a local caching system, making the interface sluggish and unusable without a network connection. Plan a system to solve this.

Fixes:

- Build the mobile PWA
    A simple web interface hosted on Cloudflare Pages, hitting the same Supabase backend.
    Screens:
    1. **Log entry** — same client-aware form as macOS app, mobile-optimised layout
    2. **Recent entries** — [text](mobilePWAprototype.html)

    No invoice generation, no PDF export, no summary view — those stay on the Mac app.
    Auth via Supabase magic link or password, same credentials as macOS app.