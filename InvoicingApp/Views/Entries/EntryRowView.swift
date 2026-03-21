import SwiftUI

struct EntryRowView: View {
    let entry: Entry
    let client: Client?
    let showAmount: Bool

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d"
        return f
    }()

    var body: some View {
        HStack {
            // Invoiced indicator
            Image(systemName: entry.invoiceId != nil ? "circle.fill" : "circle")
                .font(.caption2)
                .foregroundStyle(entry.invoiceId != nil ? .green : .secondary)

            VStack(alignment: .leading, spacing: 2) {
                Text(Self.dateFormatter.string(from: entry.dateValue))
                    .font(.headline)

                Text(entrySummary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if let clientName = client?.name {
                Text(clientName)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(clientColor.opacity(0.15))
                    .foregroundStyle(clientColor)
                    .clipShape(Capsule())
            }

            if showAmount {
                CurrencyText(amount: entry.totalAmount)
                    .font(.body.monospacedDigit())
                    .frame(width: 100, alignment: .trailing)
            }
        }
        .padding(.vertical, 4)
    }

    private var entrySummary: String {
        switch entry.billingTypeSnapshot {
        case .dayRate:
            let dayStr = entry.dayType?.rawValue.capitalized ?? ""
            if let workflow = entry.workflowType {
                return "\(dayStr) day — \(workflow)"
            }
            return "\(dayStr) day"
        case .hourly:
            let hours = entry.hoursWorked.map { "\(NSDecimalNumber(decimal: $0))h" } ?? ""
            if let shootClient = entry.shootClient {
                return "\(shootClient) (\(entry.role ?? "")) \(hours)"
            }
            return "\(entry.description ?? "") \(hours)"
        case .manual:
            return entry.description ?? ""
        }
    }

    private var clientColor: Color {
        guard let name = client?.name else { return .gray }
        switch name {
        case let n where n.contains("ICONIC"): return .purple
        case let n where n.contains("Images"): return .blue
        case let n where n.contains("JD"): return .orange
        default: return .gray
        }
    }
}
