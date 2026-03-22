import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case entries = "Entries"
    case generateInvoices = "Generate Invoices"
    case summary = "Invoices"
    case stats = "Stats"
    case clients = "Clients"
    case settings = "Settings"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .entries: "list.bullet"
        case .generateInvoices: "plus.circle"
        case .summary: "doc.text"
        case .stats: "chart.bar"
        case .clients: "person.2"
        case .settings: "gear"
        }
    }
}

struct ContentView: View {
    @State private var selection: SidebarItem? = .entries

    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, selection: $selection) { item in
                Label(item.rawValue, systemImage: item.icon)
                    .tag(item)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200)
        } detail: {
            switch selection {
            case .entries:
                NavigationStack {
                    EntriesListView()
                }
            case .generateInvoices:
                GenerateInvoicesView()
            case .summary:
                NavigationStack {
                    SummaryView()
                }
            case .stats:
                StatsView()
            case .clients:
                NavigationStack {
                    ClientListView()
                }
            case .settings:
                SettingsView()
            case nil:
                Text("Select an item")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
