import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var settings: UserSettings
    @Published var supabaseURL: String
    @Published var supabaseAnonKey: String
    @Published var email: String = ""
    @Published var password: String = ""
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

    func saveSettings() {
        settings.save()
        successMessage = "Settings saved"
        Task {
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
