import SwiftUI

struct ClientPickerView: View {
    let clients: [Client]
    @Binding var selectedClient: Client?
    var onAddNew: (() -> Void)?

    var body: some View {
        Picker("Client", selection: Binding(
            get: { selectedClient?.id },
            set: { newId in
                selectedClient = clients.first { $0.id == newId }
            }
        )) {
            Text("Select a client…").tag(nil as UUID?)
            ForEach(clients) { client in
                Text(client.name).tag(client.id as UUID?)
            }
        }

        if let onAddNew {
            Button("Add New Client…", action: onAddNew)
                .font(.caption)
        }
    }
}
