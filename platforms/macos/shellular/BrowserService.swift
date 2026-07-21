import AppKit
import AuthenticationServices
import WebKit

private struct BrowserConnectionContext: Equatable {
    let status: String
    let transport: String?
    let hostId: String?
    let hostName: String?

    init(_ value: Any?) {
        let data = value as? [String: Any] ?? [:]
        status = data["status"] as? String ?? "disconnected"
        transport = data["transport"] as? String
        hostId = data["hostId"] as? String
        hostName = data["hostName"] as? String
    }

    var canProxyRemote: Bool {
        transport == "remote" && status == "connected" && hostId != nil
    }
}

final class BrowserService: BaseService, ASWebAuthenticationPresentationContextProviding {
    private var authSession: ASWebAuthenticationSession?
    private var browserWindow: BrowserWindowController?
    private var context = BrowserConnectionContext(nil)

    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "open": open(args, html: false, callback)
        case "openHTML": open(args, html: true, callback)
        case "setContext":
            context = BrowserConnectionContext(args.first)
            DispatchQueue.main.async { self.browserWindow?.updateContext(self.context) }
            callback.success()
        case "setTheme":
            let theme = args.first as? [String: Any] ?? [:]
            let homeDocument = args[safe: 1] as? String ?? ""
            DispatchQueue.main.async {
                self.browserWindow?.applyTheme(theme)
                self.browserWindow?.updateHomeDocument(homeDocument, reloadVisibleHome: true)
            }
            callback.success()
        case "openForAuth": auth(args, callback)
        default: callback.error("Unknown action: \(action)")
        }
    }

    private func open(_ args: [Any], html: Bool, _ callback: Callback) {
        let content = args.first as? String
        let theme = args[safe: 1] as? [String: Any] ?? [:]
        context = BrowserConnectionContext(args[safe: 2])
        let homeDocument = args[safe: 3] as? String ?? ""
        DispatchQueue.main.async {
            let controller: BrowserWindowController
            if let existing = self.browserWindow {
                controller = existing
                controller.updateContext(self.context)
                controller.applyTheme(theme)
                controller.updateHomeDocument(homeDocument)
            } else {
                controller = BrowserWindowController(
                    mainWebView: self.webView,
                    context: self.context,
                    theme: theme,
                    homeDocument: homeDocument
                )
                controller.onClose = { [weak self, weak controller] in
                    if self?.browserWindow === controller { self?.browserWindow = nil }
                }
                self.browserWindow = controller
            }

            if html {
                controller.openHTML(content ?? "")
            } else if let content, !content.isEmpty {
                guard let url = BrowserAddressResolver.resolve(content) else {
                    return callback.error("Invalid URL")
                }
                controller.openURL(url)
            } else {
                controller.openOrRestoreHome()
            }
            controller.showWindow(nil)
            controller.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            callback.success()
        }
    }

    private func auth(_ args: [Any], _ callback: Callback) {
        guard let value = args.first as? String, let url = URL(string: value) else {
            return callback.error("Invalid URL")
        }
        let scheme = args[safe: 1] as? String ?? "shellular"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('browserwillopen'))")
            self.authSession?.cancel()
            self.authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { url, error in
                DispatchQueue.main.async {
                    self.authSession = nil
                    self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('browserdidclose'))")
                    guard let url else { return callback.error(error?.localizedDescription ?? "Authentication cancelled") }
                    guard url.scheme == scheme, url.host == "auth-callback" else {
                        return callback.error("Authentication returned an invalid callback URL")
                    }
                    var params: [String: String] = [:]
                    URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.forEach {
                        params[$0.name] = $0.value ?? ""
                    }
                    guard let data = try? JSONSerialization.data(withJSONObject: ["url": url.absoluteString, "params": params]),
                          let json = String(data: data, encoding: .utf8) else {
                        return callback.error("Could not decode authentication callback")
                    }
                    callback.success(json)
                }
            }
            self.authSession?.presentationContextProvider = self
            self.authSession?.prefersEphemeralWebBrowserSession = false
            if self.authSession?.start() != true {
                self.authSession = nil
                callback.error("Unable to start authentication session")
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        viewController?.view.window ?? NSApp.keyWindow!
    }
}

private final class BrowserWindow: NSWindow {
    weak var commandHandler: BrowserWindowController?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if commandHandler?.handleKeyEquivalent(event) == true { return true }
        return super.performKeyEquivalent(with: event)
    }
}

private struct SavedBrowserTab: Codable {
    let id: String
    let url: String
    let title: String
    let remoteHostId: String?
}

private struct SavedBrowserSession: Codable {
    let tabs: [SavedBrowserTab]
    let activeId: String?
}

private final class BrowserTab {
    let id: String
    let webView: WKWebView
    var displayURL: String
    var title: String
    var remoteHostId: String?
    var ephemeral = false
    var needsRestoreLoad = false
    var internalRequestId: UUID?
    var observations: [NSKeyValueObservation] = []

    init(id: String = UUID().uuidString, webView: WKWebView, displayURL: String, title: String, remoteHostId: String? = nil) {
        self.id = id
        self.webView = webView
        self.displayURL = displayURL
        self.title = title
        self.remoteHostId = remoteHostId
    }
}

private final class IdentifiedButton: NSButton {
    var value = ""
}

private final class BrowserWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, NSTextFieldDelegate {
    private static let sessionKey = "shellular.browser.session.v1"
    private weak var mainWebView: WKWebView?
    private var context: BrowserConnectionContext
    private var theme: [String: Any]
    private var homeDocument: String
    private var tabs: [BrowserTab] = []
    private var activeId: String?
    private var restored = false
    private var closedTabs: [SavedBrowserTab] = []
    private let assetHandler = ShellularAssetSchemeHandler()

    private let rootStack = NSStackView()
    private let tabBar = NSView()
    private let tabStack = NSStackView()
    private let addTabButton = NSButton()
    private let tabSearchButton = NSButton()
    private let toolbar = NSStackView()
    private let backButton = NSButton()
    private let forwardButton = NSButton()
    private let reloadButton = NSButton()
    private let homeButton = NSButton()
    private let addressField = NSTextField()
    private let progress = NSProgressIndicator()
    private let contentViewContainer = NSView()
    private var primaryColor = NSColor.windowBackgroundColor
    private var secondaryColor = NSColor.controlBackgroundColor
    private var textColor = NSColor.labelColor
    private var accentColor = NSColor.controlAccentColor
    var onClose: (() -> Void)?

    init(mainWebView: WKWebView?, context: BrowserConnectionContext, theme: [String: Any], homeDocument: String) {
        self.mainWebView = mainWebView
        self.context = context
        self.theme = theme
        self.homeDocument = homeDocument.isEmpty ? Self.fallbackHomeHTML : homeDocument
        let window = BrowserWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1120, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init(window: window)
        window.commandHandler = self
        window.title = "Shellular Browser"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = false
        window.center()
        window.delegate = self
        setupUI()
        applyTheme(theme)
    }

    required init?(coder: NSCoder) { fatalError() }

    func updateContext(_ context: BrowserConnectionContext) {
        let changedHost = self.context.hostId != context.hostId || self.context.transport != context.transport
        self.context = context
        if changedHost {
            EmbeddedProxyServer.shared.cancelAllPending()
            EmbeddedProxyServer.shared.stopAll()
            if let tab = activeTab, let remoteHostId = tab.remoteHostId, remoteHostId != context.hostId {
                showConnectionError(tab, expectedHostId: remoteHostId)
            }
        }
    }

    func applyTheme(_ value: [String: Any]) {
        theme = value
        primaryColor = NSColor(hex: value["primary"] as? String) ?? .windowBackgroundColor
        secondaryColor = NSColor(hex: value["secondary"] as? String) ?? .controlBackgroundColor
        textColor = NSColor(hex: value["primaryText"] as? String) ?? .labelColor
        accentColor = NSColor(hex: (value["primaryActiveText"] as? String) ?? (value["link"] as? String)) ?? .controlAccentColor
        window?.backgroundColor = primaryColor
        tabBar.layer?.backgroundColor = secondaryColor.cgColor
        toolbar.layer?.backgroundColor = secondaryColor.cgColor
        addressField.backgroundColor = primaryColor
        addressField.textColor = textColor
        progress.contentFilters = []
        rebuildTabStrip()
    }

    func updateHomeDocument(_ html: String, reloadVisibleHome: Bool = false) {
        guard !html.isEmpty else { return }
        homeDocument = html
        if reloadVisibleHome, let tab = activeTab, tab.displayURL == "shellular://home" {
            loadHome(tab)
        }
    }

    func openOrRestoreHome() {
        if !restored {
            restored = true
            restoreSession()
        }
        if tabs.isEmpty { newHomeTab() }
        else if let activeId { selectTab(activeId) }
    }

    func openURL(_ url: URL) {
        if !restored {
            restored = true
            restoreSession(loadTabs: false)
        }
        let tab = makeTab(url: url.absoluteString, title: url.host ?? "New Tab")
        tabs.append(tab)
        selectTab(tab.id)
        navigate(tab, to: url)
    }

    func openHTML(_ html: String) {
        if !restored { restored = true }
        let tab = makeTab(url: "", title: "Document")
        tab.ephemeral = true
        tabs.append(tab)
        selectTab(tab.id)
        tab.webView.loadHTMLString(html, baseURL: nil)
    }

    private func setupUI() {
        guard let window else { return }
        let root = NSView()
        root.wantsLayer = true
        window.contentView = root

        rootStack.orientation = .vertical
        rootStack.spacing = 0
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(rootStack)
        NSLayoutConstraint.activate([
            rootStack.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            rootStack.topAnchor.constraint(equalTo: root.topAnchor),
            rootStack.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])

        tabBar.wantsLayer = true
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.heightAnchor.constraint(equalToConstant: 39).isActive = true
        rootStack.addArrangedSubview(tabBar)

        tabStack.orientation = .horizontal
        tabStack.alignment = .centerY
        tabStack.spacing = 3
        tabStack.translatesAutoresizingMaskIntoConstraints = false
        tabBar.addSubview(tabStack)

        configureIconButton(addTabButton, symbol: "plus", help: "New Tab", action: #selector(newTabAction))
        configureIconButton(tabSearchButton, symbol: "chevron.down", help: "Search Tabs", action: #selector(searchTabsAction))
        tabBar.addSubview(addTabButton)
        tabBar.addSubview(tabSearchButton)
        addTabButton.translatesAutoresizingMaskIntoConstraints = false
        tabSearchButton.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            tabStack.leadingAnchor.constraint(equalTo: tabBar.leadingAnchor, constant: 78),
            tabStack.topAnchor.constraint(equalTo: tabBar.topAnchor, constant: 5),
            tabStack.bottomAnchor.constraint(equalTo: tabBar.bottomAnchor, constant: -3),
            tabStack.trailingAnchor.constraint(lessThanOrEqualTo: addTabButton.leadingAnchor, constant: -4),
            addTabButton.centerYAnchor.constraint(equalTo: tabBar.centerYAnchor, constant: 2),
            addTabButton.trailingAnchor.constraint(equalTo: tabSearchButton.leadingAnchor, constant: -2),
            tabSearchButton.centerYAnchor.constraint(equalTo: addTabButton.centerYAnchor),
            tabSearchButton.trailingAnchor.constraint(equalTo: tabBar.trailingAnchor, constant: -7),
        ])

        toolbar.orientation = .horizontal
        toolbar.alignment = .centerY
        toolbar.spacing = 5
        toolbar.edgeInsets = NSEdgeInsets(top: 5, left: 8, bottom: 5, right: 8)
        toolbar.wantsLayer = true
        toolbar.heightAnchor.constraint(equalToConstant: 46).isActive = true
        rootStack.addArrangedSubview(toolbar)
        configureIconButton(backButton, symbol: "chevron.left", help: "Back", action: #selector(backAction))
        configureIconButton(forwardButton, symbol: "chevron.right", help: "Forward", action: #selector(forwardAction))
        configureIconButton(reloadButton, symbol: "arrow.clockwise", help: "Reload", action: #selector(reloadAction))
        configureIconButton(homeButton, symbol: "house", help: "Home", action: #selector(homeAction))
        toolbar.addArrangedSubview(backButton)
        toolbar.addArrangedSubview(forwardButton)
        toolbar.addArrangedSubview(reloadButton)
        toolbar.addArrangedSubview(homeButton)

        addressField.placeholderString = "Search Google or enter an address"
        addressField.font = .systemFont(ofSize: 13)
        addressField.isBezeled = true
        addressField.isBordered = true
        addressField.bezelStyle = .roundedBezel
        addressField.focusRingType = .none
        addressField.delegate = self
        addressField.target = self
        addressField.action = #selector(addressAction)
        addressField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        toolbar.addArrangedSubview(addressField)

        progress.isIndeterminate = false
        progress.minValue = 0
        progress.maxValue = 1
        progress.controlSize = .small
        progress.style = .bar
        progress.isHidden = true
        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.heightAnchor.constraint(equalToConstant: 2).isActive = true
        rootStack.addArrangedSubview(progress)

        contentViewContainer.wantsLayer = true
        contentViewContainer.translatesAutoresizingMaskIntoConstraints = false
        rootStack.addArrangedSubview(contentViewContainer)
        contentViewContainer.widthAnchor.constraint(equalTo: rootStack.widthAnchor).isActive = true
    }

    private func configureIconButton(_ button: NSButton, symbol: String, help: String, action: Selector) {
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: help)
        button.imagePosition = .imageOnly
        button.title = ""
        button.bezelStyle = .texturedRounded
        button.isBordered = false
        button.toolTip = help
        button.target = self
        button.action = action
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: 30).isActive = true
        button.heightAnchor.constraint(equalToConstant: 30).isActive = true
    }

    private func makeConfiguration(_ supplied: WKWebViewConfiguration? = nil) -> WKWebViewConfiguration {
        if let supplied { return supplied }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.setURLSchemeHandler(assetHandler, forURLScheme: "shellular")
        return configuration
    }

    private func makeTab(
        id: String = UUID().uuidString,
        url: String,
        title: String,
        remoteHostId: String? = nil,
        configuration: WKWebViewConfiguration? = nil
    ) -> BrowserTab {
        let webView = WKWebView(frame: .zero, configuration: makeConfiguration(configuration))
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.translatesAutoresizingMaskIntoConstraints = false
        let tab = BrowserTab(id: id, webView: webView, displayURL: url, title: title, remoteHostId: remoteHostId)
        observe(tab)
        return tab
    }

    private func observe(_ tab: BrowserTab) {
        tab.observations = [
            tab.webView.observe(\.title, options: [.new]) { [weak self, weak tab] _, change in
                guard let self, let tab, let title = change.newValue ?? nil, !title.isEmpty else { return }
                tab.title = title
                self.refreshChrome()
                self.saveSession()
            },
            tab.webView.observe(\.url, options: [.new]) { [weak self, weak tab] _, change in
                guard let self, let tab, let url = change.newValue ?? nil,
                      !url.absoluteString.hasPrefix("about:") else { return }
                tab.displayURL = url.absoluteString
                self.refreshChrome()
                self.saveSession()
            },
            tab.webView.observe(\.estimatedProgress, options: [.new]) { [weak self, weak tab] _, change in
                guard let self, tab?.id == self.activeId else { return }
                self.progress.doubleValue = change.newValue ?? 0
            },
            tab.webView.observe(\.isLoading, options: [.new]) { [weak self, weak tab] _, _ in
                guard let self, tab?.id == self.activeId else { return }
                self.refreshChrome()
            },
        ]
    }

    private var activeTab: BrowserTab? { tabs.first { $0.id == activeId } }

    private func selectTab(_ id: String) {
        guard let tab = tabs.first(where: { $0.id == id }) else { return }
        activeId = id
        for subview in contentViewContainer.subviews { subview.removeFromSuperview() }
        contentViewContainer.addSubview(tab.webView)
        NSLayoutConstraint.activate([
            tab.webView.leadingAnchor.constraint(equalTo: contentViewContainer.leadingAnchor),
            tab.webView.trailingAnchor.constraint(equalTo: contentViewContainer.trailingAnchor),
            tab.webView.topAnchor.constraint(equalTo: contentViewContainer.topAnchor),
            tab.webView.bottomAnchor.constraint(equalTo: contentViewContainer.bottomAnchor),
        ])
        rebuildTabStrip()
        refreshChrome()
        saveSession()
        if tab.needsRestoreLoad {
            tab.needsRestoreLoad = false
            if tab.displayURL == "shellular://home" { loadHome(tab) }
            else if let url = URL(string: tab.displayURL) { navigate(tab, to: url) }
        }
    }

    private func newHomeTab() {
        let tab = makeTab(url: "shellular://home", title: "New Tab")
        tabs.append(tab)
        selectTab(tab.id)
        loadHome(tab)
    }

    private func closeTab(_ id: String) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let tab = tabs[index]
        if !tab.ephemeral, !tab.displayURL.isEmpty {
            closedTabs.append(SavedBrowserTab(id: tab.id, url: tab.displayURL, title: tab.title, remoteHostId: tab.remoteHostId))
            if closedTabs.count > 10 { closedTabs.removeFirst() }
        }
        tab.webView.stopLoading()
        tab.webView.removeFromSuperview()
        tabs.remove(at: index)
        if tabs.isEmpty {
            saveSession()
            window?.close()
            return
        }
        if activeId == id { selectTab(tabs[min(index, tabs.count - 1)].id) }
        else { rebuildTabStrip(); saveSession() }
    }

    private func rebuildTabStrip() {
        for view in tabStack.arrangedSubviews {
            tabStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
        for tab in tabs {
            let item = NSView()
            item.wantsLayer = true
            item.layer?.cornerRadius = 7
            item.layer?.backgroundColor = (tab.id == activeId ? primaryColor : secondaryColor).cgColor
            let select = IdentifiedButton(title: tab.title.isEmpty ? "New Tab" : tab.title, target: self, action: #selector(selectTabAction(_:)))
            select.value = tab.id
            select.isBordered = false
            select.alignment = .left
            select.lineBreakMode = .byTruncatingTail
            select.font = .systemFont(ofSize: 12, weight: tab.id == activeId ? .medium : .regular)
            select.contentTintColor = textColor
            let close = IdentifiedButton(image: NSImage(systemSymbolName: "xmark", accessibilityDescription: "Close Tab")!, target: self, action: #selector(closeTabAction(_:)))
            close.value = tab.id
            close.isBordered = false
            close.toolTip = "Close Tab"
            select.translatesAutoresizingMaskIntoConstraints = false
            close.translatesAutoresizingMaskIntoConstraints = false
            item.addSubview(select)
            item.addSubview(close)
            item.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                item.widthAnchor.constraint(greaterThanOrEqualToConstant: 90),
                item.widthAnchor.constraint(lessThanOrEqualToConstant: 220),
                item.heightAnchor.constraint(equalToConstant: 29),
                select.leadingAnchor.constraint(equalTo: item.leadingAnchor, constant: 8),
                select.centerYAnchor.constraint(equalTo: item.centerYAnchor),
                select.trailingAnchor.constraint(equalTo: close.leadingAnchor, constant: -2),
                close.trailingAnchor.constraint(equalTo: item.trailingAnchor, constant: -5),
                close.centerYAnchor.constraint(equalTo: item.centerYAnchor),
                close.widthAnchor.constraint(equalToConstant: 18),
            ])
            tabStack.addArrangedSubview(item)
        }
    }

    private func refreshChrome() {
        guard let tab = activeTab else { return }
        let isInternalPage = tab.displayURL.hasPrefix("shellular://")
        let isLoading = !isInternalPage && tab.webView.isLoading
        addressField.stringValue = tab.displayURL.hasPrefix("shellular://") ? "" : tab.displayURL
        backButton.isEnabled = tab.webView.canGoBack
        forwardButton.isEnabled = tab.webView.canGoForward
        reloadButton.image = NSImage(systemSymbolName: isLoading ? "xmark" : "arrow.clockwise", accessibilityDescription: isLoading ? "Stop" : "Reload")
        progress.isHidden = !isLoading
        progress.doubleValue = isInternalPage ? 1 : tab.webView.estimatedProgress
        window?.title = tab.title.isEmpty ? "Shellular Browser" : "\(tab.title) — Shellular Browser"
        rebuildTabStrip()
    }

    private func navigate(_ tab: BrowserTab, to url: URL) {
        if url.scheme == "shellular" {
            loadInternalPage(tab, name: url.host ?? "home")
            return
        }
        tab.internalRequestId = nil
        if isLoopback(url), context.transport == "remote" {
            guard context.canProxyRemote, let hostId = context.hostId else {
                tab.displayURL = url.absoluteString
                tab.remoteHostId = tab.remoteHostId ?? context.hostId
                showConnectionError(tab, expectedHostId: tab.remoteHostId)
                return
            }
            if let expected = tab.remoteHostId, expected != hostId {
                showConnectionError(tab, expectedHostId: expected)
                return
            }
            tab.remoteHostId = hostId
            let port = url.port ?? (url.scheme == "https" ? 443 : 80)
            guard url.scheme == "http" else {
                showError(tab, title: "Remote HTTPS unavailable", message: "This remote HTTPS endpoint requires the secure tunnel capability. Try the HTTP development URL or update the host CLI.")
                return
            }
            guard let mainWebView, EmbeddedProxyServer.shared.startServer(port: port, webView: mainWebView) else {
                showError(tab, title: "Port unavailable on this Mac", message: "Shellular could not reserve local port \(port) for the remote host. Close the local service using that port and retry.")
                return
            }
        } else if context.transport != "remote" {
            tab.remoteHostId = nil
        }
        tab.displayURL = url.absoluteString
        tab.webView.load(URLRequest(url: url))
        refreshChrome()
        saveSession()
    }

    private func loadHome(_ tab: BrowserTab) {
        tab.internalRequestId = nil
        tab.webView.stopLoading()
        tab.displayURL = "shellular://home"
        tab.title = "New Tab"
        tab.webView.loadHTMLString(homeDocument, baseURL: nil)
        refreshChrome()
        saveSession()
    }

    private func loadInternalPage(_ tab: BrowserTab, name: String) {
        if name == "home" {
            loadHome(tab)
            return
        }
        guard name == "ports", let mainWebView else {
            showInternalError(tab, name: name, message: "This internal page is unavailable.")
            return
        }

        let requestId = UUID()
        tab.internalRequestId = requestId
        tab.webView.stopLoading()
        tab.displayURL = "shellular://\(name)"
        tab.title = name.capitalized
        tab.webView.loadHTMLString(Self.internalLoadingHTML, baseURL: nil)
        refreshChrome()
        saveSession()

        mainWebView.callAsyncJavaScript(
            "return await window.__shellularPage(name)",
            arguments: ["name": name],
            in: nil,
            in: .page
        ) { [weak self, weak tab] result in
            DispatchQueue.main.async {
                guard let self, let tab, tab.internalRequestId == requestId else { return }
                switch result {
                case .success(let value):
                    guard let html = value as? String, !html.isEmpty else {
                        self.showInternalError(tab, name: name, message: "Shellular returned an empty page.")
                        return
                    }
                    tab.internalRequestId = nil
                    tab.webView.loadHTMLString(html, baseURL: nil)
                    self.refreshChrome()
                case .failure(let error):
                    self.showInternalError(tab, name: name, message: error.localizedDescription)
                }
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self, weak tab] in
            guard let self, let tab, tab.internalRequestId == requestId else { return }
            self.showInternalError(tab, name: name, message: "The page took too long to load.")
        }
    }

    private func showInternalError(_ tab: BrowserTab, name: String, message: String) {
        tab.internalRequestId = nil
        tab.displayURL = "shellular://\(name)"
        tab.title = name.capitalized
        let retryURL = "shellular://\(escapeHTML(name))"
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        <style>html{color-scheme:light dark}body{font:14px -apple-system;padding:48px;max-width:620px;margin:auto}h1{font-size:22px}p{line-height:1.55;opacity:.75}a{display:inline-block;color:inherit;text-decoration:none;padding:8px 14px;border-radius:8px;border:1px solid #888}</style>
        <h1>Unable to load \(escapeHTML(tab.title))</h1><p>\(escapeHTML(message))</p><a href="\(retryURL)">Retry</a>
        """
        tab.webView.loadHTMLString(html, baseURL: nil)
        refreshChrome()
    }

    private func showConnectionError(_ tab: BrowserTab, expectedHostId: String?) {
        let expected = expectedHostId ?? "the original remote host"
        showError(tab, title: "Remote host unavailable", message: "Reconnect to \(expected) before reloading this localhost tab. Shellular will not open the Mac's localhost in its place.")
    }

    private func showError(_ tab: BrowserTab, title: String, message: String) {
        tab.internalRequestId = nil
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        <style>html{color-scheme:light dark}body{font:14px -apple-system;padding:48px;max-width:620px;margin:auto}h1{font-size:22px}p{line-height:1.55;opacity:.75}button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #888;background:transparent}</style>
        <h1>\(escapeHTML(title))</h1><p>\(escapeHTML(message))</p><button onclick="location.reload()">Retry</button>
        """
        tab.webView.loadHTMLString(html, baseURL: nil)
        refreshChrome()
    }

    private func saveSession() {
        let saved = tabs.compactMap { tab -> SavedBrowserTab? in
            guard !tab.ephemeral, !tab.displayURL.isEmpty else { return nil }
            return SavedBrowserTab(id: tab.id, url: tab.displayURL, title: tab.title, remoteHostId: tab.remoteHostId)
        }
        guard let data = try? JSONEncoder().encode(SavedBrowserSession(tabs: saved, activeId: activeId)) else { return }
        UserDefaults.standard.set(data, forKey: Self.sessionKey)
    }

    private func restoreSession(loadTabs: Bool = true) {
        guard loadTabs,
              let data = UserDefaults.standard.data(forKey: Self.sessionKey),
              let saved = try? JSONDecoder().decode(SavedBrowserSession.self, from: data) else { return }
        for item in saved.tabs.prefix(30) {
            guard ["shellular://home", "shellular://ports"].contains(item.url) || BrowserAddressResolver.isRestorable(item.url) else { continue }
            let tab = makeTab(id: item.id, url: item.url, title: item.title, remoteHostId: item.remoteHostId)
            tab.needsRestoreLoad = true
            tabs.append(tab)
        }
        let selected = tabs.first(where: { $0.id == saved.activeId }) ?? tabs.first
        if let selected { selectTab(selected.id) }
    }

    private func reopenClosedTab() {
        guard let saved = closedTabs.popLast(), let url = URL(string: saved.url) else { return }
        let tab = makeTab(url: saved.url, title: saved.title, remoteHostId: saved.remoteHostId)
        tabs.append(tab)
        selectTab(tab.id)
        navigate(tab, to: url)
    }

    func handleKeyEquivalent(_ event: NSEvent) -> Bool {
        guard event.type == .keyDown else { return false }
        let command = event.modifierFlags.contains(.command)
        let shift = event.modifierFlags.contains(.shift)
        let control = event.modifierFlags.contains(.control)
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
        if command && shift && key == "t" { reopenClosedTab(); return true }
        if command && shift && key == "a" { searchTabsAction(); return true }
        if command && key == "t" { newHomeTab(); return true }
        if command && key == "w" { if let activeId { closeTab(activeId) }; return true }
        if command && key == "l" { window?.makeFirstResponder(addressField); addressField.selectText(nil); return true }
        if command && key == "r" { reloadAction(); return true }
        if command, let number = Int(key), (1...9).contains(number), !tabs.isEmpty {
            selectTab(tabs[min(number - 1, tabs.count - 1)].id); return true
        }
        if control && key == "\t" {
            selectRelativeTab(shift ? -1 : 1); return true
        }
        return false
    }

    private func selectRelativeTab(_ delta: Int) {
        guard let activeId, let index = tabs.firstIndex(where: { $0.id == activeId }), !tabs.isEmpty else { return }
        selectTab(tabs[(index + delta + tabs.count) % tabs.count].id)
    }

    @objc private func newTabAction() { newHomeTab() }
    @objc private func selectTabAction(_ sender: IdentifiedButton) { selectTab(sender.value) }
    @objc private func closeTabAction(_ sender: IdentifiedButton) { closeTab(sender.value) }
    @objc private func backAction() { activeTab?.webView.goBack() }
    @objc private func forwardAction() { activeTab?.webView.goForward() }
    @objc private func reloadAction() {
        guard let tab = activeTab else { return }
        if !tab.displayURL.hasPrefix("shellular://"), tab.webView.isLoading { tab.webView.stopLoading() }
        else if let url = URL(string: tab.displayURL), url.scheme == "shellular" {
            loadInternalPage(tab, name: url.host ?? "home")
        }
        else if let url = URL(string: tab.displayURL) { navigate(tab, to: url) }
    }
    @objc private func homeAction() { if let tab = activeTab { loadHome(tab) } }
    @objc private func addressAction() {
        guard let tab = activeTab, let url = BrowserAddressResolver.resolve(addressField.stringValue) else { return }
        navigate(tab, to: url)
    }
    @objc private func searchTabsAction() {
        let menu = NSMenu(title: "Open Tabs")
        for tab in tabs {
            let item = NSMenuItem(title: tab.title.isEmpty ? tab.displayURL : tab.title, action: #selector(tabMenuAction(_:)), keyEquivalent: "")
            item.representedObject = tab.id
            item.target = self
            item.state = tab.id == activeId ? .on : .off
            menu.addItem(item)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: tabSearchButton.bounds.height + 4), in: tabSearchButton)
    }
    @objc private func tabMenuAction(_ sender: NSMenuItem) {
        if let id = sender.representedObject as? String { selectTab(id) }
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)) { addressAction(); return true }
        return false
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let tab = tabs.first(where: { $0.webView === webView }), let url = navigationAction.request.url else {
            return decisionHandler(.cancel)
        }
        if url.scheme == "shellular" {
            loadInternalPage(tab, name: url.host ?? "home")
            decisionHandler(.cancel)
            return
        }
        if navigationAction.targetFrame == nil {
            let newTab = makeTab(url: url.absoluteString, title: url.host ?? "New Tab")
            tabs.append(newTab)
            selectTab(newTab.id)
            navigate(newTab, to: url)
            decisionHandler(.cancel)
            return
        }
        if isLoopback(url), context.transport == "remote" {
            let expected = tab.remoteHostId ?? context.hostId
            if !context.canProxyRemote || expected != context.hostId {
                tab.remoteHostId = expected
                showConnectionError(tab, expectedHostId: expected)
                decisionHandler(.cancel)
                return
            }
            guard url.scheme == "http" else {
                showError(tab, title: "Remote HTTPS unavailable", message: "This remote HTTPS endpoint requires the secure tunnel capability. Try the HTTP development URL or update the host CLI.")
                decisionHandler(.cancel)
                return
            }
            let port = url.port ?? 80
            guard let mainWebView, EmbeddedProxyServer.shared.startServer(port: port, webView: mainWebView) else {
                showError(tab, title: "Port unavailable on this Mac", message: "Shellular could not reserve local port \(port) for the remote host. Close the local service using that port and retry.")
                decisionHandler(.cancel)
                return
            }
            tab.remoteHostId = context.hostId
        }
        tab.displayURL = url.absoluteString
        decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let tab = tabs.first(where: { $0.webView === webView }) else { return }
        tab.title = webView.title ?? tab.title
        refreshChrome()
        saveSession()
        guard !tab.displayURL.hasPrefix("shellular://") else { return }
        guard let mainWebView else { return }
        let entry: [String: Any] = ["url": tab.displayURL, "title": tab.title, "favicon": ""]
        mainWebView.callAsyncJavaScript(
            "window.__shellularHistory && window.__shellularHistory(entry); return await window.__shellularPage('home')",
            arguments: ["entry": entry],
            in: nil,
            in: .page
        ) { [weak self] result in
            guard case .success(let value) = result, let html = value as? String, !html.isEmpty else { return }
            DispatchQueue.main.async { self?.homeDocument = html }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard let tab = tabs.first(where: { $0.webView === webView }), (error as NSError).code != NSURLErrorCancelled else { return }
        showError(tab, title: "Page unavailable", message: error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard let tab = tabs.first(where: { $0.webView === webView }) else { return }
        showError(tab, title: "Page stopped responding", message: "The WebKit content process ended. Reload the tab to continue.")
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = navigationAction.request.url?.absoluteString ?? ""
        let tab = makeTab(url: url, title: navigationAction.request.url?.host ?? "New Tab", configuration: configuration)
        tabs.append(tab)
        selectTab(tab.id)
        return tab.webView
    }

    func webViewDidClose(_ webView: WKWebView) {
        if let tab = tabs.first(where: { $0.webView === webView }) { closeTab(tab.id) }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.beginSheetModal(for: window!) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        presentJavaScriptAlert(message: message, buttons: ["OK"]) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        presentJavaScriptAlert(message: message, buttons: ["OK", "Cancel"]) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let field = NSTextField(string: defaultText ?? "")
        field.frame.size.width = 320
        presentJavaScriptAlert(message: prompt, buttons: ["OK", "Cancel"], accessory: field) {
            completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil)
        }
    }

    private func presentJavaScriptAlert(message: String, buttons: [String], accessory: NSView? = nil, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        let alert = NSAlert()
        alert.messageText = activeTab?.title ?? "Shellular Browser"
        alert.informativeText = message
        buttons.forEach { alert.addButton(withTitle: $0) }
        alert.accessoryView = accessory
        if let window { alert.beginSheetModal(for: window, completionHandler: completion) }
        else { completion(alert.runModal()) }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.beginSheetModal(for: window!) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func downloadDidFinish(_ download: WKDownload) {}
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        presentJavaScriptAlert(message: error.localizedDescription, buttons: ["OK"]) { _ in }
    }

    func windowWillClose(_ notification: Notification) {
        saveSession()
        EmbeddedProxyServer.shared.cancelAllPending()
        EmbeddedProxyServer.shared.stopAll()
        onClose?()
    }

    private static let fallbackHomeHTML = """
    <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <style>html{color-scheme:light dark}body{font:15px -apple-system;display:grid;place-items:center;min-height:90vh;margin:0}main{text-align:center;width:min(560px,80vw)}h1{font-size:30px}p{opacity:.65}</style>
    <main><h1>Shellular</h1><p>Use the address bar to search or open a development URL.</p></main>
    """

    private static let internalLoadingHTML = """
    <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <style>html{color-scheme:light dark}body{font:14px -apple-system;display:grid;place-items:center;min-height:90vh;margin:0}p{opacity:.65}</style>
    <p>Loading…</p>
    """
}

enum BrowserAddressResolver {
    static func resolve(_ input: String) -> URL? {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return URL(string: "shellular://home") }
        if let url = URL(string: value), url.scheme != nil { return url }
        if value.contains(" ") {
            return searchURL(value)
        }
        let lower = value.lowercased()
        if lower.hasPrefix("localhost") || lower.hasPrefix("127.") || lower.hasPrefix("0.0.0.0") || value.range(of: #"^[^/\s]+:\d+"#, options: .regularExpression) != nil {
            return URL(string: "http://\(value)")
        }
        if value.contains(".") { return URL(string: "https://\(value)") }
        return searchURL(value)
    }

    static func isRestorable(_ value: String) -> Bool {
        guard let scheme = URL(string: value)?.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }

    private static func searchURL(_ query: String) -> URL? {
        var components = URLComponents(string: "https://www.google.com/search")
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        return components?.url
    }
}

private final class ShellularAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.host == "assets" else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let filename = url.lastPathComponent
        let bundleURL = Bundle.main.bundleURL.appendingPathComponent("bundle/\(filename)")
        guard let data = try? Data(contentsOf: bundleURL) else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let mime = filename.hasSuffix(".css") ? "text/css" : filename.hasSuffix(".ttf") ? "font/ttf" : "application/octet-stream"
        let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil)
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

private func isLoopback(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    return host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" || host == "::1" || host.hasSuffix(".localhost")
}

private func escapeHTML(_ value: String) -> String {
    value.replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
}

private extension NSColor {
    convenience init?(hex: String?) {
        guard var value = hex?.trimmingCharacters(in: .whitespacesAndNewlines), value.hasPrefix("#") else { return nil }
        value.removeFirst()
        guard value.count == 6, let rgb = Int(value, radix: 16) else { return nil }
        self.init(
            red: CGFloat((rgb >> 16) & 0xff) / 255,
            green: CGFloat((rgb >> 8) & 0xff) / 255,
            blue: CGFloat(rgb & 0xff) / 255,
            alpha: 1
        )
    }
}
