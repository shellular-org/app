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
                CommandGroup(after: .newItem) { Button("Open File…") { NotificationCenter.default.post(name: .openFile, object: nil) }.keyboardShortcut("o") }
                CommandGroup(after: .sidebar) { Button("Reload") { NotificationCenter.default.post(name: .reloadWebView, object: nil) }.keyboardShortcut("r") }
            }
    }
}

extension Notification.Name {
    static let openFile = Notification.Name("shellular.openFile")
    static let reloadWebView = Notification.Name("shellular.reloadWebView")
}
