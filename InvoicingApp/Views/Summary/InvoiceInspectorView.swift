import SwiftUI

struct InvoiceInspectorView: View {
    @StateObject private var vm: InvoiceDetailViewModel
    var onStatusChanged: (() -> Void)?

    init(invoice: Invoice, onStatusChanged: (() -> Void)? = nil) {
        self._vm = StateObject(wrappedValue: InvoiceDetailViewModel(invoice: invoice))
        self.onStatusChanged = onStatusChanged
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    Text(vm.invoice.invoiceNumber)
                        .font(.title2.bold().monospacedDigit())
                    Spacer()
                    StatusBadgeView(status: vm.invoice.status)
                }

                Text(vm.client?.name ?? "")
                    .font(.headline)
                    .foregroundStyle(.secondary)

                Divider()

                // Key info
                LabeledContent("Issued") {
                    Text(vm.invoice.issuedDateValue, style: .date)
                }
                LabeledContent("Due") {
                    Text(vm.invoice.dueDateValue, style: .date)
                }

                Divider()

                // Totals
                LabeledContent("Subtotal") {
                    CurrencyText(amount: vm.invoice.subtotal)
                        .font(.body.monospacedDigit())
                }
                if vm.invoice.superAmount > 0 {
                    LabeledContent("Super") {
                        CurrencyText(amount: vm.invoice.superAmount)
                            .font(.body.monospacedDigit())
                    }
                }
                LabeledContent("Total") {
                    CurrencyText(amount: vm.invoice.total)
                        .font(.body.monospacedDigit().bold())
                }

                Divider()

                // Line items
                Text("Line Items")
                    .font(.subheadline.bold())

                if vm.entries.isEmpty && !vm.isLoading {
                    Text("No entries")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                } else {
                    ForEach(vm.entries) { entry in
                        HStack {
                            Text(entry.dateValue, format: .dateTime.weekday(.abbreviated).month(.abbreviated).day())
                                .font(.caption)
                            Spacer()
                            CurrencyText(amount: entry.baseAmount + entry.bonusAmount)
                                .font(.caption.monospacedDigit())
                        }
                    }
                }

                Divider()

                // Actions
                HStack(spacing: 8) {
                    Button("Mark \(nextStatusLabel)") {
                        Task {
                            await vm.cycleStatus()
                            onStatusChanged?()
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    Button("Export PDF") {
                        Task { await vm.exportPDF() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }

                NavigationLink(destination: InvoiceDetailView(invoice: vm.invoice)) {
                    Label("View Full Details", systemImage: "arrow.right")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
            .padding()
        }
        .task { await vm.loadDetails() }
    }

    private var nextStatusLabel: String {
        switch vm.invoice.status {
        case .draft: "Issued"
        case .issued: "Paid"
        case .paid: "Draft"
        }
    }
}
