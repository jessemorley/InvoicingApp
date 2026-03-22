import Foundation

struct UserSettings: Codable, Sendable {
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
    var dueDateOffsetDays: Int
    var financialYearStartMonth: Int
    var markIssuedOnExport: Bool = true
    var invoicePrefix: String = "JM"

    static let `default` = UserSettings(
        name: "Jesse Morley",
        businessName: "Jesse Morley Photography",
        abn: "62 622 680 864",
        address: "1 Scouller Street, Marrickville NSW 2204",
        bsb: "313140",
        accountNumber: "12239852",
        superFund: "Smart Future Trust",
        superMemberNumber: "192726",
        superFundAbn: "68964712340",
        superUsi: "68964712340019",
        dueDateOffsetDays: 30,
        financialYearStartMonth: 7,
        markIssuedOnExport: true,
        invoicePrefix: "JM"
    )

    init(
        name: String, businessName: String, abn: String, address: String,
        bsb: String, accountNumber: String,
        superFund: String, superMemberNumber: String, superFundAbn: String, superUsi: String,
        dueDateOffsetDays: Int, financialYearStartMonth: Int,
        markIssuedOnExport: Bool = true, invoicePrefix: String = "JM"
    ) {
        self.name = name; self.businessName = businessName; self.abn = abn; self.address = address
        self.bsb = bsb; self.accountNumber = accountNumber
        self.superFund = superFund; self.superMemberNumber = superMemberNumber
        self.superFundAbn = superFundAbn; self.superUsi = superUsi
        self.dueDateOffsetDays = dueDateOffsetDays; self.financialYearStartMonth = financialYearStartMonth
        self.markIssuedOnExport = markIssuedOnExport; self.invoicePrefix = invoicePrefix
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        businessName = try container.decode(String.self, forKey: .businessName)
        abn = try container.decode(String.self, forKey: .abn)
        address = try container.decode(String.self, forKey: .address)
        bsb = try container.decode(String.self, forKey: .bsb)
        accountNumber = try container.decode(String.self, forKey: .accountNumber)
        superFund = try container.decode(String.self, forKey: .superFund)
        superMemberNumber = try container.decode(String.self, forKey: .superMemberNumber)
        superFundAbn = try container.decode(String.self, forKey: .superFundAbn)
        superUsi = try container.decode(String.self, forKey: .superUsi)
        dueDateOffsetDays = try container.decode(Int.self, forKey: .dueDateOffsetDays)
        financialYearStartMonth = try container.decode(Int.self, forKey: .financialYearStartMonth)
        markIssuedOnExport = try container.decodeIfPresent(Bool.self, forKey: .markIssuedOnExport) ?? true
        invoicePrefix = try container.decodeIfPresent(String.self, forKey: .invoicePrefix) ?? "JM"
    }

    private static let storageKey = "userSettings"

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    static func load() -> UserSettings {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let settings = try? JSONDecoder().decode(UserSettings.self, from: data) else {
            return .default
        }
        return settings
    }
}
