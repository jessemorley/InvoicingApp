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
    }
}
