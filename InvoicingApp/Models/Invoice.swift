import Foundation

enum InvoiceStatus: String, Codable, CaseIterable, Sendable {
    case draft
    case issued
    case paid
}

struct Invoice: Codable, Identifiable, Sendable {
    let id: UUID
    var invoiceNumber: String
    var clientId: UUID
    var issuedDate: String
    var dueDate: String
    var weekEnding: String?
    var subtotal: Decimal
    var superAmount: Decimal
    var total: Decimal
    var status: InvoiceStatus
    var notes: String?
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, subtotal, total, status, notes
        case invoiceNumber = "invoice_number"
        case clientId = "client_id"
        case issuedDate = "issued_date"
        case dueDate = "due_date"
        case weekEnding = "week_ending"
        case superAmount = "super_amount"
        case createdAt = "created_at"
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    var issuedDateValue: Date {
        Self.dateFormatter.date(from: issuedDate) ?? Date()
    }

    var dueDateValue: Date {
        Self.dateFormatter.date(from: dueDate) ?? Date()
    }

    static func dateString(from date: Date) -> String {
        dateFormatter.string(from: date)
    }

    static func isoString(from date: Date) -> String {
        isoFormatter.string(from: date)
    }
}
