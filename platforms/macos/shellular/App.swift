import AppKit
import UserNotifications

@main
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    static weak var shared: AppDelegate?
    private static let retainedDelegate = AppDelegate()

    static func main() {
        let application = NSApplication.shared
        application.delegate = retainedDelegate
        application.setActivationPolicy(.regular)
        application.run()
    }

    private var mainWindowController: NSWindowController?
    private var menuController: ApplicationMenuController?
    private var pendingDeepLinks: [URL] = []
    var deepLinkHandler: ((URL) -> Void)? {
        didSet {
            guard let deepLinkHandler, !pendingDeepLinks.isEmpty else { return }
            let pending = pendingDeepLinks
            pendingDeepLinks.removeAll()
            pending.forEach(deepLinkHandler)
        }
    }

    func applicationWillFinishLaunching(_ notification: Notification) {
        Self.shared = self
        NSWindow.allowsAutomaticWindowTabbing = false
        let menuController = ApplicationMenuController()
        self.menuController = menuController
        menuController.install()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self

        let controller = WebViewController()
        let window = ShellularWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.contentViewController = controller
        window.title = "Home"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.tabbingMode = .disallowed
        window.minSize = NSSize(width: 760, height: 560)
        window.isReleasedWhenClosed = false
        window.preservesContentDuringLiveResize = true
        window.setFrameAutosaveName("ShellularMainWindow")

        let windowController = NSWindowController(window: window)
        mainWindowController = windowController
        if !window.setFrameUsingName("ShellularMainWindow") {
            window.center()
        }
        windowController.showWindow(nil)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        guard !flag, let window = mainWindowController?.window else { return true }
        window.makeKeyAndOrderFront(nil)
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let deepLinkHandler else {
            pendingDeepLinks.append(contentsOf: urls)
            return
        }
        urls.forEach(deepLinkHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        NotificationService.shared.handleTap(response.notification.request.identifier)
    }
}

private final class ApplicationMenuController: NSObject {
    func install() {
        let mainMenu = NSMenu(title: "Main Menu")
        mainMenu.addItem(rootItem(title: "Shellular", submenu: applicationMenu()))
        mainMenu.addItem(rootItem(title: "File", submenu: fileMenu()))
        mainMenu.addItem(rootItem(title: "Edit", submenu: editMenu()))
        mainMenu.addItem(rootItem(title: "View", submenu: viewMenu()))
        mainMenu.addItem(rootItem(title: "Window", submenu: windowMenu()))
        mainMenu.addItem(rootItem(title: "Help", submenu: helpMenu()))
        #if DEBUG
        mainMenu.addItem(rootItem(title: "Debug", submenu: debugMenu()))
        #endif
        NSApp.mainMenu = mainMenu
    }

    private func applicationMenu() -> NSMenu {
        let menu = NSMenu(title: "Shellular")
        menu.addItem(actionItem("About Shellular", action: #selector(showAbout)))
        menu.addItem(.separator())
        menu.addItem(commandItem("Settings…", command: "settings", key: ","))
        menu.addItem(.separator())

        let services = NSMenu(title: "Services")
        let servicesItem = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        servicesItem.submenu = services
        menu.addItem(servicesItem)
        NSApp.servicesMenu = services

        menu.addItem(.separator())
        menu.addItem(systemItem("Hide Shellular", action: #selector(NSApplication.hide(_:)), key: "h"))
        menu.addItem(systemItem(
            "Hide Others",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            key: "h",
            modifiers: [.command, .option]
        ))
        menu.addItem(systemItem("Show All", action: #selector(NSApplication.unhideAllApplications(_:))))
        menu.addItem(.separator())
        menu.addItem(systemItem("Quit Shellular", action: #selector(NSApplication.terminate(_:)), key: "q"))
        return menu
    }

    private func fileMenu() -> NSMenu {
        let menu = NSMenu(title: "File")
        menu.addItem(commandItem("New Chat", command: "new-chat", key: "n", modifiers: [.command, .shift]))
        menu.addItem(commandItem("Open File…", command: "open-file", key: "o"))
        menu.addItem(commandItem("Open Folder…", command: "open-folder", key: "o", modifiers: [.command, .shift]))
        menu.addItem(commandItem("New Terminal", command: "new-terminal", key: "n"))
        menu.addItem(.separator())
        menu.addItem(commandItem("Save", command: "save", key: "s"))
        menu.addItem(.separator())
        menu.addItem(commandItem("Close Tab", command: "close-tab", key: "w"))
        return menu
    }

    private func editMenu() -> NSMenu {
        let menu = NSMenu(title: "Edit")
        menu.addItem(responderItem("Undo", selector: Selector(("undo:")), key: "z"))
        menu.addItem(responderItem("Redo", selector: Selector(("redo:")), key: "z", modifiers: [.command, .shift]))
        menu.addItem(.separator())
        menu.addItem(responderItem("Cut", selector: #selector(NSText.cut(_:)), key: "x"))
        menu.addItem(responderItem("Copy", selector: #selector(NSText.copy(_:)), key: "c"))
        menu.addItem(responderItem("Paste", selector: #selector(NSText.paste(_:)), key: "v"))
        menu.addItem(responderItem("Select All", selector: #selector(NSText.selectAll(_:)), key: "a"))
        return menu
    }

    private func viewMenu() -> NSMenu {
        let menu = NSMenu(title: "View")
        let sidebar = commandItem("Toggle Sidebar", command: "toggle-sidebar", key: "b")
        sidebar.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: nil)
        menu.addItem(sidebar)
        menu.addItem(.separator())
        let ports = commandItem("Ports", command: "ports")
        ports.image = NSImage(systemSymbolName: "network", accessibilityDescription: nil)
        menu.addItem(ports)
        let monitor = commandItem("System Monitor", command: "system-monitor")
        monitor.image = NSImage(systemSymbolName: "chart.xyaxis.line", accessibilityDescription: nil)
        menu.addItem(monitor)
        menu.addItem(.separator())
        menu.addItem(responderItem(
            "Enter Full Screen",
            selector: #selector(NSWindow.toggleFullScreen(_:)),
            key: "f",
            modifiers: [.command, .control]
        ))
        return menu
    }

    private func windowMenu() -> NSMenu {
        let menu = NSMenu(title: "Window")
        menu.addItem(responderItem("Minimize", selector: #selector(NSWindow.performMiniaturize(_:)), key: "m"))
        menu.addItem(responderItem("Zoom", selector: #selector(NSWindow.performZoom(_:))))
        menu.addItem(.separator())
        menu.addItem(responderItem("Bring All to Front", selector: #selector(NSApplication.arrangeInFront(_:))))
        NSApp.windowsMenu = menu
        return menu
    }

    private func helpMenu() -> NSMenu {
        let menu = NSMenu(title: "Help")
        menu.addItem(commandItem("Shellular Help", command: "help"))
        menu.addItem(commandItem("Reach Out", command: "reach-out"))
        NSApp.helpMenu = menu
        return menu
    }

    #if DEBUG
    private func debugMenu() -> NSMenu {
        let menu = NSMenu(title: "Debug")
        menu.addItem(actionItem(
            "Reload Workbench",
            action: #selector(reloadWorkbench),
            key: "r",
            modifiers: [.command, .option]
        ))
        return menu
    }
    #endif

    private func rootItem(title: String, submenu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        return item
    }

    private func commandItem(
        _ title: String,
        command: String,
        key: String = "",
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = actionItem(title, action: #selector(runDesktopCommand(_:)), key: key, modifiers: modifiers)
        item.representedObject = command
        return item
    }

    private func responderItem(
        _ title: String,
        selector: Selector,
        key: String = "",
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: key)
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        item.target = nil
        return item
    }

    private func systemItem(
        _ title: String,
        action: Selector,
        key: String = "",
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        item.target = NSApp
        return item
    }

    private func actionItem(
        _ title: String,
        action: Selector,
        key: String = "",
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        item.target = self
        return item
    }

    @objc private func runDesktopCommand(_ sender: NSMenuItem) {
        guard let command = sender.representedObject as? String else { return }
        NativeService.sendDesktopCommand(command)
    }

    @objc private func showAbout() {
        NSApp.orderFrontStandardAboutPanel(nil)
    }

    #if DEBUG
    @objc private func reloadWorkbench() {
        NotificationCenter.default.post(name: .reloadWebView, object: nil)
    }
    #endif
}

extension Notification.Name {
    static let reloadWebView = Notification.Name("shellular.reloadWebView")
}
