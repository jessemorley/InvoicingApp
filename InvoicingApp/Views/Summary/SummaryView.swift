import SwiftUI

struct SummaryView: View {
    @StateObject private var vm = SummaryViewModel()
    @State private var invoiceToDelete: Invoice?

    private static let rowDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd/MM/yyyy"
        return f
    }()

    var body: some View {
        HStack(spacing: 0) {
            // Main invoice list
            VStack(spacing: 0) {
                // Filter bar
                HStack {
                    Picker("Date Range", selection: $vm.dateRangePreset) {
                        ForEach(DateRangePreset.allCases, id: \.self) { preset in
                            Text(preset.rawValue).tag(preset)
                        }
                    }
                    .onChange(of: vm.dateRangePreset) { _, newValue in
                        vm.applyPreset(newValue)
                    }

                    if vm.dateRangePreset == .custom {
                        DatePicker("From", selection: $vm.startDate, displayedComponents: .date)
                            .labelsHidden()
                        DatePicker("To", selection: $vm.endDate, displayedComponents: .date)
                            .labelsHidden()
                    }

                    Picker("Status", selection: $vm.statusFilter) {
                        ForEach(StatusFilter.allCases, id: \.self) { filter in
                            Text(filter.rawValue).tag(filter)
                        }
                    }

                    Toggle(isOn: $vm.groupByClient) {
                        Text("Group By")
                    }
                    .toggleStyle(.button)

                    Spacer()
                }
                .padding(.horizontal)
                .padding(.vertical, 8)

                Divider()

                if let error = vm.errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .padding()
                }

                if vm.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.filteredInvoices.isEmpty {
                    ContentUnavailableView(
                        "No Invoices",
                        systemImage: "doc.text",
                        description: Text("No invoices found for this period.")
                    )
                } else {
                    List {
                        if vm.groupByClient {
                            ForEach(vm.groups) { group in
                                Section {
                                    ForEach(group.invoices) { invoice in
                                        invoiceRow(invoice, clientName: group.client.name)
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
                        } else {
                            ForEach(vm.filteredInvoices) { invoice in
                                invoiceRow(invoice, clientName: vm.clientName(for: invoice))
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
            .frame(maxWidth: .infinity)

            Divider()

            // Right-hand breakdown pane
            VStack(alignment: .leading, spacing: 16) {
                Text("Breakdown by Client")
                    .font(.headline)

                VStack(spacing: 8) {
                    HStack {
                        Text("Client")
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Paid")
                            .frame(width: 90, alignment: .trailing)
                        Text("Outstanding")
                            .frame(width: 90, alignment: .trailing)
                    }
                    .font(.subheadline.bold())
                    .foregroundStyle(.secondary)

                    Divider()

                    ForEach(vm.topClientBreakdowns) { breakdown in
                        HStack {
                            Text(breakdown.name)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            CurrencyText(amount: breakdown.paid)
                                .font(.body.monospacedDigit())
                                .frame(width: 90, alignment: .trailing)
                                .foregroundStyle(.green)
                            CurrencyText(amount: breakdown.outstanding)
                                .font(.body.monospacedDigit())
                                .frame(width: 90, alignment: .trailing)
                                .foregroundStyle(breakdown.outstanding > 0 ? .red : .secondary)
                        }
                    }

                    Divider()

                    HStack {
                        Text("Total")
                            .bold()
                            .frame(maxWidth: .infinity, alignment: .leading)
                        CurrencyText(amount: vm.totalPaid)
                            .font(.body.monospacedDigit().bold())
                            .frame(width: 90, alignment: .trailing)
                            .foregroundStyle(.green)
                        CurrencyText(amount: vm.outstandingTotal)
                            .font(.body.monospacedDigit().bold())
                            .frame(width: 90, alignment: .trailing)
                            .foregroundStyle(vm.outstandingTotal > 0 ? .red : .secondary)
                    }
                }

                Spacer()
            }
            .padding()
            .frame(width: 340)
        }
        .navigationTitle("Invoices")
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

    private func invoiceRow(_ invoice: Invoice, clientName: String) -> some View {
        NavigationLink(destination: InvoiceDetailView(invoice: invoice)) {
            HStack {
                Text(Self.rowDateFormatter.string(from: invoice.issuedDateValue))
                    .frame(width: 120, alignment: .leading)
                Text(invoice.invoiceNumber)
                    .font(.body.monospacedDigit())
                    .frame(width: 80, alignment: .leading)
                Text(clientName)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(clientChipColor(clientName).opacity(0.15))
                    .foregroundStyle(clientChipColor(clientName))
                    .clipShape(Capsule())
                    .frame(maxWidth: .infinity, alignment: .leading)
                CurrencyText(amount: invoice.total)
                    .font(.body.monospacedDigit())
                    .frame(width: 100, alignment: .trailing)
                StatusBadgeView(status: invoice.status)
                    .frame(width: 80)
            }
            .padding(.vertical, 6)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                invoiceToDelete = invoice
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            Button(role: .destructive) {
                invoiceToDelete = invoice
            } label: {
                Label("Delete Invoice…", systemImage: "trash")
            }
        }
    }

    private func clientChipColor(_ name: String) -> Color {
        switch name {
        case let n where n.contains("ICONIC"): return .purple
        case let n where n.contains("Images"): return .blue
        case let n where n.contains("JD"): return .orange
        default: return .gray
        }
    }
}
