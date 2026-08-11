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
        BrowserLiveResizePolicy.apply(to: window)
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

    func updateDesktopShortcutContext(
        _ contextualNew: String?,
        shortcuts: [String: Any]?
    ) {
        menuController?.updateShortcuts(
            contextualNew: contextualNew,
            shortcuts: DesktopShortcutCatalog.resolved(payload: shortcuts)
        )
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
    private var commandItems: [String: [NSMenuItem]] = [:]
    private var contextualNew = "new-file"
    private var shortcuts = DesktopShortcutCatalog.defaults

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
        menu.addItem(commandItem("Settings…", shortcut: DesktopShortcutCatalog.settings))
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
        let newFile = commandItem("New File", command: "new-file")
        let newChat = commandItem("New Chat", command: "new-chat")
        menu.addItem(newFile)
        menu.addItem(newChat)
        updateShortcuts(contextualNew: nil, shortcuts: shortcuts)
        menu.addItem(commandItem(
            "New Terminal",
            shortcut: DesktopShortcutCatalog.newTerminal
        ))
        menu.addItem(.separator())
        menu.addItem(commandItem("Open File…", shortcut: DesktopShortcutCatalog.openFile))
        menu.addItem(commandItem("Open Folder…", command: "open-folder"))
        menu.addItem(.separator())
        menu.addItem(commandItem("Save", shortcut: DesktopShortcutCatalog.save))
        menu.addItem(.separator())
        menu.addItem(commandItem("Close Tab", shortcut: DesktopShortcutCatalog.closeTab))
        return menu
    }

    private func editMenu() -> NSMenu {
        let menu = NSMenu(title: "Edit")
        menu.addItem(commandItem("Undo", shortcut: DesktopShortcutCatalog.undo))
        menu.addItem(commandItem("Redo", shortcut: DesktopShortcutCatalog.redo))
        menu.addItem(.separator())
        menu.addItem(commandItem("Cut", shortcut: DesktopShortcutCatalog.cut))
        menu.addItem(commandItem("Copy", shortcut: DesktopShortcutCatalog.copy))
        menu.addItem(commandItem("Paste", shortcut: DesktopShortcutCatalog.paste))
        menu.addItem(commandItem("Select All", shortcut: DesktopShortcutCatalog.selectAll))
        return menu
    }

    private func viewMenu() -> NSMenu {
        let menu = NSMenu(title: "View")
        let sidebar = commandItem("Toggle Sidebar", shortcut: DesktopShortcutCatalog.toggleSidebar)
        sidebar.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: nil)
        menu.addItem(sidebar)
        menu.addItem(commandItem(
            "Toggle Terminal",
            shortcut: DesktopShortcutCatalog.toggleTerminal
        ))
        menu.addItem(.separator())
        menu.addItem(commandItem(
            "Explorer",
            shortcut: DesktopShortcutCatalog.showExplorer
        ))
        menu.addItem(commandItem(
            "Search",
            shortcut: DesktopShortcutCatalog.projectSearch
        ))
        menu.addItem(commandItem(
            "Source Control",
            shortcut: DesktopShortcutCatalog.showSourceControl
        ))
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
        menu.addItem(commandItem("About", command: "about"))
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
        commandItems[command, default: []].append(item)
        return item
    }

    private func commandItem(
        _ title: String,
        shortcut: DesktopNativeShortcut
    ) -> NSMenuItem {
        commandItem(
            title,
            command: shortcut.command,
            key: shortcut.key,
            modifiers: shortcut.modifiers
        )
    }

    func updateShortcuts(
        contextualNew: String?,
        shortcuts: [String: DesktopNativeShortcut]
    ) {
        self.contextualNew = contextualNew == "new-chat" ? "new-chat" : "new-file"
        self.shortcuts = shortcuts
        for (command, items) in commandItems {
            let shortcut: DesktopNativeShortcut?
            if command == "new-file" || command == "new-chat" {
                shortcut = DesktopShortcutCatalog.contextualShortcut(
                    for: command,
                    contextualCommand: self.contextualNew,
                    shortcuts: shortcuts
                )
            } else {
                shortcut = shortcuts[command]
            }
            for item in items {
                item.keyEquivalent = shortcut?.key ?? ""
                item.keyEquivalentModifierMask = shortcut?.modifiers ?? []
            }
        }
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
