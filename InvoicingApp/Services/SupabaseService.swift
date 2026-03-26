import Foundation
import Supabase
import Auth

/// Stores Supabase auth tokens in UserDefaults instead of Keychain
/// to avoid repeated keychain access prompts in sandboxed apps.
private struct UserDefaultsAuthStorage: AuthLocalStorage, Sendable {
    func store(key: String, value: Data) throws {
        UserDefaults.standard.set(value, forKey: key)
    }

    func retrieve(key: String) throws -> Data? {
        UserDefaults.standard.data(forKey: key)
    }

    func remove(key: String) throws {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

private enum SupabaseConfig {
    static let url = URL(string: "https://cmbycqzjlwvydemaxrtb.supabase.co")!
    static let anonKey = "sb_publishable_UYYQBD6MkiRxpv7Z_-sIGA_riCDJQzD"
}

@MainActor
final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    @Published var isAuthenticated = false
    @Published var currentEmail: String?

    private let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: SupabaseConfig.url,
            supabaseKey: SupabaseConfig.anonKey,
            options: SupabaseClientOptions(
                auth: .init(
                    storage: UserDefaultsAuthStorage(),
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        let session = try await client.auth.signIn(email: email, password: password)
        isAuthenticated = true
        currentEmail = session.user.email
    }

    func signUp(email: String, password: String) async throws {
        _ = try await client.auth.signUp(email: email, password: password)
        // isAuthenticated remains false — user must confirm email then sign in
    }

    func signOut() async throws {
        try await client.auth.signOut()
        isAuthenticated = false
        currentEmail = nil
        UserSettings.clearLocal()
    }

    func restoreSession() async {
        do {
            let session = try await client.auth.session
            isAuthenticated = true
            currentEmail = session.user.email
        } catch {
            isAuthenticated = false
        }
    }

    func handleAuthCallback(url: URL) async {
        do {
            let session = try await client.auth.session(from: url)
            isAuthenticated = true
            currentEmail = session.user.email
        } catch {}
    }

    // MARK: - Fetch (all rows, optional ordering)

    func fetch<T: Decodable & Sendable>(
        from table: String,
        orderBy: String? = nil,
        ascending: Bool = true
    ) async throws -> [T] {
        if let orderBy {
            return try await client.from(table)
                .select()
                .order(orderBy, ascending: ascending)
                .execute()
                .value
        } else {
            return try await client.from(table)
                .select()
                .execute()
                .value
        }
    }

    // MARK: - Fetch with single eq filter + optional ordering

    func fetch<T: Decodable & Sendable>(
        from table: String,
        filterColumn: String,
        filterValue: String,
        orderBy: String? = nil,
        ascending: Bool = true
    ) async throws -> [T] {
        if let orderBy {
            return try await client.from(table)
                .select()
                .eq(filterColumn, value: filterValue)
                .order(orderBy, ascending: ascending)
                .execute()
                .value
        } else {
            return try await client.from(table)
                .select()
                .eq(filterColumn, value: filterValue)
                .execute()
                .value
        }
    }

    // MARK: - Fetch single by ID

    func fetchSingle<T: Decodable & Sendable>(
        from table: String,
        id: UUID
    ) async throws -> T {
        return try await client.from(table)
            .select()
            .eq("id", value: id.uuidString)
            .single()
            .execute()
            .value
    }

    // MARK: - Insert

    func insert<T: Encodable & Sendable>(
        into table: String,
        value: T
    ) async throws {
        try await client.from(table)
            .insert(value)
            .execute()
    }

    // MARK: - Update

    func update<T: Encodable & Sendable>(
        in table: String,
        id: UUID,
        value: T
    ) async throws {
        try await client.from(table)
            .update(value)
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Delete

    func delete(from table: String, id: UUID) async throws {
        try await client.from(table)
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - RPC

    func nextInvoiceNumber() async throws -> Int {
        let response = try await client.rpc("next_invoice_number").execute()
        let raw = String(data: response.data, encoding: .utf8) ?? ""
        let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        guard let number = Int(cleaned) else {
            throw ServiceError.rpcError("Could not parse invoice number from: \(raw)")
        }
        return number
    }

    func fetchInvoiceSequence() async throws -> (lastNumber: Int, prefix: String) {
        struct Row: Decodable { let last_number: Int; let invoice_prefix: String }
        let rows: [Row] = try await client.from("invoice_sequence").select().execute().value
        guard let row = rows.first else {
            throw ServiceError.rpcError("No invoice_sequence row found")
        }
        return (row.last_number, row.invoice_prefix)
    }

    func fetchLastInvoiceNumber() async throws -> Int {
        try await fetchInvoiceSequence().lastNumber
    }

    func updateLastInvoiceNumber(_ number: Int) async throws {
        guard isAuthenticated else { return }
        let uid = try await currentUserId()
        try await client.from("invoice_sequence")
            .update(["last_number": number])
            .eq("user_id", value: uid.uuidString)
            .execute()
    }

    func updateInvoicePrefix(_ prefix: String) async throws {
        guard isAuthenticated else { return }
        let uid = try await currentUserId()
        try await client.from("invoice_sequence")
            .update(["invoice_prefix": prefix])
            .eq("user_id", value: uid.uuidString)
            .execute()
    }

    func fetchIncludeSuperInTotals() async throws -> Bool {
        struct Row: Decodable { let includeSuperInTotals: Bool }
        let rows: [Row] = try await client.from("business_details")
            .select("include_super_in_totals")
            .execute()
            .value
        return rows.first?.includeSuperInTotals ?? true
    }

    func updateIncludeSuperInTotals(_ value: Bool) async throws {
        guard isAuthenticated else { return }
        try await client.from("business_details")
            .update(["include_super_in_totals": value])
            .eq("user_id", value: try await currentUserId())
            .execute()
    }

    // MARK: - Business Details

    func fetchBusinessDetails() async throws -> BusinessDetailsRecord? {
        let rows: [BusinessDetailsRecord] = try await client
            .from("business_details")
            .select()
            .execute()
            .value
        return rows.first
    }

    func updateBusinessDetails(_ record: BusinessDetailsRecord) async throws {
        try await client
            .from("business_details")
            .update(record)
            .eq("user_id", value: record.userId.uuidString)
            .execute()
    }

    // MARK: - Specialized Queries

    func fetchUninvoicedEntries() async throws -> [Entry] {
        return try await client.from("entries")
            .select()
            .`is`("invoice_id", value: nil)
            .order("date")
            .execute()
            .value
    }

    private struct InvoiceIdUpdate: Encodable {
        let invoiceId: UUID

        enum CodingKeys: String, CodingKey {
            case invoiceId = "invoice_id"
        }
    }

    private struct InvoiceIdClear: Encodable {
        let invoiceId: String?

        enum CodingKeys: String, CodingKey {
            case invoiceId = "invoice_id"
        }
    }

    func clearInvoiceId(forInvoiceId invoiceId: UUID) async throws {
        try await client.from("entries")
            .update(InvoiceIdClear(invoiceId: nil))
            .eq("invoice_id", value: invoiceId.uuidString)
            .execute()
    }

    func deleteEntriesByInvoiceId(_ invoiceId: UUID) async throws {
        try await client.from("entries")
            .delete()
            .eq("invoice_id", value: invoiceId.uuidString)
            .execute()
    }

    func updateEntries(ids: [UUID], invoiceId: UUID) async throws {
        let payload = InvoiceIdUpdate(invoiceId: invoiceId)
        for id in ids {
            try await client.from("entries")
                .update(payload)
                .eq("id", value: id.uuidString)
                .execute()
        }
    }

    // MARK: - Helpers

    func currentUserId() async throws -> UUID {
        let session = try await client.auth.session
        return session.user.id
    }
}

enum ServiceError: LocalizedError {
    case notAuthenticated
    case rpcError(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: "You are not signed in. Please sign in first."
        case .rpcError(let msg): "RPC error: \(msg)"
        }
    }
}
