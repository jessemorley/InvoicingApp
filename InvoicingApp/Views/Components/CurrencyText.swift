import SwiftUI

struct CurrencyText: View {
    let amount: Decimal

    var body: some View {
        Text(formatted)
    }

    private var formatted: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "AUD"
        formatter.currencySymbol = "$"
        return formatter.string(from: amount as NSDecimalNumber) ?? "$0.00"
    }
}
