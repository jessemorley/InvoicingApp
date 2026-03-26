import Foundation
import AppKit

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var settings: UserSettings
    @Published var nextInvoiceNumber: Int = 0
    private var loadedInvoiceNumber: Int = 0
    private var loadedInvoicePrefix: String = ""

    @Published var errorMessage: String?

    private let supabase = SupabaseService.shared
    private var saveTask: Task<Void, Never>?
    private var businessDetailsUserId: UUID?
    private var loadedBusinessDetails: BusinessDetailsRecord?

    init() {
        self.settings = UserSettings.load()
    }

    func loadData() async {
        // Reset state so previous user's data doesn't show during fetch
        businessDetailsUserId = nil
        loadedBusinessDetails = nil
        loadedInvoicePrefix = ""
        settings = UserSettings.load()

        do {
            let seq = try await supabase.fetchInvoiceSequence()
            if seq.lastNumber >= 0 {
                nextInvoiceNumber = seq.lastNumber + 1
                loadedInvoiceNumber = nextInvoiceNumber
            }
            settings.invoicePrefix = seq.prefix
            loadedInvoicePrefix = seq.prefix
            settings.save()
        } catch {}

        do {
            settings.includeSuperInTotals = try await supabase.fetchIncludeSuperInTotals()
            settings.save()
        } catch {}

        await syncBusinessDetailsFromSupabase()
    }

    private func syncBusinessDetailsFromSupabase() async {
        do {
            guard let record = try await supabase.fetchBusinessDetails() else { return }

            // Verify the fetched row belongs to the current session —
            // guards against stale session returning the previous user's row
            let currentUserId = try await supabase.currentUserId()
            guard record.userId == currentUserId else { return }

            businessDetailsUserId = record.userId
            loadedBusinessDetails = record
            settings.name = record.name
            settings.businessName = record.businessName
            settings.abn = record.abn
            settings.address = record.address
            settings.bsb = record.bsb
            settings.accountNumber = record.accountNumber
            settings.superFund = record.superFund
            settings.superMemberNumber = record.superMemberNumber
            settings.superFundAbn = record.superFundAbn
            settings.superUsi = record.superUsi
            settings.save()
        } catch {}
    }

    func autoSave() {
        settings.save()

        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .seconds(0.8))
            guard !Task.isCancelled else { return }
            do {
                if nextInvoiceNumber > 0 && nextInvoiceNumber != loadedInvoiceNumber {
                    try await supabase.updateLastInvoiceNumber(nextInvoiceNumber - 1)
                    loadedInvoiceNumber = nextInvoiceNumber
                }
                if settings.invoicePrefix != loadedInvoicePrefix {
                    try await supabase.updateInvoicePrefix(settings.invoicePrefix)
                    loadedInvoicePrefix = settings.invoicePrefix
                }
                try await supabase.updateIncludeSuperInTotals(settings.includeSuperInTotals)
            } catch is CancellationError {
                // Task was cancelled (e.g. window closed) — not an error
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func saveBusinessDetails() async {
        guard let userId = businessDetailsUserId else { return }
        let updated = BusinessDetailsRecord(
            userId: userId,
            name: settings.name,
            businessName: settings.businessName,
            abn: settings.abn,
            address: settings.address,
            bsb: settings.bsb,
            accountNumber: settings.accountNumber,
            superFund: settings.superFund,
            superMemberNumber: settings.superMemberNumber,
            superFundAbn: settings.superFundAbn,
            superUsi: settings.superUsi
        )
        guard updated != loadedBusinessDetails else { return }
        do {
            try await supabase.updateBusinessDetails(updated)
            loadedBusinessDetails = updated
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        // Close the Settings window before signing out
        NSApp.windows.first(where: { $0.title == "Settings" })?.close()
        do {
            try await supabase.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
