import Foundation

struct ClientEntryGroup: Identifiable, Sendable {
    let id: String      // unique per client+week: "\(clientId)-year-week"
    let clientId: UUID  // client ID (used for invoice generation)
    let client: Client
    var entries: [Entry]
    var isSelected: Bool = true

    var dateRange: String {
        let dates = entries.map(\.dateValue).sorted()
        guard let first = dates.first, let last = dates.last else { return "" }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        if first == last {
            return formatter.string(from: first)
        }
        return "\(formatter.string(from: first)) – \(formatter.string(from: last))"
    }

    var subtotal: Decimal {
        entries.reduce(0) { $0 + $1.baseAmount + $1.bonusAmount }
    }

    var superTotal: Decimal {
        entries.reduce(0) { $0 + $1.superAmount }
    }

    var total: Decimal {
        entries.reduce(0) { $0 + $1.totalAmount }
    }
}

@MainActor
final class InvoiceGenerationService {
    private let supabase = SupabaseService.shared

    func scanUninvoicedEntries() async throws -> [ClientEntryGroup] {
        let entries: [Entry] = try await supabase.fetchUninvoicedEntries()

        let clients: [Client] = try await supabase.fetch(from: "clients")
        let clientMap = Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0) })

        let calendar = Calendar.current
        var groups: [String: ClientEntryGroup] = [:]
        for entry in entries {
            guard let client = clientMap[entry.clientId], client.isActive else { continue }
            let comps = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: entry.dateValue)
            let key = "\(client.id)-\(comps.yearForWeekOfYear ?? 0)-\(comps.weekOfYear ?? 0)"
            if groups[key] == nil {
                groups[key] = ClientEntryGroup(id: key, clientId: client.id, client: client, entries: [])
            }
            groups[key]?.entries.append(entry)
        }

        return Array(groups.values).sorted {
            if $0.client.name != $1.client.name { return $0.client.name < $1.client.name }
            return ($0.entries.first?.date ?? "") < ($1.entries.first?.date ?? "")
        }
    }

    func generateInvoices(for groups: [ClientEntryGroup]) async throws -> [Invoice] {
        var invoices: [Invoice] = []
        let settings = UserSettings.load()

        for group in groups where group.isSelected {
            print("[InvoiceGen] Generating invoice for \(group.client.name) with \(group.entries.count) entries")

            let nextNumber: Int
            do {
                nextNumber = try await supabase.nextInvoiceNumber()
                print("[InvoiceGen] Got invoice number: \(settings.invoicePrefix)\(nextNumber)")
            } catch {
                print("[InvoiceGen] RPC FAILED: \(error)")
                throw error
            }
            let invoiceNumber = "\(settings.invoicePrefix)\(nextNumber)"
            let now = Date()

            let dueDate = Calendar.current.date(byAdding: .day, value: settings.dueDateOffsetDays, to: now) ?? now
            let weekEnd = group.client.invoiceFrequency == .weekly ? weekEndingDate(for: group.entries) : nil

            let invoice = Invoice(
                id: UUID(),
                invoiceNumber: invoiceNumber,
                clientId: group.client.id,
                issuedDate: Invoice.dateString(from: now),
                dueDate: Invoice.dateString(from: dueDate),
                weekEnding: weekEnd.map { Invoice.dateString(from: $0) },
                subtotal: group.subtotal,
                superAmount: group.superTotal,
                total: group.total,
                status: .draft,
                notes: nil,
                createdAt: Invoice.isoString(from: now)
            )

            print("[InvoiceGen] Inserting invoice...")
            try await supabase.insert(into: "invoices", value: invoice)
            print("[InvoiceGen] Invoice inserted, updating \(group.entries.count) entries...")
            try await supabase.updateEntries(
                ids: group.entries.map(\.id),
                invoiceId: invoice.id
            )
            print("[InvoiceGen] Entries updated")
            invoices.append(invoice)
        }

        return invoices
    }

    private func weekEndingDate(for entries: [Entry]) -> Date? {
        guard let lastDate = entries.map(\.dateValue).max() else { return nil }
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: lastDate)
        // Sunday = 1, so days until Sunday
        let daysUntilSunday = (8 - weekday) % 7
        return calendar.date(byAdding: .day, value: daysUntilSunday, to: lastDate)
    }
}
