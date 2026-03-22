import SwiftUI

struct EntriesListView: View {
    @StateObject private var vm = EntriesListViewModel()
    @State private var selectedEntryID: UUID?
    @State private var showInspector = true
    @State private var entryToDelete: Entry?
    @State private var selectedInvoice: Invoice?
    @State private var showLogEntry = false
    @State private var showGenerateSheet = false
    @State private var hasInspectorAppeared = false
    @Binding var sidebarSelection: SidebarItem?

    private var selectedEntry: Entry? {
        guard let id = selectedEntryID else { return nil }
        return vm.filteredEntries.first { $0.id == id }
    }

    var body: some View {
        VStack(spacing: 0) {
            if let error = vm.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .padding()
            }

            // Content
            if vm.isLoading {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if vm.filteredEntries.isEmpty {
                ContentUnavailableView(
                    "No Entries",
                    systemImage: "tray",
                    description: Text("Entries you log will appear here.\nTotal fetched: \(vm.entries.count)")
                )
            } else {
                switch vm.viewMode {
                case .list:
                    entriesListContent
                case .calendar:
                    CalendarView(
                        entriesByDate: vm.entriesByDate,
                        clientMap: vm.clientMap,
                        invoiceMap: vm.invoiceMap,
                        onSelect: { entry in
                            selectedEntryID = entry.id
                            showInspector = true
                        }
                    )
                }
            }
            // Uninvoiced entries bottom bar
            if !vm.uninvoicedGroups.isEmpty {
                Divider()
                HStack {
                    Image(systemName: "doc.text")
                        .foregroundStyle(.secondary)
                    Text("\(vm.uninvoicedGroups.count) invoices · \(vm.uninvoicedEntryCount) entries uninvoiced")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    CurrencyText(amount: vm.uninvoicedTotal)
                        .font(.subheadline.monospacedDigit().bold())
                    Button("Generate") {
                        showGenerateSheet = true
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
        }
        .navigationTitle("Entries")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button {
                    showLogEntry = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .principal) {
                Picker("View", selection: $vm.viewMode) {
                    ForEach(EntriesViewMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            if vm.viewMode == .list {
                ToolbarItem(placement: .automatic) {
                    Toggle(isOn: $vm.groupByWeek) {
                        Label("Group by Week", systemImage: "calendar.day.timeline.leading")
                    }
                    .toggleStyle(.button)
                }
            }
            ToolbarItem(placement: .automatic) {
                Button {
                    showInspector.toggle()
                } label: {
                    Label("Inspector", systemImage: "sidebar.trailing")
                }
            }
        }
        .inspector(isPresented: $showInspector) {
            Group {
                if let entry = selectedEntry, let client = vm.clientMap[entry.clientId] {
                    EntryInspectorView(
                        entry: entry,
                        client: client,
                        invoice: entry.invoiceId.flatMap { vm.invoiceMap[$0] },
                        onSave: { updated in
                            Task { await vm.updateEntry(updated) }
                        },
                        onDelete: { entry in
                            Task { await vm.deleteEntry(entry) }
                            selectedEntryID = nil
                        }
                    )
                    .id(entry.id)
                } else {
                    ContentUnavailableView(
                        "No Selection",
                        systemImage: "doc.text",
                        description: Text("Select an entry to view details.")
                    )
                }
            }
            .inspectorColumnWidth(min: 200, ideal: 320, max: 400)
            .frame(minWidth: hasInspectorAppeared ? nil : 320)
            .onAppear { hasInspectorAppeared = true }
        }
        .task { await vm.loadData() }
        .sheet(isPresented: $showLogEntry) {
            Task { await vm.loadData() }
        } content: {
            LogEntryView()
                .frame(minWidth: 400, minHeight: 500)
        }
        .sheet(isPresented: $showGenerateSheet) {
            Task { await vm.loadData() }
        } content: {
            GenerateInvoicesSheetView(onGenerated: {
                showGenerateSheet = false
                sidebarSelection = .summary
            })
            .frame(minWidth: 500, minHeight: 400)
        }
    }

    private static let weekFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "d MMM"
        return f
    }()

    private func sectionTitle(for group: EntriesListViewModel.ClientWeekGroup) -> String {
        let clientName = vm.clientMap[group.clientId]?.name ?? "Unknown"
        let calendar = Calendar.current
        let weekEnd = calendar.date(byAdding: .day, value: 6, to: group.weekStart) ?? group.weekStart
        let start = Self.weekFormatter.string(from: group.weekStart)
        let end = Self.weekFormatter.string(from: weekEnd)
        return "\(clientName) — \(start) – \(end)"
    }

    private func weekSectionTitle(for group: EntriesListViewModel.WeekGroup) -> String {
        let calendar = Calendar.current
        let weekEnd = calendar.date(byAdding: .day, value: 6, to: group.weekStart) ?? group.weekStart
        let start = Self.weekFormatter.string(from: group.weekStart)
        let end = Self.weekFormatter.string(from: weekEnd)
        return "\(start) – \(end)"
    }

    private func weekSummaryRow(_ group: EntriesListViewModel.WeekGroup) -> some View {
        HStack {
            Text("\(group.entries.count) entries")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            CurrencyText(amount: group.subtotal)
                .font(.subheadline.monospacedDigit().bold())
        }
        .padding(.vertical, 2)
        .listRowSeparator(.hidden)
    }

    private var entriesListContent: some View {
        List(selection: $selectedEntryID) {
            if vm.groupByWeek {
                ForEach(vm.groupedByWeek) { group in
                    Section(weekSectionTitle(for: group)) {
                        ForEach(group.entries) { entry in
                            entryRow(entry)
                                .tag(entry.id)
                        }
                        weekSummaryRow(group)
                    }
                }
            } else {
                ForEach(vm.groupedByClientWeek) { group in
                    Section(sectionTitle(for: group)) {
                        ForEach(group.entries) { entry in
                            entryRow(entry)
                                .tag(entry.id)
                        }
                        groupSummaryRow(group)
                    }
                }
            }
        }
        .background {
            NavigationLink(
                isActive: Binding(
                    get: { selectedInvoice != nil },
                    set: { if !$0 { selectedInvoice = nil } }
                )
            ) {
                if let invoice = selectedInvoice {
                    InvoiceDetailView(invoice: invoice)
                }
            } label: {
                EmptyView()
            }
            .hidden()
        }
        .confirmationDialog(
            "Delete this entry?",
            isPresented: Binding(
                get: { entryToDelete != nil },
                set: { if !$0 { entryToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let entry = entryToDelete {
                    Task { await vm.deleteEntry(entry) }
                }
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private func groupSummaryRow(_ group: EntriesListViewModel.ClientWeekGroup) -> some View {
        HStack {
            Text("\(group.entries.count) entries")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Spacer()

            CurrencyText(amount: group.subtotal)
                .font(.subheadline.monospacedDigit().bold())

            if group.allUninvoiced {
                Button {
                    Task { await vm.invoiceGroup(group) }
                } label: {
                    Label("Invoice", systemImage: "doc.text")
                        .font(.subheadline)
                }
                .buttonStyle(.bordered)
            } else if group.allInvoiced {
                if let invoiceId = group.entries.first?.invoiceId,
                   let invoice = vm.invoiceMap[invoiceId] {
                    Button {
                        selectedInvoice = invoice
                    } label: {
                        Label(invoice.invoiceNumber, systemImage: "checkmark.circle.fill")
                            .font(.subheadline)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color(red: 0.1, green: 0.6, blue: 0.3))
                } else {
                    Label("Invoiced", systemImage: "checkmark.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(.vertical, 2)
        .listRowSeparator(.hidden)
    }

    private func entryRow(_ entry: Entry) -> some View {
        EntryRowView(
            entry: entry,
            client: vm.clientMap[entry.clientId],
            showAmount: true
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                entryToDelete = entry
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            Button(role: .destructive) {
                entryToDelete = entry
            } label: {
                Label("Delete Entry…", systemImage: "trash")
            }
        }
    }
}
