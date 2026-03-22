import SwiftUI

struct SettingsView: View {
    var body: some View {
        TabView {
            GeneralSettingsTab()
                .tabItem {
                    Label("General", systemImage: "gear")
                }
            PersonalInfoTab()
                .tabItem {
                    Label("Personal Info", systemImage: "person")
                }
            LoginTab()
                .tabItem {
                    Label("Login", systemImage: "key")
                }
            ImportTab()
                .tabItem {
                    Label("Import", systemImage: "square.and.arrow.down")
                }
        }
        .frame(width: 500, height: 400)
    }
}

// MARK: - General

struct GeneralSettingsTab: View {
    @StateObject private var vm = SettingsViewModel()

    var body: some View {
        Form {
            Section("Invoice Numbering") {
                TextField("Prefix", text: $vm.settings.invoicePrefix)
                Stepper("Next number: \(vm.nextInvoiceNumber)",
                        value: $vm.nextInvoiceNumber, in: 1...99999)
                LabeledContent("Next invoice") {
                    Text("\(vm.settings.invoicePrefix)\(vm.nextInvoiceNumber)")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Preferences") {
                Toggle("Mark invoice as issued when exported as PDF", isOn: $vm.settings.markIssuedOnExport)
                Stepper("Due date offset: \(vm.settings.dueDateOffsetDays) days",
                        value: $vm.settings.dueDateOffsetDays, in: 7...90)
                Picker("Financial year starts", selection: $vm.settings.financialYearStartMonth) {
                    ForEach(1...12, id: \.self) { month in
                        Text(Calendar.current.monthSymbols[month - 1]).tag(month)
                    }
                }
            }

            Section {
                Button("Save") { vm.saveSettings() }
                    .buttonStyle(.borderedProminent)
            }

            if let success = vm.successMessage {
                Label(success, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
            if let error = vm.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
        .task { await vm.loadNextNumber() }
    }
}

// MARK: - Personal Info

struct PersonalInfoTab: View {
    @StateObject private var vm = SettingsViewModel()

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

            Section {
                Button("Save") { vm.saveSettings() }
                    .buttonStyle(.borderedProminent)
            }

            if let success = vm.successMessage {
                Label(success, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
            if let error = vm.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Login

struct LoginTab: View {
    @StateObject private var vm = SettingsViewModel()
    @ObservedObject var supabaseService = SupabaseService.shared

    var body: some View {
        Form {
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

            if let success = vm.successMessage {
                Label(success, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
            if let error = vm.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Import

struct ImportTab: View {
    @State private var showImport = false

    var body: some View {
        Form {
            Section("Data Import") {
                Button("Import Historical Data...") { showImport = true }
            }
        }
        .formStyle(.grouped)
        .sheet(isPresented: $showImport) {
            ImportView()
        }
    }
}
