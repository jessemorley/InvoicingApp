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

                Toggle("Amounts", isOn: $vm.showAmounts)
                    .toggleStyle(.switch)
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
                        showAmounts: vm.showAmounts,
                        onSelect: { _ in }
                    )
                }
            }
        }
        .navigationTitle("Entries")
        .task { await vm.loadData() }
    }

    @State private var entryToDelete: Entry?

    private var entriesListContent: some View {
        List {
            ForEach(vm.filteredEntries) { entry in
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
                        showAmount: vm.showAmounts
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
}
