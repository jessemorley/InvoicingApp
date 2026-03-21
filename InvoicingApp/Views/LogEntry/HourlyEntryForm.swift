import SwiftUI

struct HourlyEntryForm: View {
    @ObservedObject var vm: LogEntryViewModel
    let client: Client

    var body: some View {
        // Images That Sell specific fields
        if client.name.contains("Images That Sell") {
            TextField("Shoot Client", text: $vm.shootClient)

            Picker("Role", selection: $vm.role) {
                Text("Photographer").tag("Photographer")
                Text("Operator").tag("Operator")
            }
            .pickerStyle(.segmented)
        }

        // JD Sports specific fields
        if client.name.contains("JD Sports") {
            TextField("Description", text: $vm.entryDescription)
        }

        // Common hourly fields
        DatePicker("Start Time", selection: $vm.startTime, displayedComponents: .hourAndMinute)
        DatePicker("Finish Time", selection: $vm.finishTime, displayedComponents: .hourAndMinute)

        HStack {
            Text("Break")
            TextField("0", value: $vm.breakMinutes, format: .number)
                .frame(width: 60)
                .textFieldStyle(.roundedBorder)
            Text("min")
                .foregroundStyle(.secondary)
        }
    }
}
