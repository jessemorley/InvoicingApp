import Foundation

@MainActor
final class ClientManagementViewModel: ObservableObject {
    private let supabase = SupabaseService.shared

    @Published var clients: [Client] = []
    @Published var workflowRates: [UUID: [ClientWorkflowRate]] = [:]
    @Published var showInactive = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    var filteredClients: [Client] {
        if showInactive {
            return clients
        }
        return clients.filter(\.isActive)
    }

    func loadClients() async {
        isLoading = true
        do {
            clients = try await supabase.fetch(from: "clients", orderBy: "name")
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func saveClient(_ client: Client, isNew: Bool) async {
        do {
            if isNew {
                try await supabase.insert(into: "clients", value: client)
                clients.append(client)
            } else {
                try await supabase.update(in: "clients", id: client.id, value: client)
                if let idx = clients.firstIndex(where: { $0.id == client.id }) {
                    clients[idx] = client
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadWorkflowRates(for clientId: UUID) async {
        do {
            let rates: [ClientWorkflowRate] = try await supabase.fetch(
                from: "client_workflow_rates",
                filterColumn: "client_id",
                filterValue: clientId.uuidString
            )
            workflowRates[clientId] = rates
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveWorkflowRate(_ rate: ClientWorkflowRate, isNew: Bool) async {
        do {
            if isNew {
                try await supabase.insert(into: "client_workflow_rates", value: rate)
            } else {
                try await supabase.update(in: "client_workflow_rates", id: rate.id, value: rate)
            }
            await loadWorkflowRates(for: rate.clientId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteWorkflowRate(_ rate: ClientWorkflowRate) async {
        do {
            try await supabase.delete(from: "client_workflow_rates", id: rate.id)
            await loadWorkflowRates(for: rate.clientId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
