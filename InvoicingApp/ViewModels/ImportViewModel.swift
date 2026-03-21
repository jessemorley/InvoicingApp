import Foundation

@MainActor
final class ImportViewModel: ObservableObject {
    @Published var validationResult: ValidationResult?
    @Published var isValidating = false
    @Published var isImporting = false
    @Published var isRollingBack = false
    @Published var importComplete = false
    @Published var rolledBack = false
    @Published var errorMessage: String?
    @Published var importSummary: String?
    @Published var entriesFileURL: URL?
    @Published var invoicesFileURL: URL?

    private let importService = ImportService()
    private var parsedData: ImportData?
    private var importResult: ImportService.ImportResult?

    var filesSelected: Bool {
        entriesFileURL != nil && invoicesFileURL != nil
    }

    var canImport: Bool {
        validationResult?.isValid == true && !importComplete
    }

    var canRollback: Bool {
        importComplete && !rolledBack && importResult != nil
    }

    func runDryRun() async {
        guard let entriesURL = entriesFileURL, let invoicesURL = invoicesFileURL else {
            errorMessage = "Select both CSV files first"
            return
        }

        isValidating = true
        errorMessage = nil
        validationResult = nil

        do {
            let gotEntries = entriesURL.startAccessingSecurityScopedResource()
            let gotInvoices = invoicesURL.startAccessingSecurityScopedResource()
            defer {
                if gotEntries { entriesURL.stopAccessingSecurityScopedResource() }
                if gotInvoices { invoicesURL.stopAccessingSecurityScopedResource() }
            }
            let data = try importService.parseCSVs(
                entriesPath: entriesURL.path,
                invoicesPath: invoicesURL.path
            )
            parsedData = data
            let result = try await importService.validate(data: data)
            validationResult = result
        } catch {
            errorMessage = error.localizedDescription
        }

        isValidating = false
    }

    func executeImport() async {
        guard let data = parsedData else {
            errorMessage = "Run dry run first"
            return
        }

        isImporting = true
        errorMessage = nil

        do {
            let result = try await importService.executeImport(data: data)
            importResult = result
            importComplete = true
            importSummary = "Imported \(result.entriesInserted) entries and \(result.invoicesInserted) invoices"
        } catch {
            errorMessage = "Import failed: \(error.localizedDescription)"
        }

        isImporting = false
    }

    func rollbackImport() async {
        guard let result = importResult else { return }

        isRollingBack = true
        errorMessage = nil

        do {
            let deleted = try await importService.rollbackImport(
                entryIds: result.entryIds,
                invoiceIds: result.invoiceIds
            )
            rolledBack = true
            importSummary = "Rolled back: deleted \(deleted.entriesDeleted) entries and \(deleted.invoicesDeleted) invoices"
        } catch {
            errorMessage = "Rollback failed: \(error.localizedDescription)"
        }

        isRollingBack = false
    }
}
