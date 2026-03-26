import Foundation

enum DateRangePreset: String, CaseIterable {
    case financialYear = "Financial Year"
    case lastSixMonths = "Last 6 Months"
    case custom = "Selected Date Range"
}

enum StatusFilter: String, CaseIterable {
    case all = "All"
    case draft = "Draft"
    case issued = "Issued"
    case paid = "Paid"
}

struct ClientBreakdown: Identifiable {
    let id: UUID
    let name: String
    var paid: Decimal
    var outstanding: Decimal
    var super_: Decimal
}

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

    var superTotal: Decimal {
        invoices.reduce(0) { $0 + $1.superAmount }
    }
}

@MainActor
final class SummaryViewModel: ObservableObject {
    private let supabase = SupabaseService.shared
    private var includeSuperInTotals: Bool = UserSettings.load().includeSuperInTotals

    @Published var invoices: [Invoice] = []
    @Published var clients: [Client] = []
    @Published var startDate: Date
    @Published var endDate: Date
    @Published var dateRangePreset: DateRangePreset = .financialYear
    @Published var statusFilter: StatusFilter = .all
    @Published var groupByClient: Bool = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    var filteredInvoices: [Invoice] {
        invoices.filter { invoice in
            let date = invoice.issuedDateValue
            let inDateRange = date >= startDate && date <= endDate
            let matchesStatus: Bool
            switch statusFilter {
            case .all: matchesStatus = true
            case .draft: matchesStatus = invoice.status == .draft
            case .issued: matchesStatus = invoice.status == .issued
            case .paid: matchesStatus = invoice.status == .paid
            }
            return inDateRange && matchesStatus
        }
    }

    var groups: [ClientInvoiceGroup] {
        let clientMap = Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0) })
        var groupDict: [UUID: ClientInvoiceGroup] = [:]
        for invoice in filteredInvoices {
            guard let client = clientMap[invoice.clientId] else { continue }
            if groupDict[client.id] == nil {
                groupDict[client.id] = ClientInvoiceGroup(id: client.id, client: client, invoices: [])
            }
            groupDict[client.id]?.invoices.append(invoice)
        }
        return Array(groupDict.values).sorted { $0.client.name < $1.client.name }
    }

    func displayTotal(for invoice: Invoice) -> Decimal {
        includeSuperInTotals ? invoice.total : invoice.total - invoice.superAmount
    }

    var grossTotal: Decimal {
        filteredInvoices.reduce(0) { $0 + displayTotal(for: $1) }
    }

    var grossSuperTotal: Decimal {
        filteredInvoices.reduce(0) { $0 + $1.superAmount }
    }

    var outstandingTotal: Decimal {
        filteredInvoices.filter { $0.status != .paid }.reduce(0) { $0 + displayTotal(for: $1) }
    }

    var clientBreakdowns: [ClientBreakdown] {
        let clientMap = Dictionary(uniqueKeysWithValues: clients.map { ($0.id, $0) })
        var breakdowns: [UUID: ClientBreakdown] = [:]
        for invoice in filteredInvoices {
            let name = clientMap[invoice.clientId]?.name ?? "Unknown"
            if breakdowns[invoice.clientId] == nil {
                breakdowns[invoice.clientId] = ClientBreakdown(id: invoice.clientId, name: name, paid: 0, outstanding: 0, super_: 0)
            }
            if invoice.status == .paid {
                breakdowns[invoice.clientId]?.paid += invoice.total
            } else if invoice.status == .issued {
                breakdowns[invoice.clientId]?.outstanding += invoice.total
            }
            breakdowns[invoice.clientId]?.super_ += invoice.superAmount
        }
        return Array(breakdowns.values).sorted { ($0.paid + $0.outstanding) > ($1.paid + $1.outstanding) }
    }

    var topClientBreakdowns: [ClientBreakdown] {
        let sorted = clientBreakdowns
        if sorted.count <= 3 { return sorted }
        let top3 = Array(sorted.prefix(3))
        let rest = sorted.dropFirst(3)
        let other = ClientBreakdown(
            id: UUID(),
            name: "Other",
            paid: rest.reduce(0) { $0 + $1.paid },
            outstanding: rest.reduce(0) { $0 + $1.outstanding },
            super_: rest.reduce(0) { $0 + $1.super_ }
        )
        return top3 + [other]
    }

    var totalPaid: Decimal {
        filteredInvoices.filter { $0.status == .paid }.reduce(0) { $0 + $1.total }
    }

    var totalSuperAmount: Decimal {
        filteredInvoices.reduce(0) { $0 + $1.superAmount }
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

    func applyPreset(_ preset: DateRangePreset) {
        let calendar = Calendar.current
        let now = Date()
        switch preset {
        case .financialYear:
            let year = calendar.component(.year, from: now)
            let month = calendar.component(.month, from: now)
            let fyStartYear = month >= 7 ? year : year - 1
            startDate = calendar.date(from: DateComponents(year: fyStartYear, month: 7, day: 1)) ?? now
            endDate = calendar.date(from: DateComponents(year: fyStartYear + 1, month: 6, day: 30)) ?? now
        case .lastSixMonths:
            endDate = now
            startDate = calendar.date(byAdding: .month, value: -6, to: now) ?? now
        case .custom:
            break
        }
    }

    func clientName(for invoice: Invoice) -> String {
        clients.first { $0.id == invoice.clientId }?.name ?? "Unknown"
    }

    func loadData() async {
        isLoading = true
        do {
            clients = try await supabase.fetch(from: "clients", orderBy: "name")
            invoices = try await supabase.fetch(from: "invoices", orderBy: "issued_date", ascending: false)
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

    func updateStatus(for invoice: Invoice, to newStatus: InvoiceStatus) async {
        guard newStatus != invoice.status else { return }
        do {
            try await supabase.update(
                in: "invoices",
                id: invoice.id,
                value: ["status": newStatus.rawValue]
            )
            if let idx = invoices.firstIndex(where: { $0.id == invoice.id }) {
                invoices[idx].status = newStatus
            }
            await loadData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
