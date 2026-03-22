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

    private var isWeekend: Bool {
        Calendar.current.isDateInWeekend(date)
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
                            if let inv = invoiceInfo(for: entry) {
                                Text(inv.number)
                                    .font(.system(size: 7, weight: .medium))
                                    .padding(.horizontal, 3)
                                    .padding(.vertical, 1)
                                    .background(inv.color.opacity(0.15))
                                    .foregroundStyle(inv.color)
                                    .clipShape(Capsule())
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
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(4)
        .background(isToday ? Color.blue.opacity(0.05) : isWeekend ? Color.primary.opacity(0.03) : Color.clear)
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

    private func invoiceInfo(for entry: Entry) -> (number: String, color: Color)? {
        guard let invoiceId = entry.invoiceId,
              let invoice = invoiceMap[invoiceId] else { return nil }
        let color: Color = switch invoice.status {
        case .draft: .gray
        case .issued: .orange
        case .paid: .green
        }
        return (invoice.invoiceNumber, color)
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
