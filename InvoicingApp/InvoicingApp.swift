import SwiftUI

@main
struct InvoicingApp: App {
    @ObservedObject private var supabase = SupabaseService.shared
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some Scene {
        Window("Login", id: "login") {
            LoginView()
                .task { await SupabaseService.shared.restoreSession() }
                .onOpenURL { url in
                    Task { await SupabaseService.shared.handleAuthCallback(url: url) }
                }
                .onChange(of: supabase.isAuthenticated) { _, isAuthenticated in
                    if isAuthenticated {
                        openWindow(id: "main")
                        dismissWindow(id: "login")
                    }
                }
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unifiedCompact(showsTitle: false))
        .windowResizability(.contentSize)
        .defaultSize(width: 420, height: 520)

        WindowGroup(id: "main") {
            ContentView()
                .frame(minWidth: 900, minHeight: 600)
                .onChange(of: supabase.isAuthenticated) { _, isAuthenticated in
                    if !isAuthenticated {
                        openWindow(id: "login")
                        dismissWindow(id: "main")
                    }
                }
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1100, height: 700)

        Settings {
            SettingsView()
        }
        .windowResizability(.contentSize)
    }
}
