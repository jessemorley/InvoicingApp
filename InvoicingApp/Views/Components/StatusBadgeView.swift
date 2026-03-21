import SwiftUI

struct StatusBadgeView: View {
    let status: InvoiceStatus

    var body: some View {
        Text(status.rawValue.capitalized)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(backgroundColor)
            .foregroundStyle(foregroundColor)
            .clipShape(Capsule())
    }

    private var backgroundColor: Color {
        switch status {
        case .draft: .gray.opacity(0.2)
        case .issued: .orange.opacity(0.2)
        case .paid: .green.opacity(0.2)
        }
    }

    private var foregroundColor: Color {
        switch status {
        case .draft: .gray
        case .issued: .orange
        case .paid: .green
        }
    }
}
