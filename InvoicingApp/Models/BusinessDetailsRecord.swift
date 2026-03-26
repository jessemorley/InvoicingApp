import Foundation

struct BusinessDetailsRecord: Codable, Sendable, Equatable {
    let userId: UUID
    var name: String
    var businessName: String
    var abn: String
    var address: String
    var bsb: String
    var accountNumber: String
    var superFund: String
    var superMemberNumber: String
    var superFundAbn: String
    var superUsi: String

    enum CodingKeys: String, CodingKey {
        case userId           = "user_id"
        case name
        case businessName     = "business_name"
        case abn
        case address
        case bsb
        case accountNumber    = "account_number"
        case superFund        = "super_fund"
        case superMemberNumber = "super_member_number"
        case superFundAbn     = "super_fund_abn"
        case superUsi         = "super_usi"
    }
}
