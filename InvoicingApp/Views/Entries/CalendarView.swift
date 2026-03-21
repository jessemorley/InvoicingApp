import SwiftUI

struct CalendarView: View {
    let entriesByDate: [Date: [Entry]]
    let clientMap: [UUID: Client]
    let showAmounts: Bool
    let onSelect: (Entry) -> Void

    @State private var currentWeekStart: Date = {
        let cal = Calendar.current
        let today = Date()
        return cal.dateInterval(of: .weekOfYear, for: today)?.start ?? today
    }()

    private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        VStack(spacing: 0) {
            // Week navigation
            HStack {
                Button(action: previousWeek) {
                    Image(systemName: "chevron.left")
                }
                Spacer()
                Text(weekRangeString)
                    .font(.headline)
                Spacer()
                Button(action: nextWeek) {
                    Image(systemName: "chevron.right")
                }
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

            // Day cells
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 1) {
                ForEach(0..<7, id: \.self) { offset in
                    let date = Calendar.current.date(byAdding: .day, value: offset, to: weekStartMonday) ?? currentWeekStart
                    CalendarDayCell(
                        date: date,
                        entries: entriesByDate[Calendar.current.startOfDay(for: date)] ?? [],
                        clientMap: clientMap,
                        showAmounts: showAmounts,
                        onSelect: onSelect
                    )
                }
            }
            .padding(.horizontal)

            Spacer()
        }
    }

    private var weekStartMonday: Date {
        let cal = Calendar.current
        var start = currentWeekStart
        // Adjust to Monday if needed
        let weekday = cal.component(.weekday, from: start)
        let daysFromMonday = (weekday + 5) % 7
        start = cal.date(byAdding: .day, value: -daysFromMonday, to: start) ?? start
        return start
    }

    private var weekRangeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        let start = weekStartMonday
        let end = Calendar.current.date(byAdding: .day, value: 6, to: start) ?? start
        return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
    }

    private func previousWeek() {
        currentWeekStart = Calendar.current.date(byAdding: .weekOfYear, value: -1, to: currentWeekStart) ?? currentWeekStart
    }

    private func nextWeek() {
        currentWeekStart = Calendar.current.date(byAdding: .weekOfYear, value: 1, to: currentWeekStart) ?? currentWeekStart
    }
}
