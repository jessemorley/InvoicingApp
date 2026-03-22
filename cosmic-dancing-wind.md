# Local Caching System — Invoicing App

## Context

The app fetches all data fresh from Supabase on every view appear, making the UI sluggish with a slow connection and completely unusable offline. The fix is a **stale-while-revalidate** cache: serve persisted data immediately from disk on load, then silently refresh from Supabase in the background. Mutations keep the cache in sync after they succeed.

---

## Approach

### New File: `LocalCacheService.swift`

**Location:** `InvoicingApp/Services/LocalCacheService.swift`

A `@MainActor final class` singleton. Stores JSON files in `~/Library/Application Support/InvoicingApp/cache/`. One file per entity type + a `cache_meta.json` tracking timestamps.

```swift
enum CacheEntity: String {
    case clients, entries, invoices, clientWorkflowRates
}

extension CacheEntity {
    var defaultMaxAge: TimeInterval {
        switch self {
        case .clients, .clientWorkflowRates: return 3600  // 1 hour
        case .entries, .invoices: return 300              // 5 minutes
        }
    }
}

@MainActor final class LocalCacheService {
    static let shared = LocalCacheService()

    func read<T: Decodable>(_ entity: CacheEntity) -> [T]?
    func write<T: Encodable>(_ entity: CacheEntity, items: [T])
    func upsert<T: Codable & Identifiable>(_ entity: CacheEntity, item: T) where T.ID == UUID
    func remove(_ entity: CacheEntity, id: UUID)
    func isFresh(_ entity: CacheEntity) -> Bool   // uses defaultMaxAge
    func hasCached(_ entity: CacheEntity) -> Bool
    func clearAll()

    // Convenience bulk operations for invoice deletion
    func removeEntriesByInvoiceId(_ invoiceId: UUID)
    func clearInvoiceIdOnEntries(_ invoiceId: UUID)
}
```

Private metadata struct `CacheMeta: Codable { var timestamps: [String: Date] }` persisted to `cache_meta.json`.

`upsert`: reads, replaces item with matching `id` or appends, writes back.
`remove`: reads, filters out id, writes back.
All file I/O is synchronous (data is small; no background queue needed).

---

## ViewModel Changes — Stale-While-Revalidate Pattern

The canonical pattern for every `loadData()`:

1. Read from cache → assign to `@Published` → UI renders immediately
2. Skip spinner if cache had data
3. Fetch from Supabase only if cache is stale (or no cache)
4. On success: assign to `@Published` + write to cache
5. On network failure with cached data: suppress error (show last-known state)

### `EntriesListViewModel.loadData()`
- Serve cache for clients, entries, invoices before any network call
- Only show `isLoading = true` if nothing was in cache
- Fetch each entity separately only if `!cache.isFresh(.X)`
- After network success: `cache.write(.entries, items: fresh)` etc.
- `scanUninvoiced()` remains network-only (always needs truth for bottom bar)

### `EntriesListViewModel` mutations
- `updateEntry(_:)` — after `supabase.update`: `cache.upsert(.entries, item: entry)`
- `deleteEntry(_:)` — after `supabase.delete`: `cache.remove(.entries, id: entry.id)`
- `invoiceGroup(_:)` — calls `loadData()` after generation; cache will be updated by `InvoiceGenerationService` (see below)

### `SummaryViewModel.loadData()`
- Same pattern for clients and invoices

### `SummaryViewModel` mutations
- `deleteInvoice(_, deleteEntries:)` — after Supabase calls:
  - If `deleteEntries`: `cache.removeEntriesByInvoiceId(invoice.id)`
  - Else: `cache.clearInvoiceIdOnEntries(invoice.id)`
  - Then: `cache.remove(.invoices, id: invoice.id)`
  - Then: call `loadData()` as before (cache now correct, so spinner won't show)
- `updateStatus(for:to:)` — after `supabase.update`: `cache.upsert(.invoices, item: updatedInvoice)`; remove redundant `await loadData()` call

### `LogEntryViewModel.loadClients()`
- Serve from cache first, then background refresh if stale
- `saveEntry()` — after insert/update: `cache.upsert(.entries, item: entry)`

### `LogEntryViewModel.loadWorkflowRates(for:)`
- Read full `clientWorkflowRates` cache, filter by `clientId` in-memory
- On network refresh: replace rates for this clientId in the flat cache array, write back

### `ClientManagementViewModel.loadClients()`
- Serve from cache first
- `saveClient(_:isNew:)` — after save: `cache.upsert(.clients, item: client)`
- `saveWorkflowRate(_:isNew:)` — after save: `cache.upsert(.clientWorkflowRates, item: rate)`
- `deleteWorkflowRate(_:)` — after delete: `cache.remove(.clientWorkflowRates, id: rate.id)`

### `InvoiceDetailViewModel.loadDetails()`
- Read from cache: filter `entries` by `invoiceId`, find `client` by id — serve immediately
- Background fetch only if entries cache is stale; **do not write filtered result back to entries cache** (it's a subset)
- `cycleStatus()` — after update: `cache.upsert(.invoices, item: updatedInvoice)`
- `deleteInvoice(deleteEntries:)` — call `cache.removeEntriesByInvoiceId`/`cache.clearInvoiceIdOnEntries` + `cache.remove(.invoices, id:)`

### `InvoiceGenerationService.generateInvoices(for:)`
After each successful invoice insert + `updateEntries(ids:invoiceId:)`:
```swift
cache.upsert(.invoices, item: invoice)
// Patch entries in cache: read, set invoiceId on matching ids, write back
// OR: invalidate entries cache (set timestamp to .distantPast) so next loadData forces a fetch
```
**Recommended**: invalidate entries cache timestamp after `updateEntries` since we don't have the updated Entry structs back.

---

## Logout — Cache Invalidation

In `SupabaseService.signOut()`, after `client.auth.signOut()`:
```swift
LocalCacheService.shared.clearAll()
```

---

## Implementation Order

1. Create `LocalCacheService.swift` with all methods
2. `EntriesListViewModel` — integrate + smoke test (most-used path)
3. `SummaryViewModel` — integrate
4. `LogEntryViewModel` — integrate
5. `ClientManagementViewModel` — integrate
6. `InvoiceDetailViewModel` — integrate (filtered-fetch nuance)
7. `InvoiceGenerationService` — add cache upsert/invalidation after generation
8. `SupabaseService.signOut()` — add `clearAll()`

---

## Critical Files

- `InvoicingApp/Services/LocalCacheService.swift` — **new file**
- `InvoicingApp/ViewModels/EntriesListViewModel.swift`
- `InvoicingApp/ViewModels/SummaryViewModel.swift`
- `InvoicingApp/ViewModels/LogEntryViewModel.swift`
- `InvoicingApp/ViewModels/ClientManagementViewModel.swift`
- `InvoicingApp/ViewModels/InvoiceDetailViewModel.swift`
- `InvoicingApp/Services/InvoiceGenerationService.swift`
- `InvoicingApp/Services/SupabaseService.swift`

---

## Verification

1. Launch app with network → data loads → quit app
2. Disconnect from network → relaunch app → UI populates immediately from cache (no spinner, no error)
3. Reconnect → data silently refreshes in background
4. Log a new entry offline — confirm it fails gracefully (Supabase call will throw)
5. Log a new entry online → quit → relaunch offline → new entry visible in cache
6. Delete an entry → verify it's gone from cache (not just from memory)
7. Generate invoice → quit → relaunch → invoice visible without re-fetch
8. Sign out → sign in → confirm cache is rebuilt from Supabase (no stale data)
