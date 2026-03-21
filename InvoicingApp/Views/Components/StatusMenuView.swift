import SwiftUI

struct StatusMenuView: View {
    let invoice: Invoice
    let onChange: (InvoiceStatus) -> Void

    @State private var showingMenu = false

    var body: some View {
        HStack(spacing: 3) {
            Text(invoice.status.rawValue.capitalized)
                .font(.caption)
                .fontWeight(.medium)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 6, weight: .bold))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
        .background(statusColor.opacity(0.2))
        .foregroundStyle(statusColor)
        .clipShape(Capsule())
        .onTapGesture {
            showingMenu = true
        }
        .popover(isPresented: $showingMenu, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(InvoiceStatus.allCases, id: \.self) { status in
                    Button {
                        showingMenu = false
                        onChange(status)
                    } label: {
                        HStack {
                            Text(status.rawValue.capitalized)
                            Spacer()
                            if status == invoice.status {
                                Image(systemName: "checkmark")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if status != InvoiceStatus.allCases.last {
                        Divider()
                    }
                }
            }
            .padding(.vertical, 4)
            .frame(width: 120)
        }
    }

    private var statusColor: Color {
        switch invoice.status {
        case .draft: .gray
        case .issued: .orange
        case .paid: .green
        }
    }
}
