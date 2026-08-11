import AppKit
import AuthenticationServices
import CryptoKit
import Security
import UniformTypeIdentifiers
import WebKit

private struct BrowserConnectionContext: Equatable {
    let status: String
    let transport: String?
    let hostId: String?
    let hostName: String?
    let tcpTunnelVersion: Int?

    init(_ value: Any?) {
        let data = value as? [String: Any] ?? [:]
        status = data["status"] as? String ?? "disconnected"
        transport = data["transport"] as? String
        hostId = data["hostId"] as? String
        hostName = data["hostName"] as? String
        tcpTunnelVersion = data["tcpTunnelVersion"] as? Int
    }

    var canProxyRemote: Bool {
        transport == "remote" && status == "connected" && hostId != nil
    }

    var canTunnelRemote: Bool {
        canProxyRemote && tcpTunnelVersion == 1
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
                self.browserWindow?.updateTheme(theme, homeDocument: homeDocument)
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
                controller.updateTheme(theme, homeDocument: homeDocument)
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
                controller.onRequestPopOut = { [weak self, weak controller] in
                    guard let self, let controller else { return }
                    controller.presentInWindow()
                    self.viewController?.hideBrowserSidebar()
                }
                controller.onRequestDock = { [weak self, weak controller] reveal in
                    guard let self, let controller, let viewController = self.viewController else { return }
                    controller.presentInSidebar()
                    viewController.showBrowserSidebar(controller.browserView)
                    if !reveal { viewController.hideBrowserSidebar() }
                }
                controller.onRequestCloseSidebar = { [weak self] in
                    self?.viewController?.hideBrowserSidebar()
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
            if controller.isPresentedInWindow {
                controller.showWindow(nil)
                controller.window?.makeKeyAndOrderFront(nil)
            } else if let viewController = self.viewController {
                controller.presentInSidebar()
                viewController.showBrowserSidebar(controller.browserView)
                viewController.view.window?.makeKeyAndOrderFront(nil)
            }
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

private enum BrowserSecurityState {
    case internalPage
    case secure
    case notSecure
    case unsafeCertificate
}

private enum BrowserDocumentKind: Equatable {
    case external
    case shellular(String)
    case browserUI

    var isShellularOwned: Bool {
        switch self {
        case .shellular, .browserUI: return true
        case .external: return false
        }
    }
}

private struct PendingCertificateWarning {
    let token: String
    let exception: BrowserTrustException
    let url: URL
    let details: String
}

private struct BrowserCertificateMetadata {
    let exception: BrowserTrustException
    let subject: String
    let details: String
}

private final class BrowserTab {
    let id: String
    let webView: BrowserInspectableWebView
    let viewportHost: BrowserViewportHostView
    var displayURL: String
    var title: String
    var remoteHostId: String?
    var remoteTunnelPort: Int?
    var remoteTunnelHost: String?
    var ephemeral = false
    var needsRestoreLoad = false
    var internalRequestId: UUID?
    var securityState: BrowserSecurityState = .internalPage
    var certificateWarning: PendingCertificateWarning?
    var activeTrustException: BrowserTrustException?
    var lastFailedURL: URL?
    var documentKind: BrowserDocumentKind = .external
    var developerTools: BrowserDeveloperToolsState
    var observations: [NSKeyValueObservation] = []

    init(
        id: String = UUID().uuidString,
        webView: BrowserInspectableWebView,
        viewportHost: BrowserViewportHostView,
        displayURL: String,
        title: String,
        remoteHostId: String? = nil,
        developerToolsPanelPercent: CGFloat
    ) {
        self.id = id
        self.webView = webView
        self.viewportHost = viewportHost
        self.displayURL = displayURL
        self.title = title
        self.remoteHostId = remoteHostId
        developerTools = BrowserDeveloperToolsState(
            panelPercent: developerToolsPanelPercent
        )
    }
}

private final class BrowserWindowController:
    NSWindowController,
    NSWindowDelegate,
    WKNavigationDelegate,
    WKUIDelegate,
    WKDownloadDelegate,
    WKScriptMessageHandler,
    NSTextFieldDelegate {
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
    private let developerToolsUserScript: WKUserScript?
    private let developerToolsMessageHandler = BrowserWeakScriptMessageHandler()
    private let browserUserContentController = WKUserContentController()
    private let developerToolsPanelSizeStore: BrowserDeveloperToolsPanelSizeStore
    private var preferredDeveloperToolsPanelPercent: CGFloat
    private let trustExceptions = BrowserTrustExceptionStore()
    private let warningTokens = BrowserOneTimeTokenStore()
    private let trustEvaluationQueue = DispatchQueue(
        label: "org.shellular.browser.trust-evaluation",
        qos: .userInitiated
    )

    private let windowHostView = NSView()
    private let rootView = NSView()
    private let resizeUnderlay = BrowserResizeUnderlayView()
    private let rootStack = NSStackView()
    private let tabHeader = BrowserTabHeaderView()
    private let toolbar = NSStackView()
    private let backButton = NSButton()
    private let forwardButton = NSButton()
    private let reloadButton = NSButton()
    private let homeButton = NSButton()
    private let addressBar = BrowserAddressBar()
    private let developerToolsButton = NSButton()
    private let moreButton = NSButton()
    private let progress = NSProgressIndicator()
    private let contentViewContainer = NSView()
    private var isEditingAddress = false
    private var addressValidationError = false
    private var keyMonitor: Any?
    private var palette = BrowserChromePalette([:])
    var onClose: (() -> Void)?
    var onRequestPopOut: (() -> Void)?
    var onRequestDock: ((Bool) -> Void)?
    var onRequestCloseSidebar: (() -> Void)?
    private var presentation = BrowserPresentationState()
    var isPresentedInWindow: Bool { presentation.value == .window }
    var browserView: NSView { rootView }
    private var addressField: NSTextField { addressBar.textField }
    private var tabSearchButton: NSButton { tabHeader.tabListButton }

    init(mainWebView: WKWebView?, context: BrowserConnectionContext, theme: [String: Any], homeDocument: String) {
        let panelSizeStore = BrowserDeveloperToolsPanelSizeStore()
        let panelPercent = panelSizeStore.load()
        developerToolsPanelSizeStore = panelSizeStore
        preferredDeveloperToolsPanelPercent = panelPercent
        let developerToolsRuntime = BrowserDeveloperToolsScript.loadRuntime()
        developerToolsUserScript = developerToolsRuntime.map {
            BrowserDeveloperToolsScript.makeUserScript(
                erudaSource: $0,
                panelPercent: panelPercent
            )
        }
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
        if let developerToolsUserScript {
            browserUserContentController.addUserScript(developerToolsUserScript)
            developerToolsMessageHandler.delegate = self
            browserUserContentController.add(
                developerToolsMessageHandler,
                name: BrowserDeveloperToolsScript.messageHandlerName
            )
        }
        if developerToolsRuntime == nil {
            let resourcePath = Bundle.main.resourceURL?.path ?? "<unavailable>"
            NSLog(
                "[Shellular Developer Tools] console.js is missing from %@; embedded developer tools are disabled",
                resourcePath
            )
        }
        window.commandHandler = self
        window.title = "Shellular Browser"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = false
        BrowserLiveResizePolicy.apply(to: window)
        window.center()
        window.delegate = self
        setupUI()
        applyTheme(theme)
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self,
                  !self.isPresentedInWindow,
                  event.window === self.rootView.window,
                  !self.rootView.isHiddenOrHasHiddenAncestor,
                  self.browserHasKeyboardFocus,
                  self.handleSidebarKeyEquivalent(event) else { return event }
            return nil
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        browserUserContentController.removeScriptMessageHandler(
            forName: BrowserDeveloperToolsScript.messageHandlerName
        )
        trustExceptions.removeAll()
        EmbeddedProxyServer.shared.cancelAllPending()
        EmbeddedProxyServer.shared.stopAll()
    }

    func updateContext(_ context: BrowserConnectionContext) {
        let changedHost = self.context.hostId != context.hostId ||
            self.context.transport != context.transport
        let changedTunnelCapability =
            self.context.tcpTunnelVersion != context.tcpTunnelVersion
        let lostRemoteConnection = self.context.canProxyRemote && !context.canProxyRemote
        self.context = context
        if changedHost || changedTunnelCapability || lostRemoteConnection {
            EmbeddedProxyServer.shared.cancelAllPending()
            EmbeddedProxyServer.shared.stopAll()
            for tab in tabs {
                tab.remoteTunnelPort = nil
                tab.remoteTunnelHost = nil
            }
            if let tab = activeTab, let remoteHostId = tab.remoteHostId, remoteHostId != context.hostId {
                showConnectionError(tab, expectedHostId: remoteHostId)
            }
        }
    }

    func updateTheme(_ value: [String: Any], homeDocument: String) {
        if !homeDocument.isEmpty { self.homeDocument = homeDocument }
        applyTheme(value)
    }

    private func applyTheme(_ value: [String: Any]) {
        theme = value
        palette = BrowserChromePalette(value)
        window?.backgroundColor = palette.primary
        windowHostView.layer?.backgroundColor = palette.primary.cgColor
        rootView.layer?.backgroundColor = palette.primary.cgColor
        contentViewContainer.layer?.backgroundColor = palette.primary.cgColor
        resizeUnderlay.apply(content: palette.primary, chrome: palette.chromeBackground)
        tabHeader.applyPalette(palette)
        toolbar.layer?.backgroundColor = palette.primary.cgColor
        addressBar.applyPalette(palette)
        addressBar.setValidationError(addressValidationError)
        progress.contentFilters = []
        if activeTab != nil { refreshChrome() }
        else { syncTabStrip() }
        for tab in tabs {
            tab.webView.underPageBackgroundColor = palette.primary
            tab.viewportHost.applyBackgroundColor(palette.primary)
            if tab.documentKind.isShellularOwned {
                applyTheme(to: tab)
            }
        }
    }

    private func applyTheme(to tab: BrowserTab) {
        guard tab.documentKind.isShellularOwned,
              let script = BrowserThemeScript.make(from: theme) else { return }
        tab.webView.evaluateJavaScript(script, completionHandler: nil)
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
            restoreSession()
        }
        if let tab = activeTab {
            navigate(tab, to: url)
            return
        }
        let tab = makeTab(url: url.absoluteString, title: url.host ?? "New Tab")
        tabs.append(tab)
        selectTab(tab.id)
        navigate(tab, to: url)
    }

    func openHTML(_ html: String) {
        if !restored {
            restored = true
            restoreSession()
        }
        if let tab = activeTab {
            tab.ephemeral = true
            tab.documentKind = .external
            tab.displayURL = ""
            tab.title = "Document"
            tab.webView.loadHTMLString(html, baseURL: nil)
            refreshChrome()
            return
        }
        let tab = makeTab(url: "", title: "Document")
        tab.ephemeral = true
        tab.documentKind = .external
        tabs.append(tab)
        selectTab(tab.id)
        tab.webView.loadHTMLString(html, baseURL: nil)
    }

    private func setupUI() {
        guard let window else { return }
        windowHostView.wantsLayer = true
        windowHostView.layerContentsRedrawPolicy = .duringViewResize
        window.contentView = windowHostView
        rootView.wantsLayer = true
        rootView.layerContentsRedrawPolicy = .duringViewResize
        BrowserViewAttachment.attach(rootView, to: windowHostView)

        resizeUnderlay.frame = rootView.bounds
        resizeUnderlay.autoresizingMask = [.width, .height]
        rootView.addSubview(resizeUnderlay)

        BrowserRootLayout.configure(stack: rootStack, content: contentViewContainer)
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        rootView.addSubview(rootStack)
        NSLayoutConstraint.activate([
            rootStack.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            rootStack.topAnchor.constraint(equalTo: rootView.topAnchor),
            rootStack.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),
        ])

        configureIconButton(
            tabHeader.addButton,
            symbol: "plus",
            help: "New Tab",
            action: #selector(newTabAction),
            fixedSize: false
        )
        configureIconButton(
            tabHeader.tabListButton,
            symbol: "chevron.down",
            help: "Show Tabs",
            action: #selector(searchTabsAction),
            fixedSize: false
        )
        configureIconButton(
            tabHeader.presentationButton,
            symbol: "arrow.up.right.square",
            help: "Open in Separate Window",
            action: #selector(presentationAction),
            fixedSize: false
        )
        configureIconButton(
            tabHeader.closeButton,
            symbol: "xmark",
            help: "Close Browser Sidebar",
            action: #selector(closeSidebarAction),
            fixedSize: false
        )
        rootStack.addArrangedSubview(tabHeader)

        toolbar.orientation = .horizontal
        toolbar.alignment = .centerY
        toolbar.distribution = .fill
        toolbar.spacing = 3
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
        addressField.delegate = self
        addressField.target = self
        addressField.action = #selector(addressAction)
        addressBar.securityButton.target = self
        addressBar.securityButton.action = #selector(securityAction)
        addressBar.clearButton.target = self
        addressBar.clearButton.action = #selector(clearAddressAction)
        toolbar.addArrangedSubview(addressBar)
        configureIconButton(
            developerToolsButton,
            symbol: "hammer",
            help: "Developer Tools (⌘⌥I or ⌘⇧I)",
            action: #selector(developerToolsAction)
        )
        configureIconButton(
            moreButton,
            symbol: "ellipsis.circle",
            help: "Browser Options",
            action: #selector(moreAction)
        )
        toolbar.addArrangedSubview(developerToolsButton)
        toolbar.addArrangedSubview(moreButton)

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
        contentViewContainer.layerContentsRedrawPolicy = .duringViewResize
        contentViewContainer.translatesAutoresizingMaskIntoConstraints = false
        rootStack.addArrangedSubview(contentViewContainer)
        contentViewContainer.widthAnchor.constraint(equalTo: rootStack.widthAnchor).isActive = true
        updatePresentationChrome()
    }

    func presentInSidebar() {
        window?.orderOut(nil)
        presentation.moveToSidebar()
        updatePresentationChrome()
    }

    func presentInWindow() {
        BrowserViewAttachment.attach(rootView, to: windowHostView)
        presentation.moveToWindow()
        updatePresentationChrome()
        rootView.layoutSubtreeIfNeeded()
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
    }

    private func updatePresentationChrome() {
        tabHeader.applyPresentation(presentation.value)
    }

    private func configureIconButton(
        _ button: NSButton,
        symbol: String,
        help: String,
        action: Selector,
        fixedSize: Bool = true
    ) {
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: help)
        button.imagePosition = .imageOnly
        button.title = ""
        button.bezelStyle = .texturedRounded
        button.isBordered = false
        button.toolTip = help
        button.target = self
        button.action = action
        button.translatesAutoresizingMaskIntoConstraints = false
        if fixedSize {
            button.widthAnchor.constraint(equalToConstant: 30).isActive = true
            button.heightAnchor.constraint(equalToConstant: 30).isActive = true
        }
    }

    private func makeConfiguration(_ supplied: WKWebViewConfiguration? = nil) -> WKWebViewConfiguration {
        let configuration: WKWebViewConfiguration
        if let supplied {
            configuration = supplied
        } else {
            configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
            configuration.setURLSchemeHandler(assetHandler, forURLScheme: "shellular")
        }
        configuration.userContentController = browserUserContentController
        return configuration
    }

    private func makeTab(
        id: String = UUID().uuidString,
        url: String,
        title: String,
        remoteHostId: String? = nil,
        configuration: WKWebViewConfiguration? = nil
    ) -> BrowserTab {
        let webView = BrowserInspectableWebView(
            frame: .zero,
            configuration: makeConfiguration(configuration)
        )
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        webView.embeddedDeveloperToolsAvailable = false
        webView.developerToolsVisibility = { [weak self, weak webView] in
            self?.tab(containing: webView)?.developerTools.isVisible ?? false
        }
        webView.elementHighlightVisibility = { [weak self, weak webView] in
            self?.tab(containing: webView)?.developerTools.isElementHighlighted ?? false
        }
        webView.onInspectElement = { [weak self, weak webView] in
            guard let self, let tab = self.tab(containing: webView) else { return }
            self.inspectElement(in: tab)
        }
        webView.onClearElementHighlight = { [weak self, weak webView] in
            guard let self, let tab = self.tab(containing: webView) else { return }
            self.clearElementHighlight(in: tab)
        }
        webView.onCloseDeveloperTools = { [weak self, weak webView] in
            guard let self, let tab = self.tab(containing: webView) else { return }
            self.closeDeveloperTools(in: tab)
        }
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = palette.primary
        let viewportHost = BrowserViewportHostView(webView: webView)
        viewportHost.applyBackgroundColor(palette.primary)
        let tab = BrowserTab(
            id: id,
            webView: webView,
            viewportHost: viewportHost,
            displayURL: url,
            title: title,
            remoteHostId: remoteHostId,
            developerToolsPanelPercent: preferredDeveloperToolsPanelPercent
        )
        if let internalURL = URL(string: url), internalURL.scheme == "shellular" {
            tab.documentKind = .shellular(internalURL.host ?? "home")
        }
        observe(tab)
        return tab
    }

    private func observe(_ tab: BrowserTab) {
        tab.observations = [
            tab.webView.observe(\.title, options: [.new]) { [weak self, weak tab] _, change in
                guard let self, let tab, tab.documentKind == .external,
                      let title = change.newValue ?? nil, !title.isEmpty else { return }
                tab.title = title
                self.refreshChrome()
                self.saveSession()
            },
            tab.webView.observe(\.url, options: [.new]) { [weak self, weak tab] _, change in
                guard let self, let tab, tab.documentKind == .external,
                      let url = change.newValue ?? nil,
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
    private func tab(containing webView: WKWebView?) -> BrowserTab? {
        guard let webView else { return nil }
        return tabs.first { $0.webView === webView }
    }
    private var presentationWindow: NSWindow? { rootView.window ?? window }
    private var browserHasKeyboardFocus: Bool {
        guard let firstResponder = rootView.window?.firstResponder else { return false }
        if firstResponder === addressField.currentEditor() { return true }
        guard let view = firstResponder as? NSView else { return false }
        return view === rootView || view.isDescendant(of: rootView)
    }

    private func selectTab(_ id: String) {
        guard let tab = tabs.first(where: { $0.id == id }) else { return }
        activeId = id
        for subview in contentViewContainer.subviews { subview.removeFromSuperview() }
        tab.viewportHost.translatesAutoresizingMaskIntoConstraints = false
        contentViewContainer.addSubview(tab.viewportHost)
        NSLayoutConstraint.activate([
            tab.viewportHost.leadingAnchor.constraint(equalTo: contentViewContainer.leadingAnchor),
            tab.viewportHost.trailingAnchor.constraint(equalTo: contentViewContainer.trailingAnchor),
            tab.viewportHost.topAnchor.constraint(equalTo: contentViewContainer.topAnchor),
            tab.viewportHost.bottomAnchor.constraint(equalTo: contentViewContainer.bottomAnchor),
        ])
        rootView.needsLayout = true
        rootView.layoutSubtreeIfNeeded()
        refreshChrome()
        saveSession()
        if tab.needsRestoreLoad {
            tab.needsRestoreLoad = false
            if let url = URL(string: tab.displayURL), url.scheme == "shellular" {
                loadInternalPage(tab, name: url.host ?? "home")
            } else if let url = URL(string: tab.displayURL) {
                navigate(tab, to: url)
            }
        }
    }

    private func newHomeTab() {
        let tab = makeTab(url: "shellular://home", title: "Home")
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
        releaseTunnel(for: tab)
        tab.viewportHost.removeFromSuperview()
        tabs.remove(at: index)
        if tabs.isEmpty {
            activeId = nil
            newHomeTab()
            return
        }
        if activeId == id { selectTab(tabs[min(index, tabs.count - 1)].id) }
        else { syncTabStrip(); saveSession() }
    }

    private func syncTabStrip() {
        let states = tabs.map { tab in
            BrowserTabItemState(
                id: tab.id,
                title: tab.title,
                isSelected: tab.id == activeId,
                statusColor: tab.id == activeId && tab.webView.isLoading
                    ? .systemOrange
                    : color(for: tab.securityState)
            )
        }
        tabHeader.reconcileTabs(
            states,
            onSelect: { [weak self] id in self?.selectTab(id) },
            onClose: { [weak self] id in self?.closeTab(id) }
        )
    }

    private func refreshChrome() {
        guard let tab = activeTab else { return }
        let isInternalPage = tab.documentKind.isShellularOwned
        let isLoading = !isInternalPage && tab.webView.isLoading
        if !isEditingAddress {
            addressField.stringValue = tab.displayURL
            clearAddressValidationError()
        }
        addressBar.updateClearButton(isEditing: isEditingAddress)
        backButton.isEnabled = tab.webView.canGoBack
        forwardButton.isEnabled = tab.webView.canGoForward
        reloadButton.image = NSImage(systemSymbolName: isLoading ? "xmark" : "arrow.clockwise", accessibilityDescription: isLoading ? "Stop" : "Reload")
        progress.isHidden = !isLoading
        progress.doubleValue = isInternalPage ? 1 : tab.webView.estimatedProgress
        let canRequestDeveloperTools = BrowserDeveloperToolsAvailability.canRequestVisibility(
            hasRuntime: developerToolsUserScript != nil,
            state: tab.developerTools
        )
        developerToolsButton.isEnabled = canRequestDeveloperTools
        developerToolsButton.state = tab.developerTools.isVisible ? .on : .off
        developerToolsButton.isBordered = tab.developerTools.isVisible
        developerToolsButton.contentTintColor = tab.developerTools.isVisible
            ? palette.accent
            : palette.secondaryText
        if developerToolsUserScript == nil {
            developerToolsButton.toolTip = BrowserDeveloperToolsContextMenu.unavailableToolTip
        } else if tab.developerTools.initializationFailed {
            developerToolsButton.toolTip = BrowserDeveloperToolsContextMenu.initializationFailedToolTip
        } else if tab.developerTools.isReady {
            developerToolsButton.toolTip = "Developer Tools (⌘⌥I or ⌘⇧I)"
        } else {
            developerToolsButton.toolTip = "Developer Tools are loading"
        }
        window?.title = tab.title.isEmpty ? "Shellular Browser" : "\(tab.title) — Shellular Browser"
        updateSecurityChrome(for: tab)
        syncTabStrip()
    }

    private func synchronizeDeveloperTools(for tab: BrowserTab) {
        guard developerToolsUserScript != nil else { return }
        let command = """
        \(BrowserDeveloperToolsScript.panelPercentCommand(tab.developerTools.panelPercent))
        \(BrowserDeveloperToolsScript.visibilityCommand(isVisible: tab.developerTools.isVisible))
        """
        tab.webView.evaluateJavaScript(command) { _, error in
            if let error {
                NSLog(
                    "[Shellular Developer Tools] Failed to synchronize tab %@: %@",
                    tab.id,
                    error.localizedDescription
                )
            }
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == BrowserDeveloperToolsScript.messageHandlerName,
              let snapshot = BrowserDeveloperToolsSnapshot(payload: message.body),
              let tab = tab(containing: message.webView) else { return }

        let wasReady = tab.developerTools.isReady
        let desiredVisibility = tab.developerTools.isVisible
        let desiredPanelPercent = tab.developerTools.panelPercent
        tab.developerTools.apply(
            snapshot,
            preserveVisibility: !wasReady && snapshot.ready,
            preservePanelPercent: !wasReady
        )
        tab.webView.embeddedDeveloperToolsAvailable = snapshot.ready

        if !snapshot.ready {
            NSLog(
                "[Shellular Developer Tools] console.js failed to initialize in tab %@; embedded developer tools are disabled",
                tab.id
            )
        }

        if wasReady, snapshot.ready,
           snapshot.panelPercent != preferredDeveloperToolsPanelPercent {
            persistDeveloperToolsPanelPercent(
                snapshot.panelPercent,
                sourceTab: tab
            )
        } else if !wasReady, snapshot.ready,
                  desiredVisibility != snapshot.isVisible ||
                  desiredPanelPercent != snapshot.panelPercent {
            synchronizeDeveloperTools(for: tab)
        }
        if tab.id == activeId { refreshChrome() }
    }

    private func persistDeveloperToolsPanelPercent(
        _ panelPercent: CGFloat,
        sourceTab: BrowserTab
    ) {
        let value = BrowserDeveloperToolsMetrics.clamp(panelPercent)
        preferredDeveloperToolsPanelPercent = value
        developerToolsPanelSizeStore.save(value)
        for tab in tabs {
            tab.developerTools.setPanelPercent(value)
            guard tab !== sourceTab, tab.developerTools.isReady else { continue }
            tab.webView.evaluateJavaScript(
                BrowserDeveloperToolsScript.panelPercentCommand(value),
                completionHandler: nil
            )
        }
    }

    private func inspectElement(in tab: BrowserTab) {
        guard developerToolsUserScript != nil, tab.developerTools.isReady else { return }
        tab.developerTools.showElementHighlight()
        if tab.id == activeId { refreshChrome() }
        tab.webView.evaluateJavaScript(
            BrowserDeveloperToolsScript.inspectElementCommand()
        ) { accepted, error in
            if let error {
                NSLog(
                    "[Shellular Developer Tools] Failed to inspect an element in tab %@: %@",
                    tab.id,
                    error.localizedDescription
                )
            } else if accepted as? Bool != true {
                NSLog(
                    "[Shellular Developer Tools] Inspect Element was unavailable in tab %@",
                    tab.id
                )
            }
        }
    }

    private func clearElementHighlight(in tab: BrowserTab) {
        guard developerToolsUserScript != nil, tab.developerTools.isReady else { return }
        tab.developerTools.clearElementHighlight()
        if tab.id == activeId { refreshChrome() }
        tab.webView.evaluateJavaScript(
            BrowserDeveloperToolsScript.clearElementHighlightCommand()
        ) { accepted, error in
            if let error {
                NSLog(
                    "[Shellular Developer Tools] Failed to clear the element highlight in tab %@: %@",
                    tab.id,
                    error.localizedDescription
                )
            } else if accepted as? Bool != true {
                NSLog(
                    "[Shellular Developer Tools] Element highlight cleanup was unavailable in tab %@",
                    tab.id
                )
            }
        }
    }

    private func closeDeveloperTools(in tab: BrowserTab) {
        guard developerToolsUserScript != nil, tab.developerTools.isReady else { return }
        tab.developerTools.hide()
        synchronizeDeveloperTools(for: tab)
        if tab.id == activeId { refreshChrome() }
    }

    private func updateSecurityChrome(for tab: BrowserTab) {
        let symbol: String
        let help: String
        switch tab.securityState {
        case .internalPage:
            symbol = "info.circle"
            help = "Shellular internal page"
        case .secure:
            symbol = "lock.fill"
            help = "Connection is secure"
        case .notSecure:
            symbol = "exclamationmark.triangle"
            help = "Connection is not secure"
        case .unsafeCertificate:
            symbol = "lock.trianglebadge.exclamationmark"
            help = "Unsafe certificate exception active for this session"
        }
        addressBar.setSecurity(symbol: symbol, help: help, color: color(for: tab.securityState))
    }

    private func color(for state: BrowserSecurityState) -> NSColor {
        switch state {
        case .secure: return .systemGreen
        case .notSecure, .unsafeCertificate: return .systemOrange
        case .internalPage: return palette.secondaryText
        }
    }

    private func navigate(_ tab: BrowserTab, to url: URL) {
        if url.scheme == "shellular" {
            loadInternalPage(tab, name: url.host ?? "home")
            return
        }
        tab.documentKind = .external
        tab.certificateWarning = nil
        tab.lastFailedURL = nil
        if let exception = tab.activeTrustException,
           exception.host == url.host?.lowercased(),
           exception.port == (url.port ?? 443),
           url.scheme?.lowercased() == "https" {
            tab.securityState = .unsafeCertificate
        } else {
            tab.activeTrustException = nil
            tab.securityState = url.scheme?.lowercased() == "https" ? .secure : .notSecure
        }
        tab.internalRequestId = nil
        guard prepareRemoteNavigation(tab, to: url) else { return }
        tab.displayURL = url.absoluteString
        tab.webView.load(URLRequest(url: url))
        refreshChrome()
        saveSession()
    }

    private func releaseTunnel(for tab: BrowserTab) {
        guard let port = tab.remoteTunnelPort else { return }
        tab.remoteTunnelPort = nil
        tab.remoteTunnelHost = nil
        let isUsedByAnotherTab = tabs.contains {
            $0 !== tab && $0.remoteTunnelPort == port
        }
        if !isUsedByAnotherTab {
            EmbeddedProxyServer.shared.stopTunnelServer(port: port)
            EmbeddedProxyServer.shared.stopServer(port: port)
        }
    }

    private func prepareRemoteNavigation(_ tab: BrowserTab, to url: URL) -> Bool {
        guard isLoopback(url), context.transport == "remote" else {
            releaseTunnel(for: tab)
            if context.transport != "remote" { tab.remoteHostId = nil }
            return true
        }

        tab.displayURL = url.absoluteString
        guard context.canProxyRemote, let hostId = context.hostId else {
            tab.remoteHostId = tab.remoteHostId ?? context.hostId
            showConnectionError(tab, expectedHostId: tab.remoteHostId)
            return false
        }
        if let expected = tab.remoteHostId, expected != hostId {
            showConnectionError(tab, expectedHostId: expected)
            return false
        }

        let port = url.port ?? (url.scheme == "https" ? 443 : 80)
        let tunnelHost = normalizedTunnelHost(url.host)
        if tab.remoteTunnelPort != port || tab.remoteTunnelHost != tunnelHost {
            releaseTunnel(for: tab)
        }
        guard let mainWebView else {
            showError(
                tab,
                title: "Browser tunnel unavailable",
                message: "Shellular could not reach the app connection."
            )
            return false
        }

        let started: Bool
        if context.canTunnelRemote {
            started = EmbeddedProxyServer.shared.startTunnelServer(
                port: port,
                targetHost: tunnelHost,
                webView: mainWebView
            )
        } else if url.scheme == "http" {
            started = EmbeddedProxyServer.shared.startServer(port: port, webView: mainWebView)
        } else {
            showError(
                tab,
                title: "Update the host CLI",
                message: "Remote HTTPS needs the latest Shellular CLI for its end-to-end TCP tunnel. Update the connected host, reconnect, and retry."
            )
            return false
        }
        guard started else {
            showError(
                tab,
                title: "Port unavailable on this Mac",
                message: "Shellular could not reserve local port \(port) for the remote host. Close the local service using that port and retry."
            )
            return false
        }
        tab.remoteHostId = hostId
        tab.remoteTunnelPort = port
        tab.remoteTunnelHost = tunnelHost
        return true
    }

    private func loadHome(_ tab: BrowserTab) {
        releaseTunnel(for: tab)
        tab.internalRequestId = nil
        tab.certificateWarning = nil
        tab.activeTrustException = nil
        tab.lastFailedURL = nil
        tab.securityState = .internalPage
        tab.documentKind = .shellular("home")
        tab.webView.stopLoading()
        tab.displayURL = "shellular://home"
        tab.title = "Home"
        loadOwnedDocument(homeDocument, in: tab)
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

        releaseTunnel(for: tab)
        let requestId = UUID()
        tab.internalRequestId = requestId
        tab.certificateWarning = nil
        tab.activeTrustException = nil
        tab.lastFailedURL = nil
        tab.securityState = .internalPage
        tab.documentKind = .shellular(name)
        tab.webView.stopLoading()
        tab.displayURL = "shellular://\(name)"
        tab.title = name.capitalized
        loadOwnedDocument(Self.internalLoadingHTML, in: tab)
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
                    self.loadOwnedDocument(html, in: tab)
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
        releaseTunnel(for: tab)
        tab.internalRequestId = nil
        tab.certificateWarning = nil
        tab.activeTrustException = nil
        tab.lastFailedURL = nil
        tab.documentKind = .shellular(name)
        tab.securityState = .internalPage
        tab.displayURL = "shellular://\(name)"
        tab.title = name.capitalized
        let retryURL = "shellular://\(escapeHTML(name))"
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        \(internalPageStyle)
        <h1>Unable to load \(escapeHTML(tab.title))</h1><p>\(escapeHTML(message))</p><a href="\(retryURL)">Retry</a>
        """
        loadOwnedDocument(html, in: tab)
        refreshChrome()
    }

    private func showConnectionError(_ tab: BrowserTab, expectedHostId: String?) {
        let expected = expectedHostId ?? "the original remote host"
        showError(tab, title: "Remote host unavailable", message: "Reconnect to \(expected) before reloading this localhost tab. Shellular will not open the Mac's localhost in its place.")
    }

    private func showError(_ tab: BrowserTab, title: String, message: String) {
        tab.internalRequestId = nil
        tab.documentKind = .browserUI
        if let url = URL(string: tab.displayURL),
           ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            tab.lastFailedURL = url
        }
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        \(internalPageStyle)
        <main><div class="icon">!</div><h1>\(escapeHTML(title))</h1>
        <p>\(escapeHTML(message))</p>
        <p class="url">\(escapeHTML(tab.displayURL))</p>
        <div class="actions">
        <a href="shellular://error/back">Back</a>
        <a class="primary" href="shellular://error/retry">Retry</a>
        <a href="shellular://error/copy">Copy URL</a>
        <a href="shellular://error/external">Open in Default Browser</a>
        </div></main>
        """
        loadOwnedDocument(html, in: tab)
        refreshChrome()
    }

    private func loadOwnedDocument(_ html: String, in tab: BrowserTab) {
        BrowserOwnedDocument(displayURL: tab.displayURL, html: html).load(in: tab.webView)
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
        if BrowserDeveloperToolsShortcut.matches(event) {
            developerToolsAction()
            return true
        }
        let command = event.modifierFlags.contains(.command)
        let shift = event.modifierFlags.contains(.shift)
        let control = event.modifierFlags.contains(.control)
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
        if command && shift && key == "t" { reopenClosedTab(); return true }
        if command && shift && key == "a" { searchTabsAction(); return true }
        if command && key == "t" { newHomeTab(); return true }
        if command && key == "w" { if let activeId { closeTab(activeId) }; return true }
        if command && key == "l" { focusAddressField(); return true }
        if command && key == "r" { reloadAction(); return true }
        if command, let number = Int(key), (1...9).contains(number), !tabs.isEmpty {
            selectTab(tabs[min(number - 1, tabs.count - 1)].id); return true
        }
        if control && key == "\t" {
            selectRelativeTab(shift ? -1 : 1); return true
        }
        return false
    }

    private func handleSidebarKeyEquivalent(_ event: NSEvent) -> Bool {
        handleKeyEquivalent(event)
    }

    private func focusAddressField() {
        rootView.window?.makeFirstResponder(addressField)
        addressField.selectText(nil)
    }

    private func selectRelativeTab(_ delta: Int) {
        guard let activeId, let index = tabs.firstIndex(where: { $0.id == activeId }), !tabs.isEmpty else { return }
        selectTab(tabs[(index + delta + tabs.count) % tabs.count].id)
    }

    @objc private func newTabAction() { newHomeTab() }
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
    @objc private func developerToolsAction() {
        guard let tab = activeTab,
              BrowserDeveloperToolsAvailability.canRequestVisibility(
                  hasRuntime: developerToolsUserScript != nil,
                  state: tab.developerTools
              ) else {
            NSSound.beep()
            return
        }
        tab.developerTools.toggle()
        synchronizeDeveloperTools(for: tab)
        refreshChrome()
    }
    @objc private func moreAction() {
        guard let tab = activeTab else { return }
        let menu = NSMenu(title: "Browser Options")

        let developerToolsItem = NSMenuItem(
            title: tab.developerTools.isVisible
                ? BrowserDeveloperToolsContextMenu.closeDeveloperToolsTitle
                : "Developer Tools",
            action: #selector(developerToolsAction),
            keyEquivalent: ""
        )
        developerToolsItem.target = self
        developerToolsItem.isEnabled = BrowserDeveloperToolsAvailability.canRequestVisibility(
            hasRuntime: developerToolsUserScript != nil,
            state: tab.developerTools
        )
        developerToolsItem.state = tab.developerTools.isVisible ? .on : .off
        menu.addItem(developerToolsItem)
        menu.addItem(.separator())

        let viewportItem = NSMenuItem(title: "Viewport", action: nil, keyEquivalent: "")
        let viewportMenu = NSMenu(title: "Viewport")
        addViewportItem("Fit", tag: 0, mode: .fit, tab: tab, to: viewportMenu)
        addViewportItem("Phone (390 px)", tag: 390, mode: .phone, tab: tab, to: viewportMenu)
        addViewportItem("Tablet (768 px)", tag: 768, mode: .tablet, tab: tab, to: viewportMenu)
        let customItem = NSMenuItem(
            title: "Custom…",
            action: #selector(customViewportAction),
            keyEquivalent: ""
        )
        customItem.target = self
        if case .fixed(let width) = tab.viewportHost.mode,
           width != 390, width != 768 {
            customItem.state = .on
            customItem.title = "Custom… (\(Int(width)) px)"
        }
        viewportMenu.addItem(customItem)
        menu.addItem(viewportItem)
        menu.setSubmenu(viewportMenu, for: viewportItem)

        let screenshotItem = NSMenuItem(
            title: "Capture Screenshot…",
            action: #selector(captureScreenshotAction),
            keyEquivalent: ""
        )
        screenshotItem.target = self
        menu.addItem(screenshotItem)
        menu.popUp(
            positioning: nil,
            at: NSPoint(x: 0, y: moreButton.bounds.height + 4),
            in: moreButton
        )
    }
    private func addViewportItem(
        _ title: String,
        tag: Int,
        mode: BrowserViewportMode,
        tab: BrowserTab,
        to menu: NSMenu
    ) {
        let item = NSMenuItem(
            title: title,
            action: #selector(viewportPresetAction(_:)),
            keyEquivalent: ""
        )
        item.target = self
        item.tag = tag
        item.state = tab.viewportHost.mode == mode ? .on : .off
        menu.addItem(item)
    }
    @objc private func viewportPresetAction(_ sender: NSMenuItem) {
        guard let tab = activeTab else { return }
        tab.viewportHost.mode = sender.tag == 0 ? .fit : .fixed(CGFloat(sender.tag))
        tab.viewportHost.needsLayout = true
        tab.viewportHost.layoutSubtreeIfNeeded()
    }
    @objc private func customViewportAction() {
        guard let tab = activeTab, let presentationWindow else { return }
        let alert = NSAlert()
        alert.messageText = "Custom viewport width"
        alert.informativeText = "Enter a CSS-pixel width from 320 to 1920."
        alert.addButton(withTitle: "Apply")
        alert.addButton(withTitle: "Cancel")
        let currentWidth: CGFloat
        if case .fixed(let width) = tab.viewportHost.mode {
            currentWidth = width
        } else {
            currentWidth = 390
        }
        let field = NSTextField(string: String(Int(currentWidth)))
        field.frame.size.width = 220
        field.placeholderString = "320–1920"
        alert.accessoryView = field
        alert.beginSheetModal(for: presentationWindow) { [weak self, weak tab] response in
            guard response == .alertFirstButtonReturn,
                  let self,
                  let tab,
                  self.tabs.contains(where: { $0 === tab }),
                  let width = Double(field.stringValue),
                  (Double(BrowserViewportMode.minimumCustomWidth)...Double(BrowserViewportMode.maximumCustomWidth)).contains(width) else {
                if response == .alertFirstButtonReturn { NSSound.beep() }
                return
            }
            tab.viewportHost.mode = .fixed(CGFloat(width))
            tab.viewportHost.layoutSubtreeIfNeeded()
        }
    }
    @objc private func captureScreenshotAction() {
        guard let tab = activeTab else { return }
        let snapshotRect = BrowserScreenshotMetrics.visiblePageRect(
            in: tab.webView.bounds,
            developerToolsVisible: tab.developerTools.isVisible,
            panelPercent: tab.developerTools.panelPercent
        )
        guard snapshotRect.width > 0, snapshotRect.height > 0 else {
            presentJavaScriptAlert(
                message: "The visible page area is empty and could not be captured.",
                buttons: ["OK"]
            ) { _ in }
            return
        }
        let configuration = WKSnapshotConfiguration()
        configuration.rect = snapshotRect
        tab.webView.takeSnapshot(with: configuration) { [weak self, weak tab] image, error in
            DispatchQueue.main.async {
                guard let self,
                      let tab,
                      self.tabs.contains(where: { $0 === tab }) else { return }
                guard let image,
                      let data = BrowserScreenshotEncoder.pngData(from: image) else {
                    self.presentJavaScriptAlert(
                        message: error?.localizedDescription ?? "The page screenshot could not be encoded as PNG.",
                        buttons: ["OK"]
                    ) { _ in }
                    return
                }
                self.presentScreenshotSavePanel(data: data, tab: tab)
            }
        }
    }
    private func presentScreenshotSavePanel(data: Data, tab: BrowserTab) {
        guard let presentationWindow else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        let baseName = tab.title
            .components(separatedBy: CharacterSet.alphanumerics.union(.whitespaces).inverted)
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        panel.nameFieldStringValue = "\(baseName.isEmpty ? "Shellular Screenshot" : baseName).png"
        panel.beginSheetModal(for: presentationWindow) { [weak self] response in
            guard let url = BrowserScreenshotSaveDecision.destination(
                for: response,
                selectedURL: panel.url
            ) else { return }
            do {
                try data.write(to: url, options: .atomic)
            } catch {
                self?.presentJavaScriptAlert(
                    message: "The screenshot could not be saved: \(error.localizedDescription)",
                    buttons: ["OK"]
                ) { _ in }
            }
        }
    }
    @objc private func presentationAction() {
        if isPresentedInWindow { onRequestDock?(true) }
        else { onRequestPopOut?() }
    }
    @objc private func closeSidebarAction() { onRequestCloseSidebar?() }
    @objc private func clearAddressAction() {
        addressField.stringValue = ""
        clearAddressValidationError()
        addressBar.updateClearButton(isEditing: true)
        rootView.window?.makeFirstResponder(addressField)
    }
    @objc private func securityAction() {
        guard let tab = activeTab else { return }
        let message: String
        switch tab.securityState {
        case .secure:
            message = "The page is using HTTPS and its certificate is trusted."
        case .notSecure:
            message = "This page is not protected by HTTPS."
        case .unsafeCertificate:
            message = "You explicitly allowed this certificate for the current Shellular browser session. The exception will be forgotten when this browser session ends or the certificate changes."
        case .internalPage:
            message = "This is a local Shellular browser page."
        }
        presentJavaScriptAlert(message: message, buttons: ["OK"]) { _ in }
    }
    @objc private func addressAction() {
        guard let tab = activeTab else { return }
        guard let url = BrowserAddressResolver.resolve(addressField.stringValue) else {
            addressValidationError = true
            addressBar.setValidationError(true)
            addressField.toolTip = "Enter a web or shellular:// address. javascript:, data:, and file: URLs are not allowed."
            NSSound.beep()
            return
        }
        isEditingAddress = false
        clearAddressValidationError()
        rootView.window?.makeFirstResponder(nil)
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
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            isEditingAddress = false
            addressBar.setFocused(false)
            addressBar.updateClearButton(isEditing: false)
            clearAddressValidationError()
            refreshChrome()
            rootView.window?.makeFirstResponder(nil)
            return true
        }
        return false
    }

    func controlTextDidBeginEditing(_ obj: Notification) {
        guard obj.object as? NSTextField === addressField else { return }
        isEditingAddress = true
        addressBar.setFocused(true)
        addressBar.updateClearButton(isEditing: true)
        clearAddressValidationError()
    }

    func controlTextDidChange(_ obj: Notification) {
        guard obj.object as? NSTextField === addressField else { return }
        addressBar.updateClearButton(isEditing: true)
        clearAddressValidationError()
    }

    func controlTextDidEndEditing(_ obj: Notification) {
        guard obj.object as? NSTextField === addressField else { return }
        isEditingAddress = false
        addressBar.setFocused(false)
        addressBar.updateClearButton(isEditing: false)
        refreshChrome()
    }

    private func clearAddressValidationError() {
        guard addressValidationError || addressField.toolTip != nil else { return }
        addressValidationError = false
        addressBar.setValidationError(false)
        addressField.toolTip = nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let tab = tabs.first(where: { $0.webView === webView }), let url = navigationAction.request.url else {
            return decisionHandler(.cancel)
        }
        if url.scheme == "shellular" {
            if handleBrowserAction(tab, url: url) {
                decisionHandler(.cancel)
                return
            }
            loadInternalPage(tab, name: url.host ?? "home")
            decisionHandler(.cancel)
            return
        }
        if BrowserOwnedDocument.isPhysicalHTMLNavigation(url) {
            decisionHandler(.allow)
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
        if navigationAction.targetFrame?.isMainFrame != true {
            decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
            return
        }
        if !prepareRemoteNavigation(tab, to: url) {
            decisionHandler(.cancel)
            return
        }
        if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            tab.documentKind = .external
            tab.securityState = url.scheme?.lowercased() == "https" ? .secure : .notSecure
        }
        tab.displayURL = url.absoluteString
        decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
    }

    private func handleBrowserAction(_ tab: BrowserTab, url: URL) -> Bool {
        switch url.host {
        case "certificate":
            let action = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            if action == "proceed",
               let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "token" })?.value,
               let warning = tab.certificateWarning,
               warning.token == token,
               warningTokens.consume(token) {
                tab.certificateWarning = nil
                trustExceptions.approve(warning.exception)
                tab.activeTrustException = warning.exception
                tab.securityState = .unsafeCertificate
                navigate(tab, to: warning.url)
            } else if action == "back" {
                if let token = tab.certificateWarning?.token {
                    _ = warningTokens.consume(token)
                }
                tab.certificateWarning = nil
                tab.lastFailedURL = nil
                if tab.webView.canGoBack { tab.webView.goBack() }
                else { loadHome(tab) }
            }
            return true
        case "error":
            let action = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            switch action {
            case "back":
                tab.lastFailedURL = nil
                if tab.webView.canGoBack { tab.webView.goBack() }
                else { loadHome(tab) }
            case "retry":
                if let failedURL = tab.lastFailedURL { navigate(tab, to: failedURL) }
            case "copy":
                let value = tab.lastFailedURL?.absoluteString ?? tab.displayURL
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(value, forType: .string)
            case "external":
                if let failedURL = tab.lastFailedURL { NSWorkspace.shared.open(failedURL) }
            default:
                break
            }
            return true
        default:
            return false
        }
    }

    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (
            URLSession.AuthChallengeDisposition,
            URLCredential?
        ) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod ==
                NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust,
              let tab = tabs.first(where: { $0.webView === webView }),
              let pageURL = URL(string: tab.displayURL),
              challengeMatchesMainPage(challenge.protectionSpace, pageURL: pageURL) else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        let host = challenge.protectionSpace.host
        let port = challenge.protectionSpace.port > 0
            ? challenge.protectionSpace.port
            : 443
        BrowserTrustEvaluationScheduler.schedule(on: trustEvaluationQueue) {
            [weak self, weak tab] queue in
            dispatchPrecondition(condition: .onQueue(queue))
            let status = SecTrustEvaluateAsyncWithError(
                trust,
                queue
            ) { [weak self, weak tab] evaluatedTrust, trusted, evaluationError in
                dispatchPrecondition(condition: .onQueue(queue))
                let metadata = trusted ? nil : Self.certificateMetadata(
                    for: evaluatedTrust,
                    host: host,
                    port: port,
                    error: evaluationError
                )
                DispatchQueue.main.async {
                    guard let self, let tab, self.tabs.contains(where: { $0 === tab }) else {
                        completionHandler(.cancelAuthenticationChallenge, nil)
                        return
                    }
                    if trusted {
                        tab.activeTrustException = nil
                        tab.securityState = .secure
                        self.refreshChrome()
                        completionHandler(.performDefaultHandling, nil)
                        return
                    }
                    guard let metadata else {
                        completionHandler(.performDefaultHandling, nil)
                        return
                    }
                    if self.trustExceptions.contains(metadata.exception) {
                        tab.activeTrustException = metadata.exception
                        tab.securityState = .unsafeCertificate
                        self.refreshChrome()
                        completionHandler(.useCredential, URLCredential(trust: trust))
                        return
                    }

                    completionHandler(.cancelAuthenticationChallenge, nil)
                    tab.activeTrustException = nil
                    self.showCertificateWarning(
                        tab,
                        url: pageURL,
                        metadata: metadata
                    )
                }
            }
            if status != errSecSuccess {
                DispatchQueue.main.async {
                    guard let self, let tab, self.tabs.contains(where: { $0 === tab }) else {
                        completionHandler(.cancelAuthenticationChallenge, nil)
                        return
                    }
                    completionHandler(.performDefaultHandling, nil)
                }
            }
        }
    }

    private func challengeMatchesMainPage(
        _ protectionSpace: URLProtectionSpace,
        pageURL: URL
    ) -> Bool {
        guard pageURL.scheme?.lowercased() == "https",
              pageURL.host?.lowercased() == protectionSpace.host.lowercased() else {
            return false
        }
        let challengePort = protectionSpace.port > 0 ? protectionSpace.port : 443
        return (pageURL.port ?? 443) == challengePort
    }

    private static func certificateMetadata(
        for trust: SecTrust,
        host: String,
        port: Int,
        error: CFError?
    ) -> BrowserCertificateMetadata? {
        guard let certificate = leafCertificate(in: trust) else { return nil }
        let certificateData = SecCertificateCopyData(certificate) as Data
        let fingerprint = SHA256.hash(data: certificateData)
            .map { String(format: "%02X", $0) }
            .joined(separator: ":")
        let exception = BrowserTrustException(
            host: host.lowercased(),
            port: port,
            certificateFingerprint: fingerprint
        )
        let subject = SecCertificateCopySubjectSummary(certificate) as String? ?? exception.host
        let details = error.map { CFErrorCopyDescription($0) as String } ??
            "The certificate could not be verified."
        return BrowserCertificateMetadata(
            exception: exception,
            subject: subject,
            details: details
        )
    }

    private func showCertificateWarning(
        _ tab: BrowserTab,
        url: URL,
        metadata: BrowserCertificateMetadata
    ) {
        let exception = metadata.exception
        if let oldToken = tab.certificateWarning?.token {
            _ = warningTokens.consume(oldToken)
        }
        let token = warningTokens.issue()
        tab.certificateWarning = PendingCertificateWarning(
            token: token,
            exception: exception,
            url: url,
            details: metadata.details
        )
        tab.lastFailedURL = url
        tab.securityState = .unsafeCertificate
        tab.documentKind = .browserUI
        tab.title = "Your connection is not private"
        tab.displayURL = url.absoluteString
        let encodedToken = token.addingPercentEncoding(
            withAllowedCharacters: .urlQueryAllowed
        ) ?? token
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        \(internalPageStyle)
        <main class="warning"><div class="icon">!</div>
        <h1>Your connection is not private</h1>
        <p>Attackers might be trying to steal information from
        <strong>\(escapeHTML(exception.host))</strong>. Shellular did not continue
        because the certificate is not trusted.</p>
        <details><summary>Certificate details</summary>
        <dl><dt>Site</dt><dd>\(escapeHTML(metadata.subject))</dd>
        <dt>Address</dt><dd>\(escapeHTML(url.absoluteString))</dd>
        <dt>Fingerprint (SHA-256)</dt><dd class="fingerprint">\(escapeHTML(exception.certificateFingerprint))</dd>
        <dt>Reason</dt><dd>\(escapeHTML(metadata.details))</dd></dl></details>
        <div class="actions">
        <a class="primary" href="shellular://certificate/back">Back to safety</a>
        <a class="danger" href="shellular://certificate/proceed?token=\(encodedToken)">
        Proceed to \(escapeHTML(exception.host)) (unsafe)</a>
        </div></main>
        """
        loadOwnedDocument(html, in: tab)
        refreshChrome()
    }

    private static func leafCertificate(in trust: SecTrust) -> SecCertificate? {
        (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(
        _ webView: WKWebView,
        didStartProvisionalNavigation navigation: WKNavigation!
    ) {
        guard let tab = tabs.first(where: { $0.webView === webView }) else { return }
        tab.developerTools.markRuntimeLoading()
        tab.webView.embeddedDeveloperToolsAvailable = false
        if tab.id == activeId { refreshChrome() }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard let tab = tabs.first(where: { $0.webView === webView }) else { return }
        tab.developerTools.clearElementHighlight()
        synchronizeDeveloperTools(for: tab)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let tab = tabs.first(where: { $0.webView === webView }) else { return }
        synchronizeDeveloperTools(for: tab)
        switch tab.documentKind {
        case .external:
            tab.title = webView.title ?? tab.title
        case .shellular(let name):
            tab.title = name.capitalized
        case .browserUI:
            break
        }
        if tab.documentKind.isShellularOwned { applyTheme(to: tab) }
        if tab.documentKind == .external,
           tab.securityState != .unsafeCertificate,
           URL(string: tab.displayURL)?.scheme?.lowercased() == "https" {
            tab.securityState = .secure
        }
        refreshChrome()
        saveSession()
        guard tab.certificateWarning == nil, tab.lastFailedURL == nil else { return }
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
        handleNavigationFailure(in: webView, error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(in: webView, error: error)
    }

    private func handleNavigationFailure(in webView: WKWebView, error: Error) {
        guard let tab = tabs.first(where: { $0.webView === webView }),
              (error as NSError).code != NSURLErrorCancelled,
              tab.documentKind != .browserUI else { return }
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
        guard let presentationWindow else {
            completionHandler(nil)
            return
        }
        panel.beginSheetModal(for: presentationWindow) {
            response in completionHandler(response == .OK ? panel.urls : nil)
        }
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
        if let presentationWindow {
            alert.beginSheetModal(for: presentationWindow, completionHandler: completion)
        }
        else { completion(alert.runModal()) }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        guard let presentationWindow else {
            completionHandler(nil)
            return
        }
        panel.beginSheetModal(for: presentationWindow) {
            result in completionHandler(result == .OK ? panel.url : nil)
        }
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

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if isPresentedInWindow {
            onRequestDock?(false)
            return false
        }
        return true
    }

    private var internalPageStyle: String {
        """
        <style>
        :root{color-scheme:light dark}
        *{box-sizing:border-box}html,body{min-height:100%;margin:0;background:var(--primary,Canvas);color:var(--primary-text,CanvasText)}
        body{font:14px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;padding:clamp(28px,7vw,64px)}
        main{max-width:680px;margin:6vh auto}h1{font-size:26px;line-height:1.2;margin:18px 0 12px}
        p{line-height:1.55;color:var(--secondary-text,CanvasText)}.icon{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--danger,#d84b45);color:white;font-size:28px;font-weight:700}
        .url,.fingerprint{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
        .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
        a{color:var(--primary-text,CanvasText);text-decoration:none;padding:9px 14px;border:1px solid var(--line-soft,GrayText);border-radius:8px}
        a.primary{color:white;background:var(--accent,Highlight);border-color:var(--accent,Highlight)}
        a.danger{color:var(--danger,#d84b45);border-color:var(--danger,#d84b45)}
        details{margin-top:24px;padding:12px 14px;background:var(--surface-soft,ButtonFace);border:1px solid var(--line-soft,GrayText);border-radius:10px}
        summary{cursor:pointer;font-weight:600}dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 14px;margin-bottom:0}
        dt{color:var(--secondary-text,CanvasText)}dd{margin:0;overflow-wrap:anywhere}
        </style>
        """
    }

    private static let fallbackHomeHTML = """
    <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <style>html{color-scheme:light dark;background:var(--primary,Canvas);color:var(--primary-text,CanvasText)}body{font:15px -apple-system;display:grid;place-items:center;min-height:90vh;margin:0}main{text-align:center;width:min(560px,80vw)}h1{font-size:30px}p{color:var(--secondary-text,CanvasText)}</style>
    <main><h1>Shellular</h1><p>Use the address bar to search or open a development URL.</p></main>
    """

    private static let internalLoadingHTML = """
    <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <style>html{color-scheme:light dark;background:var(--primary,Canvas);color:var(--primary-text,CanvasText)}body{font:14px -apple-system;display:grid;place-items:center;min-height:90vh;margin:0}p{color:var(--secondary-text,CanvasText)}</style>
    <p>Loading…</p>
    """
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

private func normalizedTunnelHost(_ host: String?) -> String {
    switch host?.lowercased() {
    case "::1": return "::1"
    case "0.0.0.0": return "0.0.0.0"
    case "127.0.0.1": return "127.0.0.1"
    default: return "localhost"
    }
}

private func escapeHTML(_ value: String) -> String {
    value.replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
}
