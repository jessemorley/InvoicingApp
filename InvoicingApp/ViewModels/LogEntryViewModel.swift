import Foundation
import SwiftUI

@MainActor
final class LogEntryViewModel: ObservableObject {
    private let supabase = SupabaseService.shared

    @Published var clients: [Client] = []
    @Published var selectedClient: Client?
    @Published var workflowRates: [ClientWorkflowRate] = []

    // Common fields
    @Published var date = Date()

    // Day rate fields
    @Published var dayType: DayType = .full
    @Published var workflowType: String = "Apparel"
    @Published var brand: String = ""
    @Published var skus: String = ""

    // Hourly fields
    @Published var startTime = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    @Published var finishTime = Calendar.current.date(bySettingHour: 17, minute: 0, second: 0, of: Date()) ?? Date()
    @Published var breakMinutes: Int = 0
    @Published var role: String = "Photographer"
    @Published var shootClient: String = ""
    @Published var entryDescription: String = ""

    // Manual fields
    @Published var manualAmount: String = ""
    @Published var paysSuper: Bool = true

    // State
    @Published var isSaving = false
    @Published var showSaveSuccess = false
    @Published var errorMessage: String?

    var calculationPreview: CalculationResult? {
        guard let client = selectedClient else { return nil }

        switch client.billingType {
        case .dayRate:
            return CalculationService.calculateDayRate(
                client: client,
                dayType: dayType,
                workflowType: dayType == .full ? workflowType : nil,
                brand: workflowType == "Own Brand" ? brand : nil,
                skus: Int(skus),
                workflowRates: workflowRates
            )
        case .hourly:
            return CalculationService.calculateHourly(
                client: client,
                startTime: startTime,
                finishTime: finishTime,
                breakMinutes: breakMinutes
            )
        case .manual:
            guard let amount = Decimal(string: manualAmount) else { return nil }
            return CalculationService.calculateManual(
                amount: amount,
                paysSuper: paysSuper,
                superRate: client.superRate
            )
        }
    }

    func loadClients() async {
        do {
            let allClients: [Client] = try await supabase.fetch(
                from: "clients",
                orderBy: "name"
            )
            clients = allClients.filter(\.isActive)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func onClientSelected(_ client: Client) {
        selectedClient = client
        paysSuper = client.paysSuper
        resetFields()
        if client.billingType == .dayRate {
            Task { await loadWorkflowRates(for: client) }
        }
    }

    func loadWorkflowRates(for client: Client) async {
        do {
            workflowRates = try await supabase.fetch(
                from: "client_workflow_rates",
                filterColumn: "client_id",
                filterValue: client.id.uuidString
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveEntry() async {
        guard let client = selectedClient, let calc = calculationPreview else { return }
        isSaving = true
        errorMessage = nil

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let entry = Entry(
            id: UUID(),
            clientId: client.id,
            date: dateFormatter.string(from: date),
            invoiceId: nil,
            billingTypeSnapshot: client.billingType,
            dayType: client.billingType == .dayRate ? dayType : nil,
            workflowType: client.billingType == .dayRate && dayType == .full ? workflowType : nil,
            brand: workflowType == "Own Brand" ? brand : nil,
            skus: Int(skus),
            role: client.name == "Images That Sell" ? role : nil,
            shootClient: client.name == "Images That Sell" ? shootClient : nil,
            description: entryDescription.isEmpty ? nil : entryDescription,
            startTime: client.billingType == .hourly ? timeString(from: startTime) : nil,
            finishTime: client.billingType == .hourly ? timeString(from: finishTime) : nil,
            breakMinutes: client.billingType == .hourly ? breakMinutes : nil,
            hoursWorked: calc.hoursWorked,
            baseAmount: calc.baseAmount,
            bonusAmount: calc.bonusAmount,
            superAmount: calc.superAmount,
            totalAmount: calc.totalAmount,
            createdAt: isoFormatter.string(from: Date())
        )

        do {
            try await supabase.insert(into: "entries", value: entry)
            showSaveSuccess = true
            resetFields()
            // Auto-dismiss success message
            try? await Task.sleep(for: .seconds(2))
            showSaveSuccess = false
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    private func resetFields() {
        date = Date()
        dayType = .full
        workflowType = "Apparel"
        brand = ""
        skus = ""
        startTime = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
        finishTime = Calendar.current.date(bySettingHour: 17, minute: 0, second: 0, of: Date()) ?? Date()
        breakMinutes = 0
        role = "Photographer"
        shootClient = ""
        entryDescription = ""
        manualAmount = ""
    }

    private func timeString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}
