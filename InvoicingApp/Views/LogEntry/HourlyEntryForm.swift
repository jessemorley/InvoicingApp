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
            Spacer()
            TextField(
                "",
                text: Binding(
                    get: { vm.breakMinutes == 0 ? "" : "\(vm.breakMinutes)" },
                    set: { vm.breakMinutes = Int($0) ?? 0 }
                )
            )
            .frame(width: 50)
            .textFieldStyle(.roundedBorder)
            .multilineTextAlignment(.trailing)
            Text("min")
                .foregroundStyle(.secondary)
        }
    }
}
