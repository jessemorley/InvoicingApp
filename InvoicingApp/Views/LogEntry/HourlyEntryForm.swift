import SwiftUI

struct HourlyEntryForm: View {
    @ObservedObject var vm: LogEntryViewModel
    let client: Client

    var body: some View {
        if let label = client.entryLabel {
            TextField(label, text: $vm.entryDescription)
        }

        if client.showRole {
            Picker("Role", selection: $vm.role) {
                Text("Photographer").tag("Photographer")
                Text("Operator").tag("Operator")
            }
            .pickerStyle(.segmented)
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
