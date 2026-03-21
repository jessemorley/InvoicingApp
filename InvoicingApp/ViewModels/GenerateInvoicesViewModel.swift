import Foundation

@MainActor
final class GenerateInvoicesViewModel: ObservableObject {
    private let service = InvoiceGenerationService()

    @Published var groups: [ClientEntryGroup] = []
    @Published var isLoading = false
    @Published var isGenerating = false
    @Published var generatedInvoices: [Invoice] = []
    @Published var errorMessage: String?
    @Published var showSuccess = false

    var selectedGroupCount: Int {
        groups.filter(\.isSelected).count
    }

    var selectedEntryCount: Int {
        groups.filter(\.isSelected).reduce(0) { $0 + $1.entries.count }
    }

    var selectedTotal: Decimal {
        groups.filter(\.isSelected).reduce(0) { $0 + $1.total }
    }

    func scan() async {
        isLoading = true
        do {
            groups = try await service.scanUninvoicedEntries()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func toggleGroup(_ group: ClientEntryGroup) {
        if let idx = groups.firstIndex(where: { $0.id == group.id }) {
            groups[idx].isSelected.toggle()
        }
    }

    func generate() async {
        isGenerating = true
        errorMessage = nil
        do {
            generatedInvoices = try await service.generateInvoices(for: groups)
            showSuccess = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isGenerating = false
    }
}
