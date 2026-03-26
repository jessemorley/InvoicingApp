import SwiftUI

struct LoginView: View {
    @StateObject private var vm = LoginViewModel()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(nsColor: .windowBackgroundColor), Color(nsColor: .controlBackgroundColor)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

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
            .padding(36)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(.white.opacity(0.12), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.15), radius: 24, x: 0, y: 8)
            .padding(40)
        }
        .frame(width: 420, height: 520)
    }
}
