import SwiftUI
import AppKit
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    static weak var shared: AppDelegate?
    var deepLinkHandler: ((URL) -> Void)?
    func applicationDidFinishLaunching(_ notification: Notification) {
        Self.shared = self
        UNUserNotificationCenter.current().delegate = self
    }
    func application(_ application: NSApplication, open urls: [URL]) { urls.forEach { deepLinkHandler?($0) } }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        NotificationService.shared.handleTap(response.notification.request.identifier)
    }
}

@main struct shellularApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        WindowGroup { WebContainer().frame(minWidth: 760, minHeight: 560) }
            .defaultSize(width: 1100, height: 760)
            .commands {
                CommandGroup(replacing: .appInfo) {
                    Button("About Shellular") { NativeService.sendDesktopCommand("about") }
                }
                CommandGroup(replacing: .appSettings) {
                    Button("Settings…") { NativeService.sendDesktopCommand("settings") }
                        .keyboardShortcut(",", modifiers: .command)
                }
                CommandGroup(replacing: .newItem) {
                    Button("Open File…") { NativeService.sendDesktopCommand("open-file") }
                        .keyboardShortcut("o", modifiers: .command)
                    Button("New Terminal") { NativeService.sendDesktopCommand("new-terminal") }
                        .keyboardShortcut("n", modifiers: .command)
                }
                CommandGroup(replacing: .saveItem) {}
                CommandGroup(replacing: .printItem) {}
                CommandGroup(replacing: .toolbar) {}
                CommandGroup(replacing: .sidebar) {
                    #if DEBUG
                    Button("Reload") { NotificationCenter.default.post(name: .reloadWebView, object: nil) }
                        .keyboardShortcut("r", modifiers: .command)
                    #endif
                }
                CommandGroup(replacing: .help) {
                    Button("Shellular Help") { NativeService.sendDesktopCommand("help") }
                    Button("Reach Out") { NativeService.sendDesktopCommand("reach-out") }
                }
            }
    }
}

extension Notification.Name {
    static let reloadWebView = Notification.Name("shellular.reloadWebView")
}
