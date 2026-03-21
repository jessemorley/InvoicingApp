import SwiftUI

struct AmountPreviewView: View {
    let result: CalculationResult

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if result.bonusAmount > 0 {
                HStack {
                    Text("Base")
                    Spacer()
                    Text(formatCurrency(result.baseAmount))
                }
                HStack {
                    Text("Bonus")
                    Spacer()
                    Text(formatCurrency(result.bonusAmount))
                }
            } else {
                HStack {
                    Text("Subtotal")
                    Spacer()
                    Text(formatCurrency(result.baseAmount))
                }
            }

            if result.superAmount > 0 {
                HStack {
                    Text("Super")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(formatCurrency(result.superAmount))
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            HStack {
                Text("Total")
                    .fontWeight(.semibold)
                Spacer()
                Text(formatCurrency(result.totalAmount))
                    .fontWeight(.semibold)
            }

            if let hours = result.hoursWorked {
                Text("\(NSDecimalNumber(decimal: hours))h worked")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.fill.quaternary)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "AUD"
        formatter.currencySymbol = "$"
        return formatter.string(from: value as NSDecimalNumber) ?? "$0.00"
    }
}
