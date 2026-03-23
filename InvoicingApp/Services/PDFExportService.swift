import AppKit
import WebKit

@MainActor
final class PDFExportService {

    func exportPDF(invoice: Invoice, entries: [Entry], client: Client) async throws -> URL {
        let settings = UserSettings.load()
        let html = buildHTML(invoice: invoice, entries: entries, client: client, settings: settings)

        let outputDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/Invoices")
        try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
        let outputURL = outputDir.appendingPathComponent("\(invoice.invoiceNumber).pdf")

        try await renderHTMLToPDF(html: html, outputURL: outputURL)

        NSWorkspace.shared.open(outputURL)
        return outputURL
    }

    private func renderHTMLToPDF(html: String, outputURL: URL) async throws {
        // A4 at 96 DPI = 794 × 1123 points; HTML padding handles margins
        let pageWidth: CGFloat = 794
        let pageHeight: CGFloat = 1123

        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
        webView.loadHTMLString(html, baseURL: nil)

        // Wait for page to load
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let delegate = WebViewLoadDelegate {
                continuation.resume()
            } onError: { error in
                continuation.resume(throwing: error)
            }
            webView.navigationDelegate = delegate
            // Keep delegate alive
            objc_setAssociatedObject(webView, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN)
        }

        // Allow layout to settle
        try await Task.sleep(nanoseconds: 200_000_000)

        let pdfConfig = WKPDFConfiguration()
        pdfConfig.rect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)

        let pdfData: Data = try await withCheckedThrowingContinuation { continuation in
            webView.createPDF(configuration: pdfConfig) { result in
                switch result {
                case .success(let data):
                    continuation.resume(returning: data)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
        try pdfData.write(to: outputURL, options: Data.WritingOptions.atomic)
    }

    // MARK: - HTML Generation

    func buildHTML(invoice: Invoice, entries: [Entry], client: Client, settings: UserSettings) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "MMM d, yyyy"

        let issuedStr = dateFormatter.string(from: invoice.issuedDateValue)
        let dueStr = dateFormatter.string(from: invoice.dueDateValue)

        let lineItems = buildLineItems(entries: entries, client: client)

        let superRatePct = NSDecimalNumber(decimal: client.superRate * 100).intValue
        let superRow = client.paysSuper
            ? "<div class=\"totals-row\"><span class=\"label\">Super (\(superRatePct)%)</span><span class=\"value\">\(formatCurrency(invoice.superAmount))</span></div>"
            : ""

        let superMetaLines = client.paysSuper ? """
            <p>\(settings.superFund), Member \(settings.superMemberNumber), ABN \(settings.superFundAbn)</p>
            <p>USI \(settings.superUsi)</p>
            """ : ""

        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <style>
            body { margin: 0; padding: 28px 42px; font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color: #000; line-height: 1.2; }
            .page { width: 100%; background: white; }
            .top-header { display: flex; justify-content: space-between; margin-bottom: 80px; }
            .address-block { font-size: 13.5px; }
            .address-block p { margin: 0 0 3px 0; }
            .invoice-title { font-size: 52px; font-weight: 500; margin: 0 0 70px 0; letter-spacing: -1px; }
            .meta-container { display: flex; margin-bottom: 120px; font-size: 13.5px; }
            .dates-block { width: 28%; }
            .dates-block p { margin: 0 0 4px 0; }
            .bank-block { flex-grow: 1; }
            .bank-block p { margin: 0 0 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 100px; }
            th { text-align: left; padding: 10px 0; font-size: 13.5px; font-weight: normal; }
            td { padding: 6px 0; vertical-align: top; font-size: 13.5px; }
            .col-date { width: 28%; }
            .col-item { width: 39%; }
            .col-qty { width: 11%; text-align: right; }
            .col-rate { width: 11%; text-align: right; }
            .col-amount { width: 11%; text-align: right; }
            .totals-section { display: flex; flex-direction: column; align-items: flex-end; font-size: 13.5px; }
            .totals-row { display: flex; justify-content: space-between; width: 100%; padding: 4px 0; }
            .totals-row.grand-total { margin-top: 40px; }
            .label { text-align: left; }
            .value { text-align: right; width: 100px; }
        </style>
        </head>
        <body>
        <div class="page">
            <div class="top-header">
                <div class="address-block">
                    <p>\(settings.businessName)</p>
                    <p>ABN \(settings.abn)</p>
                    <p>\(settings.address)</p>
                </div>
                <div class="address-block">
                    <p>\(client.name)</p>
                    <p>\(client.email)</p>
                    <p>\(client.address)</p>
                    <p>\(client.suburb)</p>
                </div>
            </div>
            <h1 class="invoice-title">Invoice \(invoice.invoiceNumber)</h1>
            <div class="meta-container">
                <div class="dates-block">
                    <p>Issued \(issuedStr)</p>
                    <p>Due \(dueStr)</p>
                </div>
                <div class="bank-block">
                    <p>BSB \(settings.bsb) Account Number \(settings.accountNumber)</p>
                    \(superMetaLines)
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th class="col-date">Item</th>
                        <th class="col-item"></th>
                        <th class="col-qty">Qty</th>
                        <th class="col-rate">Rate</th>
                        <th class="col-amount">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    \(lineItems)
                </tbody>
            </table>
            <div class="totals-section">
                <div class="totals-row">
                    <span class="label">Subtotal</span>
                    <span class="value">\(formatCurrency(invoice.subtotal))</span>
                </div>
                \(superRow)
                <div class="totals-row grand-total">
                    <span class="label">Total</span>
                    <span class="value">\(formatCurrency(invoice.total))</span>
                </div>
            </div>
        </div>
        </body>
        </html>
        """
    }

    private func buildLineItems(entries: [Entry], client: Client) -> String {
        let sortedEntries = entries.sorted { $0.date < $1.date }
        var html = ""
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "EEE, MMM d"

        for entry in sortedEntries {
            let dateStr = dayFormatter.string(from: entry.dateValue)
            let description: String
            let rate: String
            let amount: String

            let qty: String
            switch entry.billingTypeSnapshot {
            case .dayRate:
                if entry.workflowType == "Own Brand" {
                    description = entry.brand ?? "Own Brand"
                } else if let workflow = entry.workflowType {
                    description = workflow
                } else {
                    description = "Creative Assist"
                }
                qty = "1"
                rate = formatCurrency(entry.baseAmount)
                amount = formatCurrency(entry.baseAmount)

            case .hourly:
                let hoursStr = entry.hoursWorked.map { "\(NSDecimalNumber(decimal: $0))h" } ?? ""
                if let shootClient = entry.shootClient {
                    let role = entry.role ?? "Photographer"
                    description = "\(shootClient) (\(role)) \(hoursStr)"
                } else {
                    description = "\(entry.description ?? "") \(hoursStr)"
                }
                qty = "1"
                rate = formatCurrency(client.rateHourly ?? 0) + "/hr"
                amount = formatCurrency(entry.baseAmount)

            case .manual:
                description = entry.description ?? ""
                qty = "1"
                rate = ""
                amount = formatCurrency(entry.baseAmount)
            }

            html += "<tr><td class=\"col-date\">\(dateStr)</td><td class=\"col-item\">\(description)</td><td class=\"col-qty\">\(qty)</td><td class=\"col-rate\">\(rate)</td><td class=\"col-amount\">\(amount)</td></tr>\n"

            // SKU bonus sub-line
            if entry.bonusAmount > 0, let skus = entry.skus {
                html += "<tr><td class=\"col-date\"></td><td class=\"col-item\">&nbsp;&nbsp;+ SKU bonus (\(skus) SKUs)</td><td class=\"col-qty\"></td><td class=\"col-rate\"></td><td class=\"col-amount\">\(formatCurrency(entry.bonusAmount))</td></tr>\n"
            }
        }

        return html
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "AUD"
        formatter.currencySymbol = "$"
        return formatter.string(from: value as NSDecimalNumber) ?? "$0.00"
    }
}

// MARK: - WKWebView Load Delegate

private class WebViewLoadDelegate: NSObject, WKNavigationDelegate {
    let onLoad: () -> Void
    let onError: (Error) -> Void

    init(onLoad: @escaping () -> Void, onError: @escaping (Error) -> Void) {
        self.onLoad = onLoad
        self.onError = onError
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onLoad()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        onError(error)
    }
}
