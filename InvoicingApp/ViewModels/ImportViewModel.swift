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

    private static let entryIdsKey = "importedEntryIds"
    private static let invoiceIdsKey = "importedInvoiceIds"

    var filesSelected: Bool {
        entriesFileURL != nil && invoicesFileURL != nil
    }

    var canImport: Bool {
        validationResult?.isValid == true && !importComplete
    }

    var canRollback: Bool {
        !rolledBack && hasSavedImport
    }

    private var hasSavedImport: Bool {
        UserDefaults.standard.stringArray(forKey: Self.entryIdsKey) != nil
    }

    init() {
        // Restore state if a previous import exists
        if hasSavedImport {
            importComplete = true
            let entryCount = UserDefaults.standard.stringArray(forKey: Self.entryIdsKey)?.count ?? 0
            let invoiceCount = UserDefaults.standard.stringArray(forKey: Self.invoiceIdsKey)?.count ?? 0
            importSummary = "Previous import: \(entryCount) entries, \(invoiceCount) invoices"
        }
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
            saveImportIds(entryIds: result.entryIds, invoiceIds: result.invoiceIds)
            importComplete = true
            importSummary = "Imported \(result.entriesInserted) entries and \(result.invoicesInserted) invoices"
        } catch {
            errorMessage = "Import failed: \(error.localizedDescription)"
        }

        isImporting = false
    }

    func rollbackImport() async {
        guard let (entryIds, invoiceIds) = loadImportIds() else { return }

        isRollingBack = true
        errorMessage = nil

        do {
            let deleted = try await importService.rollbackImport(
                entryIds: entryIds,
                invoiceIds: invoiceIds
            )
            clearImportIds()
            rolledBack = true
            importSummary = "Rolled back: deleted \(deleted.entriesDeleted) entries and \(deleted.invoicesDeleted) invoices"
        } catch {
            errorMessage = "Rollback failed: \(error.localizedDescription)"
        }

        isRollingBack = false
    }

    // MARK: - Persist import IDs to UserDefaults

    private func saveImportIds(entryIds: [UUID], invoiceIds: [UUID]) {
        UserDefaults.standard.set(entryIds.map(\.uuidString), forKey: Self.entryIdsKey)
        UserDefaults.standard.set(invoiceIds.map(\.uuidString), forKey: Self.invoiceIdsKey)
    }

    private func loadImportIds() -> (entryIds: [UUID], invoiceIds: [UUID])? {
        guard let entryStrings = UserDefaults.standard.stringArray(forKey: Self.entryIdsKey),
              let invoiceStrings = UserDefaults.standard.stringArray(forKey: Self.invoiceIdsKey) else {
            return nil
        }
        return (
            entryIds: entryStrings.compactMap { UUID(uuidString: $0) },
            invoiceIds: invoiceStrings.compactMap { UUID(uuidString: $0) }
        )
    }

    private func clearImportIds() {
        UserDefaults.standard.removeObject(forKey: Self.entryIdsKey)
        UserDefaults.standard.removeObject(forKey: Self.invoiceIdsKey)
    }
}
