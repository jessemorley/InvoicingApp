import SwiftUI
import UniformTypeIdentifiers

struct ImportView: View {
    @StateObject private var vm = ImportViewModel()
    @State private var showConfirmation = false
    @State private var showRollbackConfirmation = false

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section("CSV Files") {
                    HStack {
                        if let url = vm.entriesFileURL {
                            Label(url.lastPathComponent, systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Label("No entries file selected", systemImage: "doc")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Choose...") { pickFile { url in vm.entriesFileURL = url; vm.validationResult = nil } }
                    }

                    HStack {
                        if let url = vm.invoicesFileURL {
                            Label(url.lastPathComponent, systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Label("No invoices file selected", systemImage: "doc")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Choose...") { pickFile { url in vm.invoicesFileURL = url; vm.validationResult = nil } }
                    }
                }

                Section {
                    Button {
                        Task { await vm.runDryRun() }
                    } label: {
                        HStack {
                            Text("Run Dry Run")
                            if vm.isValidating {
                                Spacer()
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }
                    }
                    .disabled(!vm.filesSelected || vm.isValidating || vm.importComplete)
                }

                if let result = vm.validationResult {
                    Section("Validation Results") {
                        if result.isValid {
                            Label("\(result.entriesCount) entries ready to import", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Label("\(result.invoicesCount) invoices ready to import", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }

                        if !result.errors.isEmpty {
                            Label("\(result.errors.count) error(s) — import blocked", systemImage: "xmark.circle.fill")
                                .foregroundStyle(.red)
                        }

                        if !result.warnings.isEmpty {
                            Label("\(result.warnings.count) warning(s)", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                        }
                    }

                    if !result.clientSummaries.isEmpty {
                        Section("By Client") {
                            ForEach(result.clientSummaries) { summary in
                                HStack {
                                    Text(summary.name)
                                    Spacer()
                                    Text("\(summary.entryCount) entries")
                                        .foregroundStyle(.secondary)
                                    Text("·")
                                        .foregroundStyle(.secondary)
                                    Text("\(summary.invoiceCount) inv")
                                        .foregroundStyle(.secondary)
                                    Text("·")
                                        .foregroundStyle(.secondary)
                                    Text(summary.total, format: .currency(code: "AUD"))
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    if !result.errors.isEmpty {
                        Section("Errors") {
                            ForEach(result.errors, id: \.self) { error in
                                Text(error)
                                    .foregroundStyle(.red)
                                    .font(.caption)
                            }
                        }
                    }

                    if !result.warnings.isEmpty {
                        Section("Warnings") {
                            ForEach(result.warnings, id: \.self) { warning in
                                Text(warning)
                                    .foregroundStyle(.orange)
                                    .font(.caption)
                            }
                        }
                    }

                    if result.isValid {
                        Section {
                            Button {
                                showConfirmation = true
                            } label: {
                                HStack {
                                    Text("Import to Database")
                                    if vm.isImporting {
                                        Spacer()
                                        ProgressView()
                                            .controlSize(.small)
                                    }
                                }
                            }
                            .disabled(!vm.canImport || vm.isImporting)
                            .buttonStyle(.borderedProminent)
                        }
                    }
                }

                if let summary = vm.importSummary {
                    Section {
                        Label(summary, systemImage: vm.rolledBack ? "arrow.uturn.backward.circle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(vm.rolledBack ? .orange : .green)
                    }
                }

                if vm.canRollback {
                    Section {
                        Button {
                            showRollbackConfirmation = true
                        } label: {
                            HStack {
                                Text("Rollback Import")
                                if vm.isRollingBack {
                                    Spacer()
                                    ProgressView()
                                        .controlSize(.small)
                                }
                            }
                        }
                        .disabled(vm.isRollingBack)
                        .foregroundStyle(.red)
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
        }
        .frame(minWidth: 500, minHeight: 400)
        .navigationTitle("Import Historical Data")
        .alert("Confirm Import", isPresented: $showConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Import") {
                Task { await vm.executeImport() }
            }
        } message: {
            if let result = vm.validationResult {
                Text("This will insert \(result.entriesCount) entries and \(result.invoicesCount) invoices into the live database.")
            }
        }
        .alert("Confirm Rollback", isPresented: $showRollbackConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete All Imported Data", role: .destructive) {
                Task { await vm.rollbackImport() }
            }
        } message: {
            Text("This will delete all entries and invoices that were just imported.")
        }
    }

    private func pickFile(completion: @escaping (URL) -> Void) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.commaSeparatedText]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.begin { response in
            if response == .OK, let url = panel.url {
                completion(url)
            }
        }
    }
}
