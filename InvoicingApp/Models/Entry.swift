import Foundation

enum DayType: String, Codable, CaseIterable, Sendable {
    case full
    case half
}

struct Entry: Codable, Identifiable, Sendable {
    let id: UUID
    var clientId: UUID
    var date: String // "2026-03-21" — Supabase DATE column
    var invoiceId: UUID?
    var billingTypeSnapshot: BillingType
    var dayType: DayType?
    var workflowType: String?
    var brand: String?
    var skus: Int?
    var role: String?
    var shootClient: String?
    var description: String?
    var startTime: String?
    var finishTime: String?
    var breakMinutes: Int?
    var hoursWorked: Decimal?
    var baseAmount: Decimal
    var bonusAmount: Decimal
    var superAmount: Decimal
    var totalAmount: Decimal
    var createdAt: String // Supabase TIMESTAMPTZ

    enum CodingKeys: String, CodingKey {
        case id, date, skus, role, description, brand
        case clientId = "client_id"
        case invoiceId = "invoice_id"
        case billingTypeSnapshot = "billing_type_snapshot"
        case dayType = "day_type"
        case workflowType = "workflow_type"
        case shootClient = "shoot_client"
        case startTime = "start_time"
        case finishTime = "finish_time"
        case breakMinutes = "break_minutes"
        case hoursWorked = "hours_worked"
        case baseAmount = "base_amount"
        case bonusAmount = "bonus_amount"
        case superAmount = "super_amount"
        case totalAmount = "total_amount"
        case createdAt = "created_at"
    }

    // Parsed date for display and sorting
    var dateValue: Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: date) ?? Date()
    }
}
