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
    @Published var entryDescription: String = ""

    // Manual fields
    @Published var manualAmount: String = ""

    // Edit mode
    var editingEntry: Entry?
    var onEditSave: ((Entry) -> Void)?

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
                breakMinutes: breakMinutes,
                role: client.showRole ? role : nil
            )
        case .manual:
            guard let amount = Decimal(string: manualAmount) else { return nil }
            return CalculationService.calculateManual(amount: amount, client: client)
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

    func populateFromEntry(_ entry: Entry, client: Client) {
        editingEntry = entry
        selectedClient = client
        date = entry.dateValue
        dayType = entry.dayType ?? .full
        workflowType = entry.workflowType ?? "Apparel"
        brand = entry.brand ?? ""
        skus = entry.skus.map { "\($0)" } ?? ""
        role = entry.role ?? "Photographer"
        entryDescription = entry.shootClient ?? entry.description ?? ""
        manualAmount = "\(NSDecimalNumber(decimal: entry.baseAmount))"
        breakMinutes = entry.breakMinutes ?? 0

        if let start = entry.startTime {
            startTime = parseTime(start) ?? startTime
        }
        if let finish = entry.finishTime {
            finishTime = parseTime(finish) ?? finishTime
        }

        if client.billingType == .dayRate {
            Task { await loadWorkflowRates(for: client) }
        }
    }

    func onClientSelected(_ client: Client) {
        selectedClient = client
        resetFields()
        if client.billingType == .hourly {
            if let start = client.defaultStartTime {
                startTime = parseTime(start) ?? defaultTime(hour: 9)
            } else {
                startTime = defaultTime(hour: 9)
            }
            if let finish = client.defaultFinishTime {
                finishTime = parseTime(finish) ?? defaultTime(hour: 17)
            } else {
                finishTime = defaultTime(hour: 17)
            }
        }
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
            id: editingEntry?.id ?? UUID(),
            clientId: client.id,
            date: dateFormatter.string(from: date),
            invoiceId: editingEntry?.invoiceId,
            billingTypeSnapshot: client.billingType,
            dayType: client.billingType == .dayRate ? dayType : nil,
            workflowType: client.billingType == .dayRate && dayType == .full ? workflowType : nil,
            brand: workflowType == "Own Brand" ? brand : nil,
            skus: Int(skus),
            role: client.billingType == .hourly && client.showRole ? role : nil,
            shootClient: nil,
            description: entryDescription.isEmpty ? nil : entryDescription,
            startTime: client.billingType == .hourly ? timeString(from: startTime) : nil,
            finishTime: client.billingType == .hourly ? timeString(from: finishTime) : nil,
            breakMinutes: client.billingType == .hourly ? breakMinutes : nil,
            hoursWorked: calc.hoursWorked,
            baseAmount: calc.baseAmount,
            bonusAmount: calc.bonusAmount,
            superAmount: calc.superAmount,
            totalAmount: calc.totalAmount,
            createdAt: editingEntry?.createdAt ?? isoFormatter.string(from: Date())
        )

        do {
            if let onEditSave {
                try await supabase.update(in: "entries", id: entry.id, value: entry)
                onEditSave(entry)
            } else {
                try await supabase.insert(into: "entries", value: entry)
            }
            showSaveSuccess = true
            if editingEntry == nil {
                resetFields()
            }
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
        startTime = defaultTime(hour: 9)
        finishTime = defaultTime(hour: 17)
        breakMinutes = 0
        role = "Photographer"
        entryDescription = ""
        manualAmount = ""
    }

    private func defaultTime(hour: Int) -> Date {
        Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: Date()) ?? Date()
    }

    private func parseTime(_ str: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        guard let parsed = formatter.date(from: str) else { return nil }
        let cal = Calendar.current
        return cal.date(bySettingHour: cal.component(.hour, from: parsed),
                        minute: cal.component(.minute, from: parsed),
                        second: 0, of: Date())
    }

    private func timeString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}
