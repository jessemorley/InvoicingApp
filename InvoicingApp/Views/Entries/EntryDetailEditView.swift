import SwiftUI

struct EntryDetailEditView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = LogEntryViewModel()

    let entry: Entry
    let client: Client?
    var onSave: ((Entry) -> Void)?
    var onDelete: ((Entry) -> Void)?
    @State private var showDeleteConfirmation = false

    init(entry: Entry, client: Client?, onSave: ((Entry) -> Void)? = nil, onDelete: ((Entry) -> Void)? = nil) {
        self.entry = entry
        self.client = client
        self.onSave = onSave
        self.onDelete = onDelete
    }

    var body: some View {
        Form {
            if let client {
                Section("Entry Details") {
                    LabeledContent("Client", value: client.name)
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

                if entry.invoiceId != nil {
                    Section {
                        Label("This entry has been invoiced", systemImage: "doc.text.fill")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button(action: {
                        Task {
                            await vm.saveEntry()
                            dismiss()
                        }
                    }) {
                        if vm.isSaving {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Save")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(vm.isSaving)

                    if onDelete != nil {
                        Button("Delete Entry", role: .destructive) {
                            showDeleteConfirmation = true
                        }
                    }
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
        .navigationTitle("Edit Entry")
        .confirmationDialog(
            "Delete this entry?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete?(entry)
                dismiss()
            }
        } message: {
            Text("This action cannot be undone.")
        }
        .task {
            await vm.loadClients()
            if let client {
                vm.populateFromEntry(entry, client: client)
                vm.onEditSave = onSave
            }
        }
    }
}
