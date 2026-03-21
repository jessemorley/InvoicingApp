import SwiftUI

struct DateRangePickerView: View {
    @Binding var startDate: Date
    @Binding var endDate: Date

    var body: some View {
        HStack {
            DatePicker("From", selection: $startDate, displayedComponents: .date)
                .labelsHidden()
            Text("to")
                .foregroundStyle(.secondary)
            DatePicker("To", selection: $endDate, displayedComponents: .date)
                .labelsHidden()
        }
    }
}
