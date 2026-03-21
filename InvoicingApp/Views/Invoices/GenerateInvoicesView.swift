import SwiftUI

struct GenerateInvoicesView: View {
    @StateObject private var vm = GenerateInvoicesViewModel()

    var body: some View {
        VStack {
            if let error = vm.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .padding()
            }

            if vm.isLoading {
                ProgressView("Scanning entries…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if vm.groups.isEmpty && !vm.showSuccess {
                ContentUnavailableView(
                    "No Uninvoiced Entries",
                    systemImage: "doc.text",
                    description: Text("All entries have been invoiced.")
                )
            } else if vm.showSuccess {
                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.green)
                    Text("\(vm.generatedInvoices.count) invoice(s) generated")
                        .font(.title2)
                    ForEach(vm.generatedInvoices) { invoice in
                        Text(invoice.invoiceNumber)
                            .font(.headline)
                    }
                    Button("Done") {
                        vm.showSuccess = false
                        Task { await vm.scan() }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                invoiceGroupsList
            }
        }
        .navigationTitle("Generate Invoices")
        .task { await vm.scan() }
    }

    private var invoiceGroupsList: some View {
        VStack {
            List {
                ForEach(vm.groups) { group in
                    HStack {
                        Toggle(isOn: Binding(
                            get: { group.isSelected },
                            set: { _ in vm.toggleGroup(group) }
                        )) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(group.client.name)
                                    .font(.headline)
                                Text("\(group.entries.count) entries · \(group.dateRange)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer()

                        CurrencyText(amount: group.total)
                            .font(.body.monospacedDigit())
                    }
                }
            }

            Divider()

            HStack {
                VStack(alignment: .leading) {
                    Text("\(vm.selectedGroupCount) invoices · \(vm.selectedEntryCount) entries")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                CurrencyText(amount: vm.selectedTotal)
                    .font(.title3.monospacedDigit().bold())

                Button(action: { Task { await vm.generate() } }) {
                    if vm.isGenerating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Generate")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.isGenerating || vm.selectedGroupCount == 0)
            }
            .padding()
        }
    }
}
