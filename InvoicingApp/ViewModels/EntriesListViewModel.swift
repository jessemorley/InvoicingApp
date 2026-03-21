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

    func deleteEntry(_ entry: Entry) async {
        do {
            try await supabase.delete(from: "entries", id: entry.id)
            entries.removeAll { $0.id == entry.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
