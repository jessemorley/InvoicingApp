import SwiftUI

struct LoginView: View {
    @StateObject private var vm = LoginViewModel()

    var body: some View {
        VStack(spacing: 28) {
                // App icon + title
                VStack(spacing: 14) {
                    Image("AppIconImage")
                        .resizable()
                        .frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 6)

                    Text("Invoicing")
                        .font(.system(size: 26, weight: .semibold, design: .rounded))
                }

                // Segmented picker
                Picker("", selection: $vm.isSignUp) {
                    Text("Sign In").tag(false)
                    Text("Sign Up").tag(true)
                }
                .pickerStyle(.segmented)
                .frame(width: 240)

                // Fields
                VStack(spacing: 10) {
                    TextField("Email", text: $vm.email)
                    SecureField("Password", text: $vm.password)
                }
                .textFieldStyle(.roundedBorder)
                .frame(width: 260)

                // Messages
                if let message = vm.infoMessage {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(width: 260)
                }
                if let error = vm.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .frame(width: 260)
                }

                // Action button
                Button {
                    Task { vm.isSignUp ? await vm.signUp() : await vm.signIn() }
                } label: {
                    Group {
                        if vm.isLoading {
                            ProgressView().controlSize(.small)
                        } else {
                            Text(vm.isSignUp ? "Create Account" : "Sign In")
                        }
                    }
                    .frame(width: 260, height: 32)
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.isLoading)
        }
        .frame(width: 420, height: 520)
        .modifier(HiddenToolbarBackgroundModifier())
    }
}

private struct HiddenToolbarBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15, *) {
            content.toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        } else {
            content
        }
    }
}
