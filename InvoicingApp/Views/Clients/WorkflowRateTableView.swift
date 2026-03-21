import SwiftUI

struct WorkflowRateTableView: View {
    @ObservedObject var vm: ClientManagementViewModel
    let clientId: UUID

    @State private var editingRate: ClientWorkflowRate?
    @State private var showingAdd = false

    var rates: [ClientWorkflowRate] {
        vm.workflowRates[clientId] ?? []
    }

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text("Workflow Rates")
                    .font(.headline)
                Spacer()
                Button(action: { showingAdd = true }) {
                    Label("Add", systemImage: "plus")
                }
            }

            Table(rates) {
                TableColumn("Workflow", value: \.workflow)
                TableColumn("KPI") { rate in
                    Text("\(rate.kpi)")
                }
                TableColumn("Rate/SKU") { rate in
                    Text("$\(NSDecimalNumber(decimal: rate.incentiveRatePerSku))")
                }
                TableColumn("Upper Limit") { rate in
                    Text("\(rate.upperLimitSkus)")
                }
                TableColumn("Max Bonus") { rate in
                    Text("$\(NSDecimalNumber(decimal: rate.maxBonus))")
                }
            }
            .frame(minHeight: 200)
        }
        .task { await vm.loadWorkflowRates(for: clientId) }
        .sheet(isPresented: $showingAdd) {
            WorkflowRateEditSheet(clientId: clientId) { rate in
                Task { await vm.saveWorkflowRate(rate, isNew: true) }
            }
        }
    }
}

struct WorkflowRateEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let clientId: UUID
    let onSave: (ClientWorkflowRate) -> Void

    @State private var workflow = ""
    @State private var kpi = ""
    @State private var incentiveRate = ""
    @State private var upperLimit = ""
    @State private var maxBonus = "40.00"

    var body: some View {
        Form {
            TextField("Workflow Name", text: $workflow)
            TextField("KPI (SKUs)", text: $kpi)
            TextField("Incentive Rate per SKU ($)", text: $incentiveRate)
            TextField("Upper Limit (SKUs)", text: $upperLimit)
            TextField("Max Bonus ($)", text: $maxBonus)

            Button("Save") {
                let rate = ClientWorkflowRate(
                    id: UUID(),
                    clientId: clientId,
                    workflow: workflow,
                    kpi: Int(kpi) ?? 0,
                    incentiveRatePerSku: Decimal(string: incentiveRate) ?? 0,
                    upperLimitSkus: Int(upperLimit) ?? 0,
                    maxBonus: Decimal(string: maxBonus) ?? 40
                )
                onSave(rate)
                dismiss()
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 400, minHeight: 300)
    }
}
