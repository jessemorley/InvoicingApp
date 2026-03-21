import Foundation

struct ClientWorkflowRate: Codable, Identifiable, Sendable {
    let id: UUID
    var clientId: UUID
    var workflow: String
    var kpi: Int
    var incentiveRatePerSku: Decimal
    var upperLimitSkus: Int
    var maxBonus: Decimal

    enum CodingKeys: String, CodingKey {
        case id, workflow, kpi
        case clientId = "client_id"
        case incentiveRatePerSku = "incentive_rate_per_sku"
        case upperLimitSkus = "upper_limit_skus"
        case maxBonus = "max_bonus"
    }
}
