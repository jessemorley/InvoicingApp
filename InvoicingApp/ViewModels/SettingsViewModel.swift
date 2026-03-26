import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var settings: UserSettings
    @Published var supabaseURL: String
    @Published var supabaseAnonKey: String
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var nextInvoiceNumber: Int = 0
    private var loadedInvoiceNumber: Int = 0  // tracks what was fetched; 0 means not yet loaded
    @Published var isSaving = false
    @Published var isSigningIn = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let supabase = SupabaseService.shared

    init() {
        self.settings = UserSettings.load()
        self.supabaseURL = UserDefaults.standard.string(forKey: "supabaseURL") ?? ""
        self.supabaseAnonKey = UserDefaults.standard.string(forKey: "supabaseAnonKey") ?? ""
    }

    func loadNextNumber() async {
        do {
            let lastNumber = try await supabase.fetchLastInvoiceNumber()
            if lastNumber >= 0 {
                nextInvoiceNumber = lastNumber + 1
                loadedInvoiceNumber = nextInvoiceNumber
            }
        } catch {
            // Non-critical — field just won't populate
        }
        do {
            settings.includeSuperInTotals = try await supabase.fetchIncludeSuperInTotals()
            settings.save()
        } catch {
            // Non-critical — local value is used as fallback
        }
    }

    func saveSettings() {
        settings.save()
        Task {
            do {
                if nextInvoiceNumber > 0 {
                    try await supabase.updateLastInvoiceNumber(nextInvoiceNumber - 1)
                }
                try await supabase.updateIncludeSuperInTotals(settings.includeSuperInTotals)
            } catch {
                errorMessage = error.localizedDescription
                return
            }
            successMessage = "Settings saved"
            try? await Task.sleep(for: .seconds(2))
            successMessage = nil
        }
    }

    func saveSupabaseConfig() {
        UserDefaults.standard.set(supabaseURL, forKey: "supabaseURL")
        UserDefaults.standard.set(supabaseAnonKey, forKey: "supabaseAnonKey")
        supabase.setupClient()
        successMessage = "Supabase configuration saved"
        Task {
            try? await Task.sleep(for: .seconds(2))
            successMessage = nil
        }
    }

    func signIn() async {
        isSigningIn = true
        errorMessage = nil
        do {
            try await supabase.signIn(email: email, password: password)
            successMessage = "Signed in successfully"
        } catch {
            errorMessage = error.localizedDescription
        }
        isSigningIn = false
    }

    func signOut() async {
        do {
            try await supabase.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
