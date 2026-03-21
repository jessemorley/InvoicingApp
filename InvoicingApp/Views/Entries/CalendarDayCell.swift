import SwiftUI

struct CalendarDayCell: View {
    let date: Date
    let entries: [Entry]
    let clientMap: [UUID: Client]
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
                        Text(clientMap[entry.clientId]?.name ?? "")
                            .font(.system(size: 9, weight: .semibold))
                            .lineLimit(1)
                        if let desc = entryDescription(entry) {
                            Text(desc)
                                .font(.system(size: 8))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        CurrencyText(amount: entry.totalAmount)
                            .font(.system(size: 9))
                    }
                    .padding(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(clientColor(for: entry).opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(minHeight: 80)
        .padding(4)
        .background(isToday ? Color.blue.opacity(0.05) : Color.clear)
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
