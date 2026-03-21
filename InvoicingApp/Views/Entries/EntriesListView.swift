import SwiftUI

struct EntriesListView: View {
    @StateObject private var vm = EntriesListViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Toolbar
            HStack {
                Picker("View", selection: $vm.viewMode) {
                    ForEach(EntriesViewMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 200)

                Spacer()

                Picker("Client", selection: $vm.selectedClientId) {
                    Text("All Clients").tag(nil as UUID?)
                    ForEach(vm.activeClients) { client in
                        Text(client.name).tag(client.id as UUID?)
                    }
                }
                .frame(width: 200)
            }
            .padding()

            Divider()

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
                        onSelect: { _ in }
                    )
                }
            }
        }
        .navigationTitle("Entries")
        .task { await vm.loadData() }
    }

    @State private var entryToDelete: Entry?

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

    private var entriesListContent: some View {
        List {
            ForEach(vm.groupedByClientWeek) { group in
                Section(sectionTitle(for: group)) {
                    ForEach(group.entries) { entry in
                        entryRow(entry)
                    }
                    groupSummaryRow(group)
                }
            }
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
                Label("Invoiced", systemImage: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.green)
            }
        }
        .padding(.vertical, 2)
    }

    private func entryRow(_ entry: Entry) -> some View {
        NavigationLink {
            EntryDetailEditView(
                entry: entry,
                client: vm.clientMap[entry.clientId],
                onSave: { updated in
                    Task { await vm.updateEntry(updated) }
                },
                onDelete: {
                    entryToDelete = entry
                }
            )
        } label: {
            EntryRowView(
                entry: entry,
                client: vm.clientMap[entry.clientId],
                showAmount: true
            )
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                entryToDelete = entry
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}
