import SwiftUI

struct LoginView: View {
    @StateObject private var vm = LoginViewModel()

    var body: some View {
        VStack(spacing: 24) {
            Text("Invoicing").font(.largeTitle).fontWeight(.bold)

            Picker("", selection: $vm.isSignUp) {
                Text("Sign In").tag(false)
                Text("Sign Up").tag(true)
            }
            .pickerStyle(.segmented)
            .frame(width: 240)

            VStack(spacing: 12) {
                TextField("Email", text: $vm.email)
                SecureField("Password", text: $vm.password)
            }
            .textFieldStyle(.roundedBorder)
            .frame(width: 300)

            if let message = vm.infoMessage {
                Text(message)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(width: 300)
            }
            if let error = vm.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(width: 300)
            }

            Button(vm.isSignUp ? "Create Account" : "Sign In") {
                Task { vm.isSignUp ? await vm.signUp() : await vm.signIn() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(vm.isLoading)
        }
        .frame(width: 500, height: 400)
        .padding()
    }
}
