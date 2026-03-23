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

@MainActor
final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    @Published var isAuthenticated = false

    private var client: SupabaseClient?

    private init() {
        setupClient()
    }

    func setupClient() {
        let url = UserDefaults.standard.string(forKey: "supabaseURL") ?? ""
        let key = UserDefaults.standard.string(forKey: "supabaseAnonKey") ?? ""
        guard let supabaseURL = URL(string: url), !key.isEmpty else {
            client = nil
            return
        }
        client = SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: key,
            options: SupabaseClientOptions(
                auth: .init(
                    storage: UserDefaultsAuthStorage(),
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }

    var isConfigured: Bool { client != nil }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        guard let client else { throw ServiceError.notConfigured }
        _ = try await client.auth.signIn(email: email, password: password)
        isAuthenticated = true
    }

    func signOut() async throws {
        guard let client else { return }
        try await client.auth.signOut()
        isAuthenticated = false
    }

    func restoreSession() async {
        guard let client else { return }
        do {
            _ = try await client.auth.session
            isAuthenticated = true
        } catch {
            isAuthenticated = false
        }
    }

    // MARK: - Fetch (all rows, optional ordering)

    func fetch<T: Decodable & Sendable>(
        from table: String,
        orderBy: String? = nil,
        ascending: Bool = true
    ) async throws -> [T] {
        guard let client else { throw ServiceError.notConfigured }
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
        guard let client else { throw ServiceError.notConfigured }
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
        guard let client else { throw ServiceError.notConfigured }
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
        guard let client else { throw ServiceError.notConfigured }
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
        guard let client else { throw ServiceError.notConfigured }
        try await client.from(table)
            .update(value)
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Delete

    func delete(from table: String, id: UUID) async throws {
        guard let client else { throw ServiceError.notConfigured }
        print("[DELETE] table=\(table) id=\(id.uuidString)")
        let response = try await client.from(table)
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
        let raw = String(data: response.data, encoding: .utf8) ?? ""
        print("[DELETE] response: \(raw)")
    }

    // MARK: - RPC

    func nextInvoiceNumber() async throws -> Int {
        guard let client else { throw ServiceError.notConfigured }
        // RPC returns a scalar integer — execute and parse from raw data
        let response = try await client.rpc("next_invoice_number").execute()
        let raw = String(data: response.data, encoding: .utf8) ?? ""
        print("[RPC] next_invoice_number raw: '\(raw)'")
        // Supabase returns the scalar value directly, e.g. "171" or 171
        let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        guard let number = Int(cleaned) else {
            throw ServiceError.rpcError("Could not parse invoice number from: \(raw)")
        }
        return number
    }

    func fetchLastInvoiceNumber() async throws -> Int {
        guard let client else { throw ServiceError.notConfigured }
        struct Row: Decodable { let last_number: Int }
        let rows: [Row] = try await client.from("invoice_sequence").select().execute().value
        guard let row = rows.first else {
            throw ServiceError.rpcError("No invoice_sequence row found")
        }
        return row.last_number
    }

    func updateLastInvoiceNumber(_ number: Int) async throws {
        guard let client else { throw ServiceError.notConfigured }
        try await client.from("invoice_sequence")
            .update(["last_number": number])
            .gte("last_number", value: 0)  // WHERE true equivalent
            .execute()
    }

    // MARK: - Specialized Queries

    func fetchUninvoicedEntries() async throws -> [Entry] {
        guard let client else { throw ServiceError.notConfigured }
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
        guard let client else { throw ServiceError.notConfigured }
        try await client.from("entries")
            .update(InvoiceIdClear(invoiceId: nil))
            .eq("invoice_id", value: invoiceId.uuidString)
            .execute()
    }

    func deleteEntriesByInvoiceId(_ invoiceId: UUID) async throws {
        guard let client else { throw ServiceError.notConfigured }
        print("[DELETE ENTRIES] invoice_id=\(invoiceId.uuidString)")
        let response = try await client.from("entries")
            .delete()
            .eq("invoice_id", value: invoiceId.uuidString)
            .execute()
        let raw = String(data: response.data, encoding: .utf8) ?? ""
        print("[DELETE ENTRIES] response: \(raw)")
    }

    func updateEntries(ids: [UUID], invoiceId: UUID) async throws {
        guard let client else { throw ServiceError.notConfigured }
        let payload = InvoiceIdUpdate(invoiceId: invoiceId)
        for id in ids {
            try await client.from("entries")
                .update(payload)
                .eq("id", value: id.uuidString)
                .execute()
        }
    }
}

enum ServiceError: LocalizedError {
    case notConfigured
    case notAuthenticated
    case rpcError(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Supabase is not configured. Please add your URL and API key in Settings."
        case .notAuthenticated: "You are not signed in. Please sign in first."
        case .rpcError(let msg): "RPC error: \(msg)"
        }
    }
}
