import SwiftUI

@main
struct InvoicingApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 900, minHeight: 600)
                .task {
                    await SupabaseService.shared.restoreSession()
                }
                .onOpenURL { url in
                    Task { await SupabaseService.shared.handleAuthCallback(url: url) }
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
