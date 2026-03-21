import SwiftUI

struct InvoiceDetailView: View {
    @StateObject private var vm: InvoiceDetailViewModel

    init(invoice: Invoice) {
        self._vm = StateObject(wrappedValue: InvoiceDetailViewModel(invoice: invoice))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    VStack(alignment: .leading) {
                        Text("Invoice \(vm.invoice.invoiceNumber)")
                            .font(.title)
                        Text(vm.client?.name ?? "")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    StatusBadgeView(status: vm.invoice.status)
                }

                // Dates
                HStack(spacing: 24) {
                    LabeledContent("Issued") {
                        Text(vm.invoice.issuedDateValue, style: .date)
                    }
                    LabeledContent("Due") {
                        Text(vm.invoice.dueDateValue, style: .date)
                    }
                }

                Divider()

                // Line items
                VStack(spacing: 0) {
                    HStack {
                        Text("Item").font(.caption.bold())
                        Spacer()
                        Text("Amount").font(.caption.bold())
                            .frame(width: 100, alignment: .trailing)
                    }
                    .padding(.vertical, 8)

                    Divider()

                    ForEach(vm.entries) { entry in
                        HStack {
                            Text(entryDescription(entry))
                            Spacer()
                            CurrencyText(amount: entry.baseAmount + entry.bonusAmount)
                                .frame(width: 100, alignment: .trailing)
                        }
                        .padding(.vertical, 4)
                    }

                    Divider()

                    // Totals
                    VStack(alignment: .trailing, spacing: 4) {
                        HStack {
                            Spacer()
                            Text("Subtotal")
                            CurrencyText(amount: vm.invoice.subtotal)
                                .frame(width: 100, alignment: .trailing)
                        }
                        if vm.invoice.superAmount > 0 {
                            HStack {
                                Spacer()
                                Text("Super")
                                CurrencyText(amount: vm.invoice.superAmount)
                                    .frame(width: 100, alignment: .trailing)
                            }
                        }
                        HStack {
                            Spacer()
                            Text("Total").fontWeight(.bold)
                            CurrencyText(amount: vm.invoice.total)
                                .fontWeight(.bold)
                                .frame(width: 100, alignment: .trailing)
                        }
                    }
                    .padding(.top, 8)
                }

                Divider()

                // Actions
                HStack(spacing: 12) {
                    Button("Mark as \(nextStatusLabel)") {
                        Task { await vm.cycleStatus() }
                    }
                    .buttonStyle(.bordered)

                    Button("Export PDF") {
                        Task { await vm.exportPDF() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(24)
        }
        .navigationTitle("Invoice \(vm.invoice.invoiceNumber)")
        .task { await vm.loadDetails() }
    }

    private var nextStatusLabel: String {
        switch vm.invoice.status {
        case .draft: "Issued"
        case .issued: "Paid"
        case .paid: "Draft"
        }
    }

    private func entryDescription(_ entry: Entry) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        let dateStr = formatter.string(from: entry.dateValue)

        switch entry.billingTypeSnapshot {
        case .dayRate:
            if let workflow = entry.workflowType {
                if workflow == "Own Brand" {
                    return "\(dateStr) \(entry.brand ?? "Own Brand")"
                }
                return "\(dateStr) \(workflow)"
            }
            return "\(dateStr) Creative Assist"
        case .hourly:
            let hours = entry.hoursWorked.map { "\(NSDecimalNumber(decimal: $0))h" } ?? ""
            if let shootClient = entry.shootClient {
                return "\(dateStr) \(shootClient) (\(entry.role ?? "")) \(hours)"
            }
            return "\(dateStr) \(entry.description ?? "") \(hours)"
        case .manual:
            return "\(dateStr) \(entry.description ?? "")"
        }
    }
}
