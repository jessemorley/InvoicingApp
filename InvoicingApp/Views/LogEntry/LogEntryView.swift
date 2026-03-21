import SwiftUI

struct LogEntryView: View {
    @StateObject private var vm = LogEntryViewModel()

    var body: some View {
        Form {
            Section("Client") {
                ClientPickerView(
                    clients: vm.clients,
                    selectedClient: $vm.selectedClient
                )
                .onChange(of: vm.selectedClient?.id) { _, _ in
                    if let client = vm.selectedClient {
                        vm.onClientSelected(client)
                    }
                }
            }

            if let client = vm.selectedClient {
                Section("Entry Details") {
                    DatePicker("Date", selection: $vm.date, displayedComponents: .date)

                    switch client.billingType {
                    case .dayRate:
                        IconicEntryForm(vm: vm, client: client)
                    case .hourly:
                        HourlyEntryForm(vm: vm, client: client)
                    case .manual:
                        ManualEntryForm(vm: vm)
                    }
                }

                if let preview = vm.calculationPreview {
                    Section("Amount") {
                        AmountPreviewView(result: preview)
                    }
                }

                Section {
                    Button(action: { Task { await vm.saveEntry() } }) {
                        if vm.isSaving {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Save Entry")
                        }
                    }
                    .disabled(vm.isSaving)
                    .keyboardShortcut(.return, modifiers: .command)
                }
            }

            if vm.showSaveSuccess {
                Section {
                    Label("Entry saved!", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            if let error = vm.errorMessage {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Log Entry")
        .task { await vm.loadClients() }
    }
}
