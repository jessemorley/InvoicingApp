import Foundation

struct ClientInvoiceGroup: Identifiable {
    let id: UUID
    let client: Client
    var invoices: [Invoice]

    var subtotal: Decimal {
        invoices.reduce(0) { $0 + $1.total }
    }

    var outstanding: Decimal {
        invoices.filter { $0.status != .paid }.reduce(0) { $0 + $1.total }
    }
}

@MainActor
final class SummaryViewModel: ObservableObject {
    private let supabase = SupabaseService.shared

    @Published var groups: [ClientInvoiceGroup] = []
    @Published var invoices: [Invoice] = []
    @Published var clients: [Client] = []
    @Published var startDate: Date
    @Published var endDate: Date
    @Published var isLoading = false
    @Published var errorMessage: String?

    var grossTotal: Decimal {
        invoices.reduce(0) { $0 + $1.total }
    }

    var outstandingTotal: Decimal {
        invoices.filter { $0.status != .paid }.reduce(0) { $0 + $1.total }
    }

    init() {
        // Default to current financial year (Jul-Jun)
        let calendar = Calendar.current
        let now = Date()
        let year = calendar.component(.year, from: now)
        let month = calendar.component(.month, from: now)
        let fyStartYear = month >= 7 ? year : year - 1
        self.startDate = calendar.date(from: DateComponents(year: fyStartYear, month: 7, day: 1)) ?? now
        self.endDate = calendar.date(from: DateComponents(year: fyStartYear + 1, month: 6, day: 30)) ?? now
    }

    func loadData() async {
        isLoading = true
        do {
            clients = try await supabase.fetch(from: "clients", orderBy: "name")
            invoices = try await supabase.fetch(from: "invoices", orderBy: "issued_date", ascending: false)

            let clientMap = Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0) })
            var groupDict: [UUID: ClientInvoiceGroup] = [:]
            for invoice in invoices {
                guard let client = clientMap[invoice.clientId] else { continue }
                if groupDict[client.id] == nil {
                    groupDict[client.id] = ClientInvoiceGroup(id: client.id, client: client, invoices: [])
                }
                groupDict[client.id]?.invoices.append(invoice)
            }
            groups = Array(groupDict.values).sorted { $0.client.name < $1.client.name }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func deleteInvoice(_ invoice: Invoice, deleteEntries: Bool) async {
        do {
            if deleteEntries {
                try await supabase.deleteEntriesByInvoiceId(invoice.id)
            } else {
                try await supabase.clearInvoiceId(forInvoiceId: invoice.id)
            }
            try await supabase.delete(from: "invoices", id: invoice.id)
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleStatus(for invoice: Invoice) async {
        let newStatus: InvoiceStatus
        switch invoice.status {
        case .draft: newStatus = .issued
        case .issued: newStatus = .paid
        case .paid: newStatus = .draft
        }

        do {
            try await supabase.update(
                in: "invoices",
                id: invoice.id,
                value: ["status": newStatus.rawValue]
            )
            if let idx = invoices.firstIndex(where: { $0.id == invoice.id }) {
                invoices[idx].status = newStatus
            }
            // Refresh groups
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
