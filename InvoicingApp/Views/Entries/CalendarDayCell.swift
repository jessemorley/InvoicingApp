import SwiftUI

struct CalendarDayCell: View {
    let date: Date
    let entries: [Entry]
    let clientMap: [UUID: Client]
    let invoiceMap: [UUID: Invoice]
    let onSelect: (Entry) -> Void

    private var isToday: Bool {
        Calendar.current.isDateInToday(date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(Calendar.current.component(.day, from: date))")
                .font(.caption)
                .fontWeight(isToday ? .bold : .regular)
                .foregroundStyle(isToday ? .blue : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)

            ForEach(entries) { entry in
                Button(action: { onSelect(entry) }) {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 2) {
                            Text(clientMap[entry.clientId]?.name ?? "")
                                .font(.system(size: 10, weight: .semibold))
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if let status = invoiceStatus(for: entry) {
                                Image(systemName: status.icon)
                                    .font(.system(size: 8))
                                    .foregroundStyle(status.color)
                            }
                        }
                        if let desc = entryDescription(entry) {
                            Text(desc)
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        CurrencyText(amount: entry.totalAmount)
                            .font(.system(size: 10))
                    }
                    .padding(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(clientColor(for: entry).opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(4)
        .background(isToday ? Color.blue.opacity(0.05) : Color.clear)
        .border(Color(nsColor: .separatorColor), width: 0.5)
    }

    private func entryDescription(_ entry: Entry) -> String? {
        switch entry.billingTypeSnapshot {
        case .dayRate:
            if let workflow = entry.workflowType {
                return workflow == "Own Brand" ? entry.brand ?? "Own Brand" : workflow
            }
            return entry.dayType?.rawValue.capitalized
        case .hourly:
            if let shootClient = entry.shootClient, !shootClient.isEmpty {
                return shootClient
            }
            return entry.description
        case .manual:
            return entry.description
        }
    }

    private func invoiceStatus(for entry: Entry) -> (icon: String, color: Color)? {
        guard let invoiceId = entry.invoiceId,
              let invoice = invoiceMap[invoiceId] else { return nil }
        switch invoice.status {
        case .draft, .issued:
            return ("doc.text.fill", .orange)
        case .paid:
            return ("checkmark.circle.fill", .green)
        }
    }

    private func clientColor(for entry: Entry) -> Color {
        guard let name = clientMap[entry.clientId]?.name else { return .gray }
        switch name {
        case let n where n.contains("ICONIC"): return .purple
        case let n where n.contains("Images"): return .blue
        case let n where n.contains("JD"): return .orange
        default: return .gray
        }
    }
}
