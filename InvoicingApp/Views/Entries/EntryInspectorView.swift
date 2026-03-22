import SwiftUI

struct EntryInspectorView: View {
    let entry: Entry
    let client: Client?
    var onSave: ((Entry) -> Void)?
    var onDelete: ((Entry) -> Void)?

    @StateObject private var vm = LogEntryViewModel()
    @State private var showDeleteConfirmation = false

    private var isEditable: Bool { entry.invoiceId == nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    Text(entry.dateValue, format: .dateTime.weekday(.wide).day().month(.wide))
                        .font(.title3.bold())
                    Spacer()
                    if entry.invoiceId != nil {
                        Label("Invoiced", systemImage: "doc.text.fill")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.orange.opacity(0.15))
                            .foregroundStyle(.orange)
                            .clipShape(Capsule())
                    }
                }

                if let client {
                    Text(client.name)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }

                Divider()

                if isEditable, let client {
                    editableContent(client: client)
                } else {
                    readOnlyContent()
                }
            }
            .padding()
        }
        .task {
            await vm.loadClients()
            if let client {
                vm.populateFromEntry(entry, client: client)
                vm.onEditSave = onSave
            }
        }
    }

    @ViewBuilder
    private func editableContent(client: Client) -> some View {
        // Date
        DatePicker("Date", selection: $vm.date, displayedComponents: .date)

        // Billing-type-specific fields
        switch client.billingType {
        case .dayRate:
            IconicEntryForm(vm: vm, client: client)
        case .hourly:
            HourlyEntryForm(vm: vm, client: client)
        case .manual:
            ManualEntryForm(vm: vm)
        }

        // Amount preview
        if let preview = vm.calculationPreview {
            Divider()
            AmountPreviewView(result: preview)
        }

        Divider()

        // Actions
        HStack(spacing: 8) {
            Button(action: {
                Task { await vm.saveEntry() }
            }) {
                if vm.isSaving {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text("Save")
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(vm.isSaving)

            if onDelete != nil {
                Button("Delete", role: .destructive) {
                    showDeleteConfirmation = true
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }

        if vm.showSaveSuccess {
            Label("Saved!", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.caption)
        }

        if let error = vm.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .font(.caption)
        }

        // Delete confirmation
        EmptyView()
            .confirmationDialog(
                "Delete this entry?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    onDelete?(entry)
                }
            } message: {
                Text("This action cannot be undone.")
            }
    }

    @ViewBuilder
    private func readOnlyContent() -> some View {
        // Billing type
        LabeledContent("Type") {
            Text(entry.billingTypeSnapshot.rawValue.capitalized)
        }

        // Type-specific details
        switch entry.billingTypeSnapshot {
        case .dayRate:
            if let dayType = entry.dayType {
                LabeledContent("Day Type") {
                    Text(dayType.rawValue.capitalized)
                }
            }
            if let workflow = entry.workflowType {
                LabeledContent("Workflow") {
                    Text(workflow)
                }
            }
            if let brand = entry.brand, !brand.isEmpty {
                LabeledContent("Brand") {
                    Text(brand)
                }
            }
            if let skus = entry.skus, skus > 0 {
                LabeledContent("SKUs") {
                    Text("\(skus)")
                }
            }
        case .hourly:
            if let shootClient = entry.shootClient, !shootClient.isEmpty {
                LabeledContent("Shoot Client") {
                    Text(shootClient)
                }
            }
            if let role = entry.role, !role.isEmpty {
                LabeledContent("Role") {
                    Text(role)
                }
            }
            if let hours = entry.hoursWorked {
                LabeledContent("Hours") {
                    Text("\(NSDecimalNumber(decimal: hours))h")
                }
            }
        case .manual:
            if let desc = entry.description, !desc.isEmpty {
                LabeledContent("Description") {
                    Text(desc)
                }
            }
        }

        Divider()

        // Amounts
        LabeledContent("Base") {
            CurrencyText(amount: entry.baseAmount)
                .font(.body.monospacedDigit())
        }
        if entry.bonusAmount > 0 {
            LabeledContent("Bonus") {
                CurrencyText(amount: entry.bonusAmount)
                    .font(.body.monospacedDigit())
            }
        }
        if entry.superAmount > 0 {
            LabeledContent("Super") {
                CurrencyText(amount: entry.superAmount)
                    .font(.body.monospacedDigit())
            }
        }
        LabeledContent("Total") {
            CurrencyText(amount: entry.totalAmount)
                .font(.body.monospacedDigit().bold())
        }
    }
}
