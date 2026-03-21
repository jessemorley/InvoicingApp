import SwiftUI

struct SettingsView: View {
    @StateObject private var vm = SettingsViewModel()
    @ObservedObject var supabaseService = SupabaseService.shared
    @State private var showImport = false

    var body: some View {
        Form {
            Section("Personal Details") {
                TextField("Name", text: $vm.settings.name)
                TextField("Business Name", text: $vm.settings.businessName)
                TextField("ABN", text: $vm.settings.abn)
                TextField("Address", text: $vm.settings.address)
            }

            Section("Banking") {
                TextField("BSB", text: $vm.settings.bsb)
                TextField("Account Number", text: $vm.settings.accountNumber)
            }

            Section("Superannuation") {
                TextField("Super Fund", text: $vm.settings.superFund)
                TextField("Member Number", text: $vm.settings.superMemberNumber)
                TextField("Super Fund ABN", text: $vm.settings.superFundAbn)
                TextField("USI", text: $vm.settings.superUsi)
            }

            Section("Preferences") {
                Stepper("Due date offset: \(vm.settings.dueDateOffsetDays) days",
                        value: $vm.settings.dueDateOffsetDays, in: 7...90)
                Picker("Financial year starts", selection: $vm.settings.financialYearStartMonth) {
                    ForEach(1...12, id: \.self) { month in
                        Text(Calendar.current.monthSymbols[month - 1]).tag(month)
                    }
                }
            }

            Section {
                Button("Save Settings") { vm.saveSettings() }
                    .buttonStyle(.borderedProminent)
            }

            Section("Supabase Connection") {
                TextField("Supabase URL", text: $vm.supabaseURL)
                SecureField("Anon Key", text: $vm.supabaseAnonKey)
                Button("Save Connection") { vm.saveSupabaseConfig() }
            }

            Section("Authentication") {
                if supabaseService.isAuthenticated {
                    Label("Signed in", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Button("Sign Out") { Task { await vm.signOut() } }
                } else {
                    TextField("Email", text: $vm.email)
                    SecureField("Password", text: $vm.password)
                    Button("Sign In") { Task { await vm.signIn() } }
                        .disabled(vm.isSigningIn)
                }
            }

            Section("Data Import") {
                Button("Import Historical Data...") { showImport = true }
            }

            if let success = vm.successMessage {
                Section {
                    Label(success, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            if let error = vm.errorMessage {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        .sheet(isPresented: $showImport) {
            ImportView()
        }
    }
}
