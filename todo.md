Entries View:
- Add start finish and break times to list view where applicable
- Add option to add new client from client selection dropdown in entries creation view
- Remember last view instead of showing list view when returning from elsewhere
- Calendar view: click day to add entry for that day
- Entries inspector: click invoice chip to open that invoice
- List view: Instead of tick for group invoice button when invoiced, continue to use document icon; colour invoice button to correspond to invoice chips (grey, orange (issued) or green (paid))
- Entries list view: move invoice button/number to group header (the line with client name and date range), but right-aligned. Then align group total with the subtotals.

- Generate invoices bar says 1 invoice(s), when there are uninvoiced dates across two weeks

Invoices Summary View:
- Add column for super amount

PDF Invoice:

Settings:
- Resize window to fit tab contents

Invoice Preview:
- Information like start/finish/break times, full day/half day, etc. should be shown on the invoice line items

PWA:
- lazy load entries on scroll


Features
- Export feature
- App seems to be relying on network connection to pull all data from supabase as needed without a local caching system, making the interface sluggish and unusable without a network connection. Plan a system to solve this.
- System that flags potential errors:
    - Invoice with dates from more than one week
    - Duplicate invoice numbers
    - More than one entry per date

- Add line items to invoice (e.g. gear hire)

- Client Settings
Currently per-client invoicing rules such as day rate vs hours, role, super, etc. are set in the app code, but ideally these variables would be set from within the client view in the app. That way it’s consistent and transparent, and easier to manage moving forward.
Write a a plan summarising all the current differences between existing client invoicing rules and how these could be set with a consistent client options interface.
Outline the changes that would need to happen to the database to make this possible.
Let me know whether a database backup in some form would be advisable before beginning implementation.