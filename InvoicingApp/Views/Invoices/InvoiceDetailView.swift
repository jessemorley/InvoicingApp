import SwiftUI
import WebKit

struct HTMLPreviewView: NSViewRepresentable {
    let html: String
    func makeNSView(context: Context) -> WKWebView { WKWebView() }
    func updateNSView(_ nsView: WKWebView, context: Context) {
        nsView.loadHTMLString(html, baseURL: nil)
    }
}

struct InvoiceDetailView: View {
    @StateObject private var vm: InvoiceDetailViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirmation = false
    @State private var showPreview = false

    init(invoice: Invoice) {
        self._vm = StateObject(wrappedValue: InvoiceDetailViewModel(invoice: invoice))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    VStack(alignment: .leading) {
                        Text("Invoice \(vm.invoice.invoiceNumber)")
                            .font(.title)
                        Text(vm.client?.name ?? "")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    StatusBadgeView(status: vm.invoice.status)
                }

                // Dates
                HStack(spacing: 24) {
                    LabeledContent("Issued") {
                        Text(vm.invoice.issuedDateValue, style: .date)
                    }
                    LabeledContent("Due") {
                        Text(vm.invoice.dueDateValue, style: .date)
                    }
                }

                Divider()

                // Line items
                VStack(spacing: 0) {
                    HStack {
                        Text("Date").font(.caption.bold())
                            .frame(width: 110, alignment: .leading)
                        Text("Description").font(.caption.bold())
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Hours").font(.caption.bold())
                            .frame(width: 45, alignment: .trailing)
                        Text("Rate").font(.caption.bold())
                            .frame(width: 45, alignment: .trailing)
                        Text("Amount").font(.caption.bold())
                            .frame(width: 80, alignment: .trailing)
                    }
                    .padding(.vertical, 8)

                    Divider()

                    ForEach(vm.entries) { entry in
                        HStack {
                            Text(entryDateString(entry))
                                .frame(width: 110, alignment: .leading)
                            Text(entryDescriptionOnly(entry))
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(entryHoursString(entry))
                                .frame(width: 45, alignment: .trailing)
                            Text(entryRateString(entry))
                                .frame(width: 45, alignment: .trailing)
                            Text(formatAmount(entry.baseAmount + entry.bonusAmount))
                                .frame(width: 80, alignment: .trailing)
                        }
                        .padding(.vertical, 4)

                        if entry.billingTypeSnapshot == .hourly,
                           let start = entry.startTime, let finish = entry.finishTime {
                            HStack {
                                Text("").frame(width: 110)
                                Text(entryTimeSubLine(start, finish, breakMinutes: entry.breakMinutes))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.bottom, 2)
                        }
                    }

                    Divider()

                    // Totals
                    VStack(alignment: .trailing, spacing: 4) {
                        HStack {
                            Spacer()
                            Text("Subtotal")
                            Text(formatAmount(vm.invoice.subtotal))
                                .frame(width: 80, alignment: .trailing)
                        }
                        if vm.invoice.superAmount > 0 {
                            HStack {
                                Spacer()
                                Text("Super")
                                Text(formatAmount(vm.invoice.superAmount))
                                    .frame(width: 80, alignment: .trailing)
                            }
                        }
                        HStack {
                            Spacer()
                            Text("Total").fontWeight(.bold)
                            Text(formatAmount(vm.invoice.total))
                                .fontWeight(.bold)
                                .frame(width: 80, alignment: .trailing)
                        }
                    }
                    .padding(.top, 8)
                }

                Divider()

                // Actions
                HStack(spacing: 12) {
                    Button("Mark as \(nextStatusLabel)") {
                        Task { await vm.cycleStatus() }
                    }
                    .buttonStyle(.bordered)

                    Button("Preview") {
                        showPreview = true
                    }
                    .buttonStyle(.bordered)

                    Button("Export PDF") {
                        Task { await vm.exportPDF() }
                    }
                    .buttonStyle(.borderedProminent)

                    Spacer()

                    Button("Delete Invoice", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(24)
        }
        .navigationTitle("Invoice \(vm.invoice.invoiceNumber)")
        .task { await vm.loadDetails() }
        .sheet(isPresented: $showPreview) {
            VStack(spacing: 0) {
                HStack {
                    Text("Invoice \(vm.invoice.invoiceNumber)")
                        .font(.headline)
                    Spacer()
                    Button("Done") { showPreview = false }
                }
                .padding(12)
                Divider()
                if let html = vm.previewHTML() {
                    HTMLPreviewView(html: html)
                }
            }
            .frame(width: 700, height: 900)
        }
        .confirmationDialog(
            "Delete invoice \(vm.invoice.invoiceNumber)?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete invoice only (keep entries)") {
                Task {
                    if await vm.deleteInvoice(deleteEntries: false) {
                        dismiss()
                    }
                }
            }
            Button("Delete invoice and entries", role: .destructive) {
                Task {
                    if await vm.deleteInvoice(deleteEntries: true) {
                        dismiss()
                    }
                }
            }
        } message: {
            Text("What would you like to do with the linked entries?")
        }
    }

    private var nextStatusLabel: String {
        switch vm.invoice.status {
        case .draft: "Issued"
        case .issued: "Paid"
        case .paid: "Draft"
        }
    }

    private func entryDateString(_ entry: Entry) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: entry.dateValue)
    }

    private func entryDescriptionOnly(_ entry: Entry) -> String {
        switch entry.billingTypeSnapshot {
        case .dayRate:
            if let workflow = entry.workflowType {
                if workflow == "Own Brand" { return entry.brand ?? "Own Brand" }
                return workflow
            }
            return "Creative Assist"
        case .hourly:
            if let shootClient = entry.shootClient {
                return "\(shootClient) (\(abbreviateRole(entry.role)))"
            }
            return entry.description ?? ""
        case .manual:
            return entry.description ?? ""
        }
    }

    private func entryHoursString(_ entry: Entry) -> String {
        guard entry.billingTypeSnapshot == .hourly, let hours = entry.hoursWorked else { return "" }
        return "\(NSDecimalNumber(decimal: hours))"
    }

    private func entryRateString(_ entry: Entry) -> String {
        guard entry.billingTypeSnapshot == .hourly,
              let rate = vm.client?.rateHourly else { return "" }
        return formatRate(rate)
    }

    private func entryTimeSubLine(_ start: String, _ finish: String, breakMinutes: Int?) -> String {
        var str = "\(formatTime(start)) – \(formatTime(finish))"
        if let brk = breakMinutes, brk > 0 {
            str += " (\(brk)m)"
        }
        return str
    }

    private func formatRate(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }

    private func formatAmount(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "0.00"
    }

    private func abbreviateRole(_ role: String?) -> String {
        switch role?.lowercased() {
        case "photographer": return "P"
        case "operator":     return "O"
        default:             return role ?? ""
        }
    }

    private func formatTime(_ t: String) -> String {
        let parts = t.split(separator: ":")
        guard parts.count >= 2, let hour = Int(parts[0]), let minute = Int(parts[1]) else { return t }
        return String(format: "%d:%02d", hour, minute)
    }
}
