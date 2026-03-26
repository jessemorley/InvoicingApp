import Foundation

@MainActor
final class LoginViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var isSignUp = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?

    func signIn() async {
        isLoading = true; errorMessage = nil; infoMessage = nil
        do { try await SupabaseService.shared.signIn(email: email, password: password) }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func signUp() async {
        isLoading = true; errorMessage = nil; infoMessage = nil
        do {
            try await SupabaseService.shared.signUp(email: email, password: password)
            infoMessage = "Check your email for a confirmation link. Once confirmed, sign in here."
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}
