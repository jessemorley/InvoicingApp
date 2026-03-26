import SwiftUI

struct SettingsView: View {
    @StateObject private var vm = SettingsViewModel()
    @ObservedObject private var supabase = SupabaseService.shared

    var body: some View {
        TabView {
            GeneralSettingsTab(vm: vm)
                .tabItem {
                    Label("General", systemImage: "gear")
                }
            PersonalInfoTab(vm: vm)
                .tabItem {
                    Label("Personal Info", systemImage: "person")
                }
            AccountTab(vm: vm)
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
            ImportTab()
                .tabItem {
                    Label("Import", systemImage: "square.and.arrow.down")
                }
        }
        .task { await vm.loadData() }
        .onChange(of: supabase.currentEmail) { _, _ in
            Task { await vm.loadData() }
        }
    }
}

// MARK: - General

struct GeneralSettingsTab: View {
    @ObservedObject var vm: SettingsViewModel

    var body: some View {
        Form {
            Section("Invoice Numbering") {
                TextField("Prefix", text: $vm.settings.invoicePrefix)
                LabeledContent("Next number") {
                    TextField("", value: $vm.nextInvoiceNumber, format: .number)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }
                LabeledContent("Next invoice") {
                    Text("\(vm.settings.invoicePrefix)\(vm.nextInvoiceNumber)")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Preferences") {
                Toggle("Include super in totals", isOn: $vm.settings.includeSuperInTotals)
                Toggle("Mark invoice as issued when exported as PDF", isOn: $vm.settings.markIssuedOnExport)
                Stepper("Due date offset: \(vm.settings.dueDateOffsetDays) days",
                        value: $vm.settings.dueDateOffsetDays, in: 7...90)
                Picker("Financial year starts", selection: $vm.settings.financialYearStartMonth) {
                    ForEach(1...12, id: \.self) { month in
                        Text(Calendar.current.monthSymbols[month - 1]).tag(month)
                    }
                }
            }

            if let error = vm.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
        .textFieldStyle(.roundedBorder)
        .frame(width: 450)
        .fixedSize(horizontal: false, vertical: true)
        .onChange(of: vm.settings) { _, _ in
            vm.autoSave()
            Task { await vm.saveBusinessDetails() }
        }
        .onChange(of: vm.nextInvoiceNumber) { _, _ in vm.autoSave() }
    }
}

// MARK: - Personal Info

struct PersonalInfoTab: View {
    @ObservedObject var vm: SettingsViewModel

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

            if let error = vm.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
        .textFieldStyle(.roundedBorder)
        .frame(width: 450)
        .fixedSize(horizontal: false, vertical: true)
        .onChange(of: vm.settings) { _, _ in
            vm.autoSave()
            Task { await vm.saveBusinessDetails() }
        }
    }
}

// MARK: - Account

struct AccountTab: View {
    @ObservedObject var vm: SettingsViewModel
    @ObservedObject private var supabase = SupabaseService.shared

    var body: some View {
        Form {
            Section("Account") {
                Label(supabase.currentEmail ?? "Signed in", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Button("Sign Out") { Task { await vm.signOut() } }
            }

            if let error = vm.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
        .formStyle(.grouped)
        .frame(width: 450)
        .fixedSize(horizontal: false, vertical: true)
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
        .frame(width: 450)
        .fixedSize(horizontal: false, vertical: true)
        .sheet(isPresented: $showImport) {
            ImportView()
        }
    }
}
