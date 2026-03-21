import Foundation

@MainActor
final class InvoiceDetailViewModel: ObservableObject {
    private let supabase = SupabaseService.shared

    @Published var invoice: Invoice
    @Published var entries: [Entry] = []
    @Published var client: Client?
    @Published var isLoading = false
    @Published var errorMessage: String?

    init(invoice: Invoice) {
        self.invoice = invoice
    }

    func loadDetails() async {
        isLoading = true
        do {
            entries = try await supabase.fetch(
                from: "entries",
                filterColumn: "invoice_id",
                filterValue: invoice.id.uuidString,
                orderBy: "date"
            )
            client = try await supabase.fetchSingle(from: "clients", id: invoice.clientId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func cycleStatus() async {
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
            invoice.status = newStatus
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func exportPDF() async {
        guard let client else { return }
        do {
            _ = try await PDFExportService().exportPDF(
                invoice: invoice,
                entries: entries,
                client: client
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
