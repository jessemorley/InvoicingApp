import SwiftUI

struct EntryDetailEditView: View {
    @Environment(\.dismiss) private var dismiss
    let entry: Entry
    let client: Client?
    var onSave: ((Entry) -> Void)?
    var onDelete: (() -> Void)?

    // Editable fields
    @State private var date: Date
    @State private var dayType: DayType
    @State private var workflowType: String
    @State private var brand: String
    @State private var skus: String
    @State private var hoursWorked: String
    @State private var role: String
    @State private var shootClient: String
    @State private var entryDescription: String
    @State private var manualAmount: String

    @State private var isSaving = false

    init(entry: Entry, client: Client?, onSave: ((Entry) -> Void)? = nil, onDelete: (() -> Void)? = nil) {
        self.entry = entry
        self.client = client
        self.onSave = onSave
        self.onDelete = onDelete

        self._date = State(initialValue: entry.dateValue)
        self._dayType = State(initialValue: entry.dayType ?? .full)
        self._workflowType = State(initialValue: entry.workflowType ?? "Apparel")
        self._brand = State(initialValue: entry.brand ?? "")
        self._skus = State(initialValue: entry.skus.map { "\($0)" } ?? "")
        self._hoursWorked = State(initialValue: entry.hoursWorked.map { "\(NSDecimalNumber(decimal: $0))" } ?? "")
        self._role = State(initialValue: entry.role ?? "Photographer")
        self._shootClient = State(initialValue: entry.shootClient ?? "")
        self._entryDescription = State(initialValue: entry.description ?? "")
        self._manualAmount = State(initialValue: "\(NSDecimalNumber(decimal: entry.baseAmount))")
    }

    var body: some View {
        Form {
            Section("Details") {
                LabeledContent("Client", value: client?.name ?? "Unknown")

                DatePicker("Date", selection: $date, displayedComponents: .date)

                switch entry.billingTypeSnapshot {
                case .dayRate:
                    dayRateFields
                case .hourly:
                    hourlyFields
                case .manual:
                    manualFields
                }
            }

            Section("Calculated Amounts") {
                LabeledContent("Base") { CurrencyText(amount: preview.baseAmount) }
                if preview.bonusAmount > 0 {
                    LabeledContent("Bonus") { CurrencyText(amount: preview.bonusAmount) }
                }
                if preview.superAmount > 0 {
                    LabeledContent("Super") { CurrencyText(amount: preview.superAmount) }
                }
                LabeledContent("Total") {
                    CurrencyText(amount: preview.totalAmount)
                        .fontWeight(.semibold)
                }
            }

            if entry.invoiceId != nil {
                Section {
                    Label("This entry has been invoiced", systemImage: "doc.text.fill")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button("Save") {
                    save()
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSaving)

                if let onDelete {
                    Button("Delete Entry", role: .destructive, action: onDelete)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Edit Entry")
    }

    // MARK: - Billing type fields

    @ViewBuilder
    private var dayRateFields: some View {
        Picker("Day Type", selection: $dayType) {
            ForEach(DayType.allCases, id: \.self) { type in
                Text(type.rawValue.capitalized).tag(type)
            }
        }

        if dayType == .full {
            Picker("Workflow", selection: $workflowType) {
                Text("Apparel").tag("Apparel")
                Text("Product").tag("Product")
                Text("Own Brand").tag("Own Brand")
            }

            if workflowType == "Own Brand" {
                TextField("Brand", text: $brand)
            }

            TextField("SKUs", text: $skus)
        }
    }

    @ViewBuilder
    private var hourlyFields: some View {
        TextField("Hours Worked", text: $hoursWorked)
        TextField("Shoot Client", text: $shootClient)
        TextField("Role", text: $role)
        TextField("Description", text: $entryDescription)
    }

    @ViewBuilder
    private var manualFields: some View {
        TextField("Amount", text: $manualAmount)
        TextField("Description", text: $entryDescription)
    }

    // MARK: - Calculation preview

    private var preview: CalculationResult {
        guard let client else {
            return CalculationResult(baseAmount: 0, bonusAmount: 0, superAmount: 0, totalAmount: 0, hoursWorked: nil)
        }

        switch entry.billingTypeSnapshot {
        case .dayRate:
            return CalculationService.calculateDayRate(
                client: client,
                dayType: dayType,
                workflowType: dayType == .full ? workflowType : nil,
                brand: workflowType == "Own Brand" ? brand : nil,
                skus: Int(skus),
                workflowRates: []
            )
        case .hourly:
            let hours = Decimal(string: hoursWorked) ?? 0
            let rate = client.rateHourly ?? 0
            let base = hours * rate
            let superAmt = client.paysSuper ? base * client.superRate : 0
            return CalculationResult(
                baseAmount: base,
                bonusAmount: 0,
                superAmount: superAmt,
                totalAmount: base + superAmt,
                hoursWorked: hours
            )
        case .manual:
            let amount = Decimal(string: manualAmount) ?? 0
            return CalculationService.calculateManual(
                amount: amount,
                paysSuper: client.paysSuper,
                superRate: client.superRate
            )
        }
    }

    // MARK: - Save

    private func save() {
        let calc = preview
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        var updated = entry
        updated.date = dateFormatter.string(from: date)
        updated.dayType = entry.billingTypeSnapshot == .dayRate ? dayType : entry.dayType
        updated.workflowType = entry.billingTypeSnapshot == .dayRate && dayType == .full ? workflowType : entry.workflowType
        updated.brand = workflowType == "Own Brand" ? brand : entry.brand
        updated.skus = Int(skus)
        updated.hoursWorked = calc.hoursWorked
        updated.role = entry.billingTypeSnapshot == .hourly ? role : entry.role
        updated.shootClient = entry.billingTypeSnapshot == .hourly ? shootClient : entry.shootClient
        updated.description = entryDescription.isEmpty ? nil : entryDescription
        updated.baseAmount = calc.baseAmount
        updated.bonusAmount = calc.bonusAmount
        updated.superAmount = calc.superAmount
        updated.totalAmount = calc.totalAmount

        onSave?(updated)
        dismiss()
    }
}
