import Foundation
import SwiftUI

enum EntriesViewMode: String, CaseIterable {
    case list = "List"
    case calendar = "Calendar"
}

@MainActor
final class EntriesListViewModel: ObservableObject {
    private let supabase = SupabaseService.shared

    @Published var entries: [Entry] = []
    @Published var clients: [Client] = []
    @Published var viewMode: EntriesViewMode = .list
    @Published var showAmounts = true
    @Published var selectedClientId: UUID?
    @Published var startDate: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @Published var endDate: Date = Date()
    @Published var isLoading = false
    @Published var errorMessage: String?

    var activeClients: [Client] {
        clients.filter(\.isActive)
    }

    var filteredEntries: [Entry] {
        entries.filter { entry in
            if let clientId = selectedClientId, entry.clientId != clientId {
                return false
            }
            return true
        }
    }

    var clientMap: [UUID: Client] {
        Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0) })
    }

    struct ClientWeekGroup: Identifiable {
        let id: String // "clientId-yearWeek"
        let clientId: UUID
        let weekStart: Date
        let entries: [Entry]

        var subtotal: Decimal {
            entries.reduce(0) { $0 + $1.baseAmount + $1.bonusAmount }
        }

        var allInvoiced: Bool {
            entries.allSatisfy { $0.invoiceId != nil }
        }

        var allUninvoiced: Bool {
            entries.allSatisfy { $0.invoiceId == nil }
        }
    }

    var groupedByClientWeek: [ClientWeekGroup] {
        let calendar = Calendar.current
        var dict: [String: (clientId: UUID, weekStart: Date, entries: [Entry])] = [:]

        for entry in filteredEntries {
            let comps = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: entry.dateValue)
            let weekStart = calendar.date(from: comps) ?? entry.dateValue
            let key = "\(entry.clientId)-\(comps.yearForWeekOfYear ?? 0)-\(comps.weekOfYear ?? 0)"
            if dict[key] == nil {
                dict[key] = (clientId: entry.clientId, weekStart: weekStart, entries: [])
            }
            dict[key]?.entries.append(entry)
        }

        return dict.map { ClientWeekGroup(id: $0.key, clientId: $0.value.clientId, weekStart: $0.value.weekStart, entries: $0.value.entries.sorted { $0.date < $1.date }) }
            .sorted { $0.weekStart > $1.weekStart }
    }

    // Calendar support
    var entriesByDate: [Date: [Entry]] {
        let calendar = Calendar.current
        var dict: [Date: [Entry]] = [:]
        for entry in filteredEntries {
            let day = calendar.startOfDay(for: entry.dateValue)
            dict[day, default: []].append(entry)
        }
        return dict
    }

    func loadData() async {
        isLoading = true
        do {
            clients = try await supabase.fetch(from: "clients", orderBy: "name")
            entries = try await supabase.fetch(from: "entries", orderBy: "date", ascending: false)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func updateEntry(_ entry: Entry) async {
        do {
            try await supabase.update(in: "entries", id: entry.id, value: entry)
            if let idx = entries.firstIndex(where: { $0.id == entry.id }) {
                entries[idx] = entry
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func invoiceGroup(_ group: ClientWeekGroup) async {
        guard let client = clientMap[group.clientId] else { return }
        let service = InvoiceGenerationService()
        let entryGroup = ClientEntryGroup(
            id: client.id,
            client: client,
            entries: group.entries
        )
        do {
            _ = try await service.generateInvoices(for: [entryGroup])
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteEntry(_ entry: Entry) async {
        do {
            try await supabase.delete(from: "entries", id: entry.id)
            entries.removeAll { $0.id == entry.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
