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
        financialYearStartMonth: 7
    )

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
