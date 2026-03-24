import SwiftUI

struct GenerateInvoicesSheetView: View {
    @StateObject private var vm = GenerateInvoicesViewModel()
    @Environment(\.dismiss) private var dismiss
    var onGenerated: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Title bar
            HStack {
                Button("Cancel") { dismiss() }
                Spacer()
                Text("Generate Invoices")
                    .font(.headline)
                Spacer()
                // Invisible balance for centering
                Button("Cancel") {}.hidden()
            }
            .padding()

            Divider()

            if let error = vm.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .padding()
            }

            if vm.isLoading {
                ProgressView("Scanning entries…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if vm.groups.isEmpty {
                ContentUnavailableView(
                    "No Uninvoiced Entries",
                    systemImage: "doc.text",
                    description: Text("All entries have been invoiced.")
                )
            } else {
                invoiceGroupsList
            }
        }
        .task { await vm.scan() }
    }

    private var invoiceGroupsList: some View {
        VStack(spacing: 0) {
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
                                Text("\(group.entries.count) \(group.entries.count == 1 ? "entry" : "entries") · \(group.dateRange)")
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
                    Text("\(vm.selectedGroupCount) \(vm.selectedGroupCount == 1 ? "invoice" : "invoices") · \(vm.selectedEntryCount) \(vm.selectedEntryCount == 1 ? "entry" : "entries")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                CurrencyText(amount: vm.selectedTotal)
                    .font(.title3.monospacedDigit().bold())

                Button(action: {
                    Task {
                        await vm.generate()
                        if vm.showSuccess {
                            onGenerated()
                        }
                    }
                }) {
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
