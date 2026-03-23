import Foundation

enum BillingType: String, Codable, CaseIterable, Sendable {
    case dayRate = "day_rate"
    case hourly
    case manual
}

enum InvoiceFrequency: String, Codable, CaseIterable, Sendable {
    case weekly
    case perJob = "per_job"
}

struct Client: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var billingType: BillingType
    var rateFullDay: Decimal?
    var rateHalfDay: Decimal?
    var rateHourly: Decimal?
    var paysSuper: Bool
    var superRate: Decimal
    var invoiceFrequency: InvoiceFrequency
    var address: String
    var suburb: String
    var email: String
    var abn: String?
    var notes: String?
    var isActive: Bool
    var createdAt: String
    var entryLabel: String?
    var showRole: Bool
    var defaultStartTime: String?
    var defaultFinishTime: String?
    var rateHourlyPhotographer: Decimal?
    var rateHourlyOperator: Decimal?

    enum CodingKeys: String, CodingKey {
        case id, name, address, suburb, email, abn, notes
        case billingType = "billing_type"
        case rateFullDay = "rate_full_day"
        case rateHalfDay = "rate_half_day"
        case rateHourly = "rate_hourly"
        case paysSuper = "pays_super"
        case superRate = "super_rate"
        case invoiceFrequency = "invoice_frequency"
        case isActive = "is_active"
        case createdAt = "created_at"
        case entryLabel = "entry_label"
        case showRole = "show_role"
        case defaultStartTime = "default_start_time"
        case defaultFinishTime = "default_finish_time"
        case rateHourlyPhotographer = "rate_hourly_photographer"
        case rateHourlyOperator = "rate_hourly_operator"
    }
}
