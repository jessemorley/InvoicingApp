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
        // A4 at 72 DPI = 595 × 842 points
        let pageWidth: CGFloat = 595
        let pageHeight: CGFloat = 842
        let margin: CGFloat = 36

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
        pdfConfig.rect = CGRect(
            x: margin, y: margin,
            width: pageWidth - margin * 2,
            height: pageHeight - margin * 2
        )

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

    private func buildHTML(invoice: Invoice, entries: [Entry], client: Client, settings: UserSettings) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "d MMMM yyyy"

        let lineItems = buildLineItems(entries: entries, client: client)
        let showSuperFooter = client.paysSuper

        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <style>
            body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11px; color: #333; margin: 0; padding: 40px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .header-left h1 { font-size: 16px; margin: 0 0 4px 0; }
            .header-left p { margin: 2px 0; color: #666; }
            .header-right { text-align: right; }
            .header-right h2 { font-size: 14px; margin: 0 0 4px 0; }
            .header-right p { margin: 2px 0; color: #666; }
            .dates { margin-bottom: 24px; }
            .dates p { margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            thead th { text-align: left; border-top: 1px solid #999; border-bottom: 1px solid #999; padding: 8px 4px; font-weight: 600; }
            thead th.right { text-align: right; }
            tbody td { padding: 4px; border-bottom: 1px solid #eee; }
            tbody td.right { text-align: right; }
            tbody td.bonus-line { padding-left: 20px; color: #666; font-size: 10px; }
            .totals { margin-left: auto; width: 250px; }
            .totals table { margin-bottom: 0; }
            .totals td { border-bottom: none; padding: 4px 8px; }
            .totals td.right { font-weight: 500; }
            .totals tr.total td { border-top: 2px solid #333; font-weight: 700; font-size: 13px; }
            .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ccc; font-size: 10px; color: #666; }
        </style>
        </head>
        <body>
        <div class="header">
            <div class="header-left">
                <h1>\(settings.businessName)</h1>
                <p>ABN \(settings.abn)</p>
                <p>\(settings.address)</p>
            </div>
            <div class="header-right">
                <h2>Invoice \(invoice.invoiceNumber)</h2>
                <p>\(client.name)</p>
                <p>\(client.email)</p>
                <p>\(client.address)</p>
                <p>\(client.suburb)</p>
            </div>
        </div>
        <div class="dates">
            <p>Issued \(dateFormatter.string(from: invoice.issuedDateValue))</p>
            <p>Due \(dateFormatter.string(from: invoice.dueDateValue))</p>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th class="right">Qty</th>
                    <th class="right">Rate</th>
                    <th class="right">Amount</th>
                </tr>
            </thead>
            <tbody>
                \(lineItems)
            </tbody>
        </table>
        <div class="totals">
            <table>
                <tr><td>Subtotal</td><td class="right">\(formatCurrency(invoice.subtotal))</td></tr>
                \(client.paysSuper ? "<tr><td>Super (\(NSDecimalNumber(decimal: client.superRate * 100).intValue)%)</td><td class=\"right\">\(formatCurrency(invoice.superAmount))</td></tr>" : "")
                <tr class="total"><td>Total</td><td class="right">\(formatCurrency(invoice.total))</td></tr>
            </table>
        </div>
        \(showSuperFooter ? """
        <div class="footer">
            <p>BSB \(settings.bsb) &nbsp; Account Number \(settings.accountNumber)</p>
            <p>\(settings.superFund), Member \(settings.superMemberNumber), ABN \(settings.superFundAbn)</p>
            <p>USI \(settings.superUsi)</p>
        </div>
        """ : """
        <div class="footer">
            <p>BSB \(settings.bsb) &nbsp; Account Number \(settings.accountNumber)</p>
        </div>
        """)
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

            switch entry.billingTypeSnapshot {
            case .dayRate:
                if entry.workflowType == "Own Brand" {
                    description = "\(dateStr) \(entry.brand ?? "Own Brand")"
                } else if let workflow = entry.workflowType {
                    description = "\(dateStr) \(workflow)"
                } else {
                    description = "\(dateStr) Creative Assist"
                }
                rate = formatCurrency(entry.baseAmount)
                amount = formatCurrency(entry.baseAmount)

            case .hourly:
                let hoursStr = entry.hoursWorked.map { "\(NSDecimalNumber(decimal: $0))h" } ?? ""
                if let shootClient = entry.shootClient {
                    let role = entry.role ?? "Photographer"
                    description = "\(dateStr) \(shootClient) (\(role)) \(hoursStr)"
                } else {
                    description = "\(dateStr) \(entry.description ?? "") \(hoursStr)"
                }
                rate = formatCurrency(client.rateHourly ?? 0) + "/hr"
                amount = formatCurrency(entry.baseAmount)

            case .manual:
                description = "\(dateStr) \(entry.description ?? "")"
                rate = ""
                amount = formatCurrency(entry.baseAmount)
            }

            html += "<tr><td>\(description)</td><td class=\"right\">1</td><td class=\"right\">\(rate)</td><td class=\"right\">\(amount)</td></tr>\n"

            // SKU bonus sub-line
            if entry.bonusAmount > 0, let skus = entry.skus {
                html += "<tr><td class=\"bonus-line\">&nbsp;&nbsp;+ SKU bonus (\(skus) SKUs)</td><td class=\"right\"></td><td class=\"right\"></td><td class=\"right\">\(formatCurrency(entry.bonusAmount))</td></tr>\n"
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
