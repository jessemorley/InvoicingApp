import SwiftUI

struct ClientListView: View {
    @StateObject private var vm = ClientManagementViewModel()
    @State private var selectedClient: Client?
    @State private var showingNewClient = false

    var body: some View {
        List(selection: $selectedClient) {
            ForEach(vm.filteredClients) { client in
                NavigationLink(value: client) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(client.name)
                                .font(.headline)
                            Text(client.billingType.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if !client.isActive {
                            Text("Inactive")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem {
                Toggle("Show Inactive", isOn: $vm.showInactive)
            }
            ToolbarItem {
                Button(action: { showingNewClient = true }) {
                    Label("Add Client", systemImage: "plus")
                }
            }
        }
        .navigationTitle("Clients")
        .navigationDestination(for: Client.self) { client in
            ClientEditView(vm: vm, client: client)
        }
        .sheet(isPresented: $showingNewClient) {
            NavigationStack {
                ClientEditView(vm: vm, client: nil)
            }
        }
        .task { await vm.loadClients() }
    }
}
