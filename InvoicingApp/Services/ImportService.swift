import Foundation

struct ParsedEntry {
    let date: String
    let clientName: String
    let billingType: String
    let dayType: String?
    let workflowType: String?
    let skus: Int?
    let startTime: String?
    let finishTime: String?
    let breakMinutes: Int?
    let hoursWorked: Decimal?
    let baseAmount: Decimal
    let bonusAmount: Decimal
    let description: String?
    let invoiceNumber: String
    let invoiceStatus: String
}

struct ParsedInvoice {
    let invoiceNumber: String
    let clientName: String
    let weekStarting: String
    let status: String
    let subtotal: Decimal
    let superAmount: Decimal
    let total: Decimal
}

struct ImportData {
    var entries: [ParsedEntry]
    var invoices: [ParsedInvoice]
}

struct ClientSummary: Identifiable {
    let id = UUID()
    let name: String
    let entryCount: Int
    let invoiceCount: Int
    let total: Decimal
}

struct ValidationResult {
    var errors: [String] = []
    var warnings: [String] = []
    var entriesCount: Int = 0
    var invoicesCount: Int = 0
    var clientSummaries: [ClientSummary] = []

    var hasErrors: Bool { !errors.isEmpty }
    var isValid: Bool { errors.isEmpty }
}

@MainActor
final class ImportService {
    private let supabase = SupabaseService.shared

    // MARK: - CSV Parsing

    func parseCSVs(entriesPath: String, invoicesPath: String) throws -> ImportData {
        let entriesURL = URL(fileURLWithPath: entriesPath)
        let invoicesURL = URL(fileURLWithPath: invoicesPath)
        let gotEntries = entriesURL.startAccessingSecurityScopedResource()
        let gotInvoices = invoicesURL.startAccessingSecurityScopedResource()
        defer {
            if gotEntries { entriesURL.stopAccessingSecurityScopedResource() }
            if gotInvoices { invoicesURL.stopAccessingSecurityScopedResource() }
        }
        let entriesCSV = try String(contentsOfFile: entriesPath, encoding: .utf8)
        let invoicesCSV = try String(contentsOfFile: invoicesPath, encoding: .utf8)

        let entries = try parseEntries(csv: entriesCSV)
        let invoices = try parseInvoices(csv: invoicesCSV)

        return ImportData(entries: entries, invoices: invoices)
    }

    private func parseEntries(csv: String) throws -> [ParsedEntry] {
        let lines = csv.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard lines.count > 1 else { throw ImportError.emptyCSV("entries") }

        // Skip header
        return try lines.dropFirst().enumerated().map { index, line in
            let cols = parseCSVLine(line)
            guard cols.count >= 15 else {
                throw ImportError.invalidRow("Entry row \(index + 2): expected 15 columns, got \(cols.count)")
            }

            let baseStr = cols[10].trimmingCharacters(in: .whitespaces)
            let bonusStr = cols[11].trimmingCharacters(in: .whitespaces)

            guard let baseAmount = Decimal(string: baseStr.isEmpty ? "0" : baseStr) else {
                throw ImportError.invalidRow("Entry row \(index + 2): invalid base_amount '\(baseStr)'")
            }
            guard let bonusAmount = Decimal(string: bonusStr.isEmpty ? "0" : bonusStr) else {
                throw ImportError.invalidRow("Entry row \(index + 2): invalid bonus_amount '\(bonusStr)'")
            }

            let skusStr = cols[5].trimmingCharacters(in: .whitespaces)
            let breakStr = cols[8].trimmingCharacters(in: .whitespaces)
            let hoursStr = cols[9].trimmingCharacters(in: .whitespaces)

            return ParsedEntry(
                date: cols[0].trimmingCharacters(in: .whitespaces),
                clientName: cols[1].trimmingCharacters(in: .whitespaces),
                billingType: cols[2].trimmingCharacters(in: .whitespaces),
                dayType: cols[3].trimmingCharacters(in: .whitespaces).isEmpty ? nil : cols[3].trimmingCharacters(in: .whitespaces),
                workflowType: cols[4].trimmingCharacters(in: .whitespaces).isEmpty ? nil : cols[4].trimmingCharacters(in: .whitespaces),
                skus: skusStr.isEmpty ? nil : Int(skusStr),
                startTime: cols[6].trimmingCharacters(in: .whitespaces).isEmpty ? nil : cols[6].trimmingCharacters(in: .whitespaces),
                finishTime: cols[7].trimmingCharacters(in: .whitespaces).isEmpty ? nil : cols[7].trimmingCharacters(in: .whitespaces),
                breakMinutes: breakStr.isEmpty ? nil : Int(breakStr),
                hoursWorked: hoursStr.isEmpty ? nil : Decimal(string: hoursStr),
                baseAmount: baseAmount,
                bonusAmount: bonusAmount,
                description: cols[12].trimmingCharacters(in: .whitespaces).isEmpty ? nil : cols[12].trimmingCharacters(in: .whitespaces),
                invoiceNumber: cols[13].trimmingCharacters(in: .whitespaces),
                invoiceStatus: cols[14].trimmingCharacters(in: .whitespaces)
            )
        }
    }

    private func parseInvoices(csv: String) throws -> [ParsedInvoice] {
        let lines = csv.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard lines.count > 1 else { throw ImportError.emptyCSV("invoices") }

        return try lines.dropFirst().enumerated().map { index, line in
            let cols = parseCSVLine(line)
            guard cols.count >= 7 else {
                throw ImportError.invalidRow("Invoice row \(index + 2): expected 7 columns, got \(cols.count)")
            }

            guard let subtotal = Decimal(string: cols[4].trimmingCharacters(in: .whitespaces)) else {
                throw ImportError.invalidRow("Invoice row \(index + 2): invalid subtotal '\(cols[4])'")
            }
            guard let superAmount = Decimal(string: cols[5].trimmingCharacters(in: .whitespaces)) else {
                throw ImportError.invalidRow("Invoice row \(index + 2): invalid super_amount '\(cols[5])'")
            }
            guard let total = Decimal(string: cols[6].trimmingCharacters(in: .whitespaces)) else {
                throw ImportError.invalidRow("Invoice row \(index + 2): invalid total '\(cols[6])'")
            }

            return ParsedInvoice(
                invoiceNumber: cols[0].trimmingCharacters(in: .whitespaces),
                clientName: cols[1].trimmingCharacters(in: .whitespaces),
                weekStarting: cols[2].trimmingCharacters(in: .whitespaces),
                status: cols[3].trimmingCharacters(in: .whitespaces),
                subtotal: subtotal,
                superAmount: superAmount,
                total: total
            )
        }
    }

    /// Simple CSV line parser that handles commas within quoted fields
    private func parseCSVLine(_ line: String) -> [String] {
        var fields: [String] = []
        var current = ""
        var inQuotes = false

        for char in line {
            if char == "\"" {
                inQuotes.toggle()
            } else if char == "," && !inQuotes {
                fields.append(current)
                current = ""
            } else {
                current.append(char)
            }
        }
        fields.append(current)
        return fields
    }

    // MARK: - Validation (Dry Run)

    func validate(data: ImportData) async throws -> ValidationResult {
        var result = ValidationResult()
        result.entriesCount = data.entries.count
        result.invoicesCount = data.invoices.count

        // Fetch clients from DB
        let clients: [Client] = try await supabase.fetch(from: "clients")
        let clientMap = Dictionary(uniqueKeysWithValues: clients.map { ($0.name, $0) })

        // Fetch existing invoices to check for duplicates
        let existingInvoices: [Invoice] = try await supabase.fetch(from: "invoices")
        let existingNumbers = Set(existingInvoices.map(\.invoiceNumber))

        // Build set of invoice numbers from import CSV
        let importInvoiceNumbers = Set(data.invoices.map(\.invoiceNumber))

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        // Validate invoices
        for inv in data.invoices {
            if clientMap[inv.clientName] == nil {
                result.errors.append("Invoice \(inv.invoiceNumber): unknown client '\(inv.clientName)'")
            }
            if existingNumbers.contains(inv.invoiceNumber) {
                result.errors.append("Invoice \(inv.invoiceNumber): already exists in database")
            }
            if dateFormatter.date(from: inv.weekStarting) == nil {
                result.errors.append("Invoice \(inv.invoiceNumber): invalid date '\(inv.weekStarting)'")
            }

            // Verify invoice totals match entry sums
            let invoiceEntries = data.entries.filter { $0.invoiceNumber == inv.invoiceNumber }
            let entrySubtotal = invoiceEntries.reduce(Decimal.zero) { $0 + $1.baseAmount + $1.bonusAmount }
            if entrySubtotal != inv.subtotal {
                result.warnings.append("Invoice \(inv.invoiceNumber): entry subtotal \(entrySubtotal) ≠ invoice subtotal \(inv.subtotal)")
            }
        }

        // Validate entries
        for (i, entry) in data.entries.enumerated() {
            let row = i + 2 // 1-indexed + header
            if clientMap[entry.clientName] == nil {
                result.errors.append("Entry row \(row): unknown client '\(entry.clientName)'")
            }
            if dateFormatter.date(from: entry.date) == nil {
                result.errors.append("Entry row \(row): invalid date '\(entry.date)'")
            }
            if !importInvoiceNumbers.contains(entry.invoiceNumber) {
                result.errors.append("Entry row \(row): invoice '\(entry.invoiceNumber)' not found in invoices CSV")
            }
            if entry.baseAmount <= 0 && entry.bonusAmount <= 0 {
                result.warnings.append("Entry row \(row): zero amount for \(entry.date)")
            }
        }

        // Build client summaries
        var clientEntries: [String: Int] = [:]
        var clientInvoices: [String: Set<String>] = [:]
        var clientTotals: [String: Decimal] = [:]

        for entry in data.entries {
            clientEntries[entry.clientName, default: 0] += 1
            clientInvoices[entry.clientName, default: []].insert(entry.invoiceNumber)
            clientTotals[entry.clientName, default: 0] += entry.baseAmount + entry.bonusAmount
        }

        result.clientSummaries = clientEntries.keys.sorted().map { name in
            ClientSummary(
                name: name,
                entryCount: clientEntries[name] ?? 0,
                invoiceCount: clientInvoices[name]?.count ?? 0,
                total: clientTotals[name] ?? 0
            )
        }

        return result
    }

    // MARK: - Execute Import

    struct ImportResult {
        let entriesInserted: Int
        let invoicesInserted: Int
        let entryIds: [UUID]
        let invoiceIds: [UUID]
    }

    func executeImport(data: ImportData) async throws -> ImportResult {
        let userId = try await supabase.currentUserId()

        // Fetch clients
        let clients: [Client] = try await supabase.fetch(from: "clients")
        let clientMap = Dictionary(uniqueKeysWithValues: clients.map { ($0.name, $0) })

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let now = Date()
        let createdAt = isoFormatter.string(from: now)

        let settings = UserSettings.load()

        // Phase 1: Insert invoices, build invoiceNumber → UUID map
        var invoiceIdMap: [String: UUID] = [:]

        for inv in data.invoices {
            guard let client = clientMap[inv.clientName] else { continue }

            let invoiceId = UUID()
            invoiceIdMap[inv.invoiceNumber] = invoiceId

            let issuedDate = inv.weekStarting
            let dueDate: String
            if let issued = dateFormatter.date(from: issuedDate) {
                let due = Calendar.current.date(byAdding: .day, value: settings.dueDateOffsetDays, to: issued) ?? issued
                dueDate = dateFormatter.string(from: due)
            } else {
                dueDate = issuedDate
            }

            // weekEnding = weekStarting + 6 days for weekly clients
            let weekEnding: String?
            if client.invoiceFrequency == .weekly, let startDate = dateFormatter.date(from: inv.weekStarting) {
                let endDate = Calendar.current.date(byAdding: .day, value: 6, to: startDate) ?? startDate
                weekEnding = dateFormatter.string(from: endDate)
            } else {
                weekEnding = nil
            }

            // Map status: "invoiced" → .issued
            let status: InvoiceStatus
            switch inv.status {
            case "paid": status = .paid
            case "invoiced": status = .issued
            default: status = .draft
            }

            let invoice = Invoice(
                id: invoiceId,
                userId: userId,
                invoiceNumber: inv.invoiceNumber,
                clientId: client.id,
                issuedDate: issuedDate,
                dueDate: dueDate,
                weekEnding: weekEnding,
                subtotal: inv.subtotal,
                superAmount: inv.superAmount,
                total: inv.total,
                status: status,
                notes: nil,
                createdAt: createdAt
            )

            try await supabase.insert(into: "invoices", value: invoice)
        }

        // Phase 2: Insert entries
        var entryIds: [UUID] = []
        var entriesInserted = 0

        for parsedEntry in data.entries {
            guard let client = clientMap[parsedEntry.clientName] else { continue }
            let invoiceId = invoiceIdMap[parsedEntry.invoiceNumber]

            // Compute super
            let superAmount: Decimal
            if client.paysSuper {
                superAmount = (parsedEntry.baseAmount + parsedEntry.bonusAmount) * client.superRate
            } else {
                superAmount = 0
            }
            let totalAmount = parsedEntry.baseAmount + parsedEntry.bonusAmount + superAmount

            // Parse billing type
            let billingType: BillingType
            switch parsedEntry.billingType {
            case "day_rate": billingType = .dayRate
            case "hourly": billingType = .hourly
            default: billingType = .manual
            }

            // Format times as HH:mm:ss for Supabase TIME columns
            let startTime = parsedEntry.startTime.map { formatTime($0) }
            let finishTime = parsedEntry.finishTime.map { formatTime($0) }

            let dayType: DayType?
            if let dt = parsedEntry.dayType {
                dayType = dt == "full" ? .full : .half
            } else {
                dayType = nil
            }

            let entryId = UUID()
            entryIds.append(entryId)
            let entry = Entry(
                id: entryId,
                userId: userId,
                clientId: client.id,
                date: parsedEntry.date,
                invoiceId: invoiceId,
                billingTypeSnapshot: billingType,
                dayType: dayType,
                workflowType: parsedEntry.workflowType,
                brand: nil,
                skus: parsedEntry.skus,
                role: nil,
                shootClient: nil,
                description: parsedEntry.description,
                startTime: startTime,
                finishTime: finishTime,
                breakMinutes: parsedEntry.breakMinutes,
                hoursWorked: parsedEntry.hoursWorked,
                baseAmount: parsedEntry.baseAmount,
                bonusAmount: parsedEntry.bonusAmount,
                superAmount: superAmount,
                totalAmount: totalAmount,
                createdAt: createdAt
            )

            try await supabase.insert(into: "entries", value: entry)
            entriesInserted += 1
        }

        return ImportResult(
            entriesInserted: entriesInserted,
            invoicesInserted: invoiceIdMap.count,
            entryIds: entryIds,
            invoiceIds: Array(invoiceIdMap.values)
        )
    }

    // MARK: - Rollback

    func rollbackImport(entryIds: [UUID], invoiceIds: [UUID]) async throws -> (entriesDeleted: Int, invoicesDeleted: Int) {
        // Delete entries first (they reference invoices via invoice_id)
        for id in entryIds {
            try await supabase.delete(from: "entries", id: id)
        }
        // Then delete invoices
        for id in invoiceIds {
            try await supabase.delete(from: "invoices", id: id)
        }
        return (entriesDeleted: entryIds.count, invoicesDeleted: invoiceIds.count)
    }

    /// Formats "HH:mm" or "H:mm" to "HH:mm:ss"
    private func formatTime(_ time: String) -> String {
        let parts = time.split(separator: ":")
        guard parts.count >= 2 else { return time }
        let hour = String(format: "%02d", Int(parts[0]) ?? 0)
        let minute = String(format: "%02d", Int(parts[1]) ?? 0)
        return "\(hour):\(minute):00"
    }
}

enum ImportError: LocalizedError {
    case emptyCSV(String)
    case invalidRow(String)
    case fileNotFound(String)

    var errorDescription: String? {
        switch self {
        case .emptyCSV(let name): "The \(name) CSV file is empty"
        case .invalidRow(let msg): msg
        case .fileNotFound(let path): "File not found: \(path)"
        }
    }
}
