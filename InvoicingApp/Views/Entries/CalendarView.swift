import SwiftUI

struct CalendarView: View {
    let entriesByDate: [Date: [Entry]]
    let clientMap: [UUID: Client]
    let invoiceMap: [UUID: Invoice]
    let onSelect: (Entry) -> Void

    @State private var currentMonth: Date = {
        let cal = Calendar.current
        let comps = cal.dateComponents([.year, .month], from: Date())
        return cal.date(from: comps) ?? Date()
    }()

    private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        VStack(spacing: 0) {
            // Month navigation
            HStack(spacing: 12) {
                Text(monthYearString)
                    .font(.title2.bold())

                Spacer()

                Button(action: previousMonth) {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.semibold))
                        .frame(width: 28, height: 28)
                        .background(.quaternary, in: Circle())
                }
                .buttonStyle(.plain)

                Button(action: goToToday) {
                    Text("Today")
                        .font(.body.weight(.medium))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 5)
                        .background(.quaternary, in: Capsule())
                }
                .buttonStyle(.plain)

                Button(action: nextMonth) {
                    Image(systemName: "chevron.right")
                        .font(.body.weight(.semibold))
                        .frame(width: 28, height: 28)
                        .background(.quaternary, in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding()

            // Day headers
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 0) {
                ForEach(dayNames, id: \.self) { day in
                    Text(day)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal)

            // Day cells grid — always 6 rows so the layout is stable
            let days = sixWeekGrid
            GeometryReader { geo in
                let rowHeight = geo.size.height / 6
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                    ForEach(Array(days.enumerated()), id: \.offset) { _, date in
                        if let date {
                            CalendarDayCell(
                                date: date,
                                entries: entriesByDate[Calendar.current.startOfDay(for: date)] ?? [],
                                clientMap: clientMap,
                                invoiceMap: invoiceMap,
                                onSelect: onSelect
                            )
                            .frame(height: rowHeight)
                        } else {
                            Color.clear
                                .frame(height: rowHeight)
                                .border(Color(nsColor: .separatorColor), width: 0.5)
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    /// Returns a 42-element array (6 weeks) of optional Dates for the grid.
    /// `nil` entries represent blank cells outside the current month.
    private var sixWeekGrid: [Date?] {
        let cal = Calendar.current
        let range = cal.range(of: .day, in: .month, for: currentMonth)!
        let firstDay = currentMonth
        // weekday: 1=Sun, 2=Mon... convert to Mon=0
        let firstWeekday = cal.component(.weekday, from: firstDay)
        let leadingBlanks = (firstWeekday + 5) % 7 // days before Monday

        var days: [Date?] = Array(repeating: nil, count: leadingBlanks)
        for day in range {
            if let date = cal.date(bySetting: .day, value: day, of: currentMonth) {
                days.append(date)
            }
        }
        // Pad to 42 (6 full weeks)
        while days.count < 42 {
            days.append(nil)
        }
        return days
    }

    private var monthYearString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: currentMonth)
    }

    private func goToToday() {
        let cal = Calendar.current
        let comps = cal.dateComponents([.year, .month], from: Date())
        currentMonth = cal.date(from: comps) ?? Date()
    }

    private func previousMonth() {
        currentMonth = Calendar.current.date(byAdding: .month, value: -1, to: currentMonth) ?? currentMonth
    }

    private func nextMonth() {
        currentMonth = Calendar.current.date(byAdding: .month, value: 1, to: currentMonth) ?? currentMonth
    }
}
