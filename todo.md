Entries View:
- Add start finish and break times to list view where applicable
- Add option to add new client from client selection dropdown in entries creation view
- Remember last view instead of showing list view when returning from elsewhere
- Calendar view: click day to add entry for that day
- Entries inspector: click invoice chip to open that invoice
- List view: Instead of tick for group invoice button when invoiced, continue to use document icon; colour invoice button to correspond to invoice chips (grey, orange (issued) or green (paid))
- Entries list view: move invoice button/number to group header (the line with client name and date range), but right-aligned. Then align group total with the subtotals.

Invoices Summary View:
- Add column for super amount

PDF Invoice:
- Match styling to example PDF [text](invoicemockup.html)

Settings:
- Resize window to fit tab contents

Invoice Preview:
- Information like start/finish/break times, full day/half day, etc. should be shown on the invoice line items

PWA:
- ability to edit entries from recent list (unless already invoiced)
- abolity to delete entrties from recent list (unless already invoiced)
- add invoice chips (invoice number and colour) to entries in recent list

Features
- Export feature
- App seems to be relying on network connection to pull all data from supabase as needed without a local caching system, making the interface sluggish and unusable without a network connection. Plan a system to solve this.