import SwiftUI

@main
struct InvoicingApp: App {
    @ObservedObject private var supabase = SupabaseService.shared
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some Scene {
        Window("Login", id: "login") {
            LoginView()
                .task {
                    if supabase.isAuthenticated {
                        openWindow(id: "main")
                        dismissWindow(id: "login")
                    }
                }
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

        mainWindow

        Settings {
            SettingsView()
        }
        .windowResizability(.contentSize)
    }

    private var mainWindow: some Scene {
        Window("Invoicing", id: "main") {
            mainContent
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1100, height: 700)
        .backport.suppressLaunch()
    }

    private var mainContent: some View {
        ContentView()
            .frame(minWidth: 900, minHeight: 600)
            .onChange(of: supabase.isAuthenticated) { _, isAuthenticated in
                if !isAuthenticated {
                    openWindow(id: "login")
                    dismissWindow(id: "main")
                }
            }
    }
}

// MARK: - Backport for .defaultLaunchBehavior(.suppressed)

fileprivate struct SceneBackport<S: Scene> {
    let scene: S
}

extension Scene {
    fileprivate var backport: SceneBackport<Self> { SceneBackport(scene: self) }
}

extension SceneBackport {
    func suppressLaunch() -> some Scene {
        if #available(macOS 15, *) {
            return scene.defaultLaunchBehavior(.suppressed)
        } else {
            return scene
        }
    }
}
