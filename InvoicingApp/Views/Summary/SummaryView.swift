import SwiftUI

struct SummaryView: View {
    @StateObject private var vm = SummaryViewModel()
    @State private var invoiceToDelete: Invoice?

    var body: some View {
        VStack(spacing: 0) {
            // Filters
            HStack {
                DateRangePickerView(startDate: $vm.startDate, endDate: $vm.endDate)
                Spacer()
                Button("Refresh") { Task { await vm.loadData() } }
            }
            .padding()

            Divider()

            if let error = vm.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .padding()
            }

            if vm.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if vm.groups.isEmpty {
                ContentUnavailableView(
                    "No Invoices",
                    systemImage: "doc.text",
                    description: Text("No invoices found for this period. Fetched: \(vm.invoices.count)")
                )
            } else {
                List {
                    ForEach(vm.groups) { group in
                        Section {
                            ForEach(group.invoices) { invoice in
                                NavigationLink(destination: InvoiceDetailView(invoice: invoice)) {
                                    HStack {
                                        Text(invoice.issuedDateValue, style: .date)
                                            .frame(width: 100, alignment: .leading)
                                        Text(invoice.invoiceNumber)
                                            .font(.body.monospacedDigit())
                                            .frame(width: 80, alignment: .leading)
                                        Text(group.client.name)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                        CurrencyText(amount: invoice.total)
                                            .font(.body.monospacedDigit())
                                            .frame(width: 100, alignment: .trailing)
                                        Button(action: { Task { await vm.toggleStatus(for: invoice) } }) {
                                            StatusBadgeView(status: invoice.status)
                                        }
                                        .buttonStyle(.plain)
                                        .frame(width: 80)
                                    }
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        invoiceToDelete = invoice
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        } header: {
                            HStack {
                                Text(group.client.name)
                                    .font(.headline)
                                Spacer()
                                Text("Outstanding: ")
                                    .foregroundStyle(.secondary)
                                CurrencyText(amount: group.outstanding)
                                    .foregroundStyle(group.outstanding > 0 ? .red : .green)
                            }
                        }
                    }
                }

                Divider()

                // Footer totals
                HStack {
                    VStack(alignment: .leading) {
                        HStack {
                            Text("Gross Total:")
                                .foregroundStyle(.secondary)
                            CurrencyText(amount: vm.grossTotal)
                                .font(.title3.monospacedDigit().bold())
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing) {
                        HStack {
                            Text("Outstanding:")
                                .foregroundStyle(.secondary)
                            CurrencyText(amount: vm.outstandingTotal)
                                .font(.title3.monospacedDigit().bold())
                                .foregroundStyle(vm.outstandingTotal > 0 ? .red : .green)
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Summary")
        .task { await vm.loadData() }
        .confirmationDialog(
            "Delete invoice \(invoiceToDelete?.invoiceNumber ?? "")?",
            isPresented: Binding(
                get: { invoiceToDelete != nil },
                set: { if !$0 { invoiceToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete invoice only (keep entries)") {
                if let invoice = invoiceToDelete {
                    Task { await vm.deleteInvoice(invoice, deleteEntries: false) }
                }
            }
            Button("Delete invoice and entries", role: .destructive) {
                if let invoice = invoiceToDelete {
                    Task { await vm.deleteInvoice(invoice, deleteEntries: true) }
                }
            }
        } message: {
            Text("What would you like to do with the linked entries?")
        }
    }
}
