import SwiftUI

struct ClientEditView: View {
    @ObservedObject var vm: ClientManagementViewModel
    @Environment(\.dismiss) private var dismiss
    let isNew: Bool

    @State private var name: String
    @State private var billingType: BillingType
    @State private var rateFullDay: String
    @State private var rateHalfDay: String
    @State private var rateHourly: String
    @State private var paysSuper: Bool
    @State private var superRate: String
    @State private var invoiceFrequency: InvoiceFrequency
    @State private var address: String
    @State private var suburb: String
    @State private var email: String
    @State private var abn: String
    @State private var notes: String
    @State private var isActive: Bool

    private let clientId: UUID

    init(vm: ClientManagementViewModel, client: Client?) {
        self.vm = vm
        self.isNew = client == nil
        let c = client
        self.clientId = c?.id ?? UUID()
        self._name = State(initialValue: c?.name ?? "")
        self._billingType = State(initialValue: c?.billingType ?? .manual)
        self._rateFullDay = State(initialValue: c?.rateFullDay.map { "\($0)" } ?? "")
        self._rateHalfDay = State(initialValue: c?.rateHalfDay.map { "\($0)" } ?? "")
        self._rateHourly = State(initialValue: c?.rateHourly.map { "\($0)" } ?? "")
        self._paysSuper = State(initialValue: c?.paysSuper ?? false)
        self._superRate = State(initialValue: c.map { "\($0.superRate)" } ?? "0.12")
        self._invoiceFrequency = State(initialValue: c?.invoiceFrequency ?? .perJob)
        self._address = State(initialValue: c?.address ?? "")
        self._suburb = State(initialValue: c?.suburb ?? "")
        self._email = State(initialValue: c?.email ?? "")
        self._abn = State(initialValue: c?.abn ?? "")
        self._notes = State(initialValue: c?.notes ?? "")
        self._isActive = State(initialValue: c?.isActive ?? true)
    }

    var body: some View {
        Form {
            Section("Client Details") {
                TextField("Name", text: $name)
                TextField("Address", text: $address)
                TextField("Suburb", text: $suburb)
                TextField("Email", text: $email)
                TextField("ABN", text: $abn)
            }

            Section("Billing") {
                Picker("Billing Type", selection: $billingType) {
                    ForEach(BillingType.allCases, id: \.self) { type in
                        Text(type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized).tag(type)
                    }
                }

                Picker("Invoice Frequency", selection: $invoiceFrequency) {
                    ForEach(InvoiceFrequency.allCases, id: \.self) { freq in
                        Text(freq.rawValue.replacingOccurrences(of: "_", with: " ").capitalized).tag(freq)
                    }
                }

                if billingType == .dayRate {
                    TextField("Full Day Rate ($)", text: $rateFullDay)
                    TextField("Half Day Rate ($)", text: $rateHalfDay)
                }
                if billingType == .hourly {
                    TextField("Hourly Rate ($)", text: $rateHourly)
                }
            }

            Section("Superannuation") {
                Toggle("Pays Super", isOn: $paysSuper)
                if paysSuper {
                    TextField("Super Rate", text: $superRate)
                }
            }

            Section {
                Toggle("Active", isOn: $isActive)
                TextField("Notes", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }

            Section {
                Button(isNew ? "Create Client" : "Save Changes") {
                    save()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .formStyle(.grouped)
        .navigationTitle(isNew ? "New Client" : name)
    }

    private func save() {
        let client = Client(
            id: clientId,
            name: name,
            billingType: billingType,
            rateFullDay: Decimal(string: rateFullDay),
            rateHalfDay: Decimal(string: rateHalfDay),
            rateHourly: Decimal(string: rateHourly),
            paysSuper: paysSuper,
            superRate: Decimal(string: superRate) ?? Decimal(0.12),
            invoiceFrequency: invoiceFrequency,
            address: address,
            suburb: suburb,
            email: email,
            abn: abn.isEmpty ? nil : abn,
            notes: notes.isEmpty ? nil : notes,
            isActive: isActive,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        Task {
            await vm.saveClient(client, isNew: isNew)
            dismiss()
        }
    }
}
