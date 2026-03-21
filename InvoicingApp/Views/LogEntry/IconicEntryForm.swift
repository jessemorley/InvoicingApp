import SwiftUI

struct IconicEntryForm: View {
    @ObservedObject var vm: LogEntryViewModel
    let client: Client

    private let workflowTypes = ["Apparel", "Model Shot", "Batch A", "Batch B", "Batch C", "Batch D", "Flatlay", "Own Brand"]

    var body: some View {
        Picker("Day Type", selection: $vm.dayType) {
            ForEach(DayType.allCases, id: \.self) { type in
                Text(type.rawValue.capitalized).tag(type)
            }
        }
        .pickerStyle(.segmented)

        if vm.dayType == .full {
            // Only show workflow picker for clients with workflow rates (The ICONIC)
            if !vm.workflowRates.isEmpty {
                Picker("Workflow", selection: $vm.workflowType) {
                    ForEach(workflowTypes, id: \.self) { type in
                        Text(type).tag(type)
                    }
                }

                if vm.workflowType == "Own Brand" {
                    TextField("Brand", text: $vm.brand)
                }

                if vm.workflowType != "Own Brand" {
                    TextField("SKUs", text: $vm.skus)
                        #if os(macOS)
                        #endif
                }
            }
        }
    }
}
