import AppKit
import Foundation
import QuartzCore
import WebKit

enum BrowserViewAttachment {
    @discardableResult
    static func attach(_ content: NSView, to host: NSView) -> Bool {
        guard host.bounds.width > 0 else { return false }

        if content.superview !== host {
            content.removeFromSuperview()
            content.translatesAutoresizingMaskIntoConstraints = true
            content.autoresizingMask = [.width, .height]
            content.frame = host.bounds
            host.addSubview(content)
        } else if content.frame != host.bounds {
            content.frame = host.bounds
        }
        return true
    }

    static func synchronize(_ content: NSView?, with host: NSView) {
        guard let content, content.superview === host else { return }
        content.translatesAutoresizingMaskIntoConstraints = true
        content.autoresizingMask = [.width, .height]
        if content.frame != host.bounds {
            content.frame = host.bounds
        }
    }
}

struct BrowserOwnedDocument {
    let displayURL: String
    let html: String

    // The address shown to the user is controller state. Giving WebKit a
    // shellular:// base URL turns generated HTML into a custom-scheme main-frame
    // navigation and causes the route delegate to cancel the document itself.
    var baseURL: URL? { nil }

    @discardableResult
    func load(in webView: WKWebView) -> WKNavigation? {
        webView.loadHTMLString(html, baseURL: baseURL)
    }

    static func isPhysicalHTMLNavigation(_ url: URL) -> Bool {
        url.absoluteString == "about:blank"
    }
}

enum BrowserDeveloperToolsMetrics {
    static let version = 1
    static let minimumPanelPercent: CGFloat = 25
    static let maximumPanelPercent: CGFloat = 70
    static let defaultPanelPercent: CGFloat = 45
    static let panelPercentDefaultsKey = "shellular.browser.developer-tools.panel-percent.v1"

    static func clamp(_ value: CGFloat) -> CGFloat {
        guard value.isFinite else { return defaultPanelPercent }
        return min(maximumPanelPercent, max(minimumPanelPercent, value))
    }
}

struct BrowserDeveloperToolsSnapshot: Equatable {
    let ready: Bool
    let isVisible: Bool
    let panelPercent: CGFloat
    let isElementHighlighted: Bool

    init?(payload: Any) {
        let allowedKeys = Set(["version", "ready", "visible", "panelPercent", "highlighted"])
        guard let value = payload as? [String: Any],
              Set(value.keys) == allowedKeys,
              let version = value["version"] as? NSNumber,
              CFGetTypeID(version) != CFBooleanGetTypeID(),
              version.doubleValue == Double(BrowserDeveloperToolsMetrics.version),
              let ready = value["ready"] as? Bool,
              let isVisible = value["visible"] as? Bool,
              let panelPercent = value["panelPercent"] as? NSNumber,
              CFGetTypeID(panelPercent) != CFBooleanGetTypeID(),
              let isElementHighlighted = value["highlighted"] as? Bool else {
            return nil
        }
        self.ready = ready
        self.isVisible = isVisible
        self.panelPercent = BrowserDeveloperToolsMetrics.clamp(
            CGFloat(panelPercent.doubleValue)
        )
        self.isElementHighlighted = isElementHighlighted
    }
}

struct BrowserDeveloperToolsState: Equatable {
    private(set) var isReady = false
    private(set) var initializationFailed = false
    private(set) var isVisible = false
    private(set) var isElementHighlighted = false
    private(set) var panelPercent: CGFloat

    init(panelPercent: CGFloat = BrowserDeveloperToolsMetrics.defaultPanelPercent) {
        self.panelPercent = BrowserDeveloperToolsMetrics.clamp(panelPercent)
    }

    mutating func show() {
        isVisible = true
    }

    mutating func showElementHighlight() {
        isVisible = true
        isElementHighlighted = true
    }

    mutating func clearElementHighlight() {
        isElementHighlighted = false
    }

    mutating func hide() {
        isVisible = false
        isElementHighlighted = false
    }

    mutating func markRuntimeLoading() {
        isReady = false
        initializationFailed = false
        isElementHighlighted = false
    }

    mutating func setPanelPercent(_ value: CGFloat) {
        panelPercent = BrowserDeveloperToolsMetrics.clamp(value)
    }

    mutating func apply(
        _ snapshot: BrowserDeveloperToolsSnapshot,
        preserveVisibility: Bool = false,
        preservePanelPercent: Bool = false
    ) {
        isReady = snapshot.ready
        initializationFailed = !snapshot.ready
        if !preservePanelPercent {
            panelPercent = snapshot.panelPercent
        }
        if !preserveVisibility {
            isVisible = snapshot.isVisible
        }
        isElementHighlighted = snapshot.isElementHighlighted && isVisible
    }

    @discardableResult
    mutating func toggle() -> Bool {
        if isVisible {
            hide()
        } else {
            show()
        }
        return isVisible
    }
}

enum BrowserDeveloperToolsAvailability {
    static func canRequestVisibility(
        hasRuntime: Bool,
        state: BrowserDeveloperToolsState
    ) -> Bool {
        hasRuntime && !state.initializationFailed
    }
}

struct BrowserDeveloperToolsPanelSizeStore {
    private let defaults: UserDefaults
    private let key: String

    init(
        defaults: UserDefaults = .standard,
        key: String = BrowserDeveloperToolsMetrics.panelPercentDefaultsKey
    ) {
        self.defaults = defaults
        self.key = key
    }

    func load() -> CGFloat {
        guard defaults.object(forKey: key) != nil else {
            return BrowserDeveloperToolsMetrics.defaultPanelPercent
        }
        return BrowserDeveloperToolsMetrics.clamp(CGFloat(defaults.double(forKey: key)))
    }

    func save(_ value: CGFloat) {
        defaults.set(Double(BrowserDeveloperToolsMetrics.clamp(value)), forKey: key)
    }
}

final class BrowserWeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler? = nil) {
        self.delegate = delegate
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

enum BrowserDeveloperToolsShortcut {
    static func matches(_ event: NSEvent) -> Bool {
        let usesOption = event.modifierFlags.contains(.option)
        let usesShift = event.modifierFlags.contains(.shift)
        guard event.type == .keyDown,
              event.modifierFlags.contains(.command),
              usesOption != usesShift,
              !event.modifierFlags.contains(.control) else { return false }
        return event.charactersIgnoringModifiers?.lowercased() == "i"
    }
}

enum BrowserDeveloperToolsScript {
    static let messageHandlerName = "shellularDeveloperTools"
    static let visibilityFunction = "__shellularSetDeveloperToolsVisible"
    static let inspectElementFunction = "__shellularInspectContextElement"
    static let clearElementHighlightFunction = "__shellularClearElementHighlight"

    static func loadRuntime(
        resourceURL: URL? = Bundle.main.resourceURL,
        fileManager: FileManager = .default
    ) -> String? {
        guard let resourceURL else { return nil }
        for relativePath in ["bundle/console.js", "console.js"] {
            let url = resourceURL.appendingPathComponent(relativePath)
            guard fileManager.fileExists(atPath: url.path),
                  let source = try? String(contentsOf: url, encoding: .utf8),
                  !source.isEmpty else { continue }
            return source
        }
        return nil
    }

    static func makeUserScript(
        erudaSource: String,
        panelPercent: CGFloat = BrowserDeveloperToolsMetrics.defaultPanelPercent
    ) -> WKUserScript {
        WKUserScript(
            source: makeSource(erudaSource: erudaSource, panelPercent: panelPercent),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    static func visibilityCommand(isVisible: Bool) -> String {
        let value = isVisible ? "true" : "false"
        return """
        (function(){
          var tools = window.__shellularDeveloperTools;
          if (tools && typeof tools.\(isVisible ? "show" : "hide") === "function") {
            return tools.\(isVisible ? "show" : "hide")();
          }
          var legacy = window.\(visibilityFunction);
          return typeof legacy === "function" ? legacy(\(value)) : false;
        })();
        """
    }

    static func panelPercentCommand(_ panelPercent: CGFloat) -> String {
        let value = BrowserDeveloperToolsMetrics.clamp(panelPercent)
        return """
        (function(){
          var tools = window.__shellularDeveloperTools;
          if (!tools || typeof tools.setPanelPercent !== "function") return false;
          tools.setPanelPercent(\(Double(value)));
          return true;
        })();
        """
    }

    static func inspectElementCommand() -> String {
        """
        (function(){
          var tools = window.__shellularDeveloperTools;
          if (tools && typeof tools.inspectElement === "function") {
            return tools.inspectElement();
          }
          var legacy = window.\(inspectElementFunction);
          return typeof legacy === "function" ? legacy() : false;
        })();
        """
    }

    static func clearElementHighlightCommand() -> String {
        """
        (function(){
          var tools = window.__shellularDeveloperTools;
          if (tools && typeof tools.clearHighlight === "function") {
            return tools.clearHighlight();
          }
          var legacy = window.\(clearElementHighlightFunction);
          return typeof legacy === "function" ? legacy() : false;
        })();
        """
    }

    private static func makeSource(erudaSource: String, panelPercent: CGFloat) -> String {
        let clampedPanelPercent = BrowserDeveloperToolsMetrics.clamp(panelPercent)
        return """
        (function(){
          "use strict";
          function installShellularDeveloperTools(){
            if (window.__shellularDeveloperTools &&
                window.__shellularDeveloperTools.version === \(BrowserDeveloperToolsMetrics.version)) {
              window.__shellularDeveloperTools.setPanelPercent(\(Double(clampedPanelPercent)));
              return;
            }
            try {
        \(erudaSource)
              if (typeof window.__shellularInstallDeveloperTools !== "function") {
                throw new Error("console.js did not install the Shellular developer tools adapter");
              }
              window.__shellularInstallDeveloperTools({
                panelPercent: \(Double(clampedPanelPercent)),
                messageHandlerName: "\(messageHandlerName)"
              });
            } catch (error) {
              console.error("[Shellular Developer Tools]", error);
              try {
                window.webkit.messageHandlers.\(messageHandlerName).postMessage({
                  version: \(BrowserDeveloperToolsMetrics.version),
                  ready: false,
                  visible: false,
                  panelPercent: \(Double(clampedPanelPercent)),
                  highlighted: false
                });
              } catch (_) {}
            }
          }
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function(){
              window.setTimeout(installShellularDeveloperTools, 0);
            }, { once: true });
          } else {
            window.setTimeout(installShellularDeveloperTools, 0);
          }
        })();
        """
    }
}

enum BrowserViewportMode: Equatable {
    case fit
    case fixed(CGFloat)

    static let phone = BrowserViewportMode.fixed(390)
    static let tablet = BrowserViewportMode.fixed(768)
    static let minimumCustomWidth: CGFloat = 320
    static let maximumCustomWidth: CGFloat = 1_920

    var normalized: BrowserViewportMode {
        switch self {
        case .fit: return .fit
        case .fixed(let width):
            guard width.isFinite else { return .fit }
            return .fixed(min(Self.maximumCustomWidth, max(Self.minimumCustomWidth, width)))
        }
    }
}

struct BrowserViewportLayout: Equatable {
    let documentSize: CGSize
    let pageFrame: CGRect
    let allowsHorizontalScrolling: Bool
}

enum BrowserViewportMetrics {
    static func layout(in containerSize: CGSize, mode: BrowserViewportMode) -> BrowserViewportLayout {
        let containerWidth = max(0, containerSize.width)
        let containerHeight = max(0, containerSize.height)
        switch mode.normalized {
        case .fit:
            return BrowserViewportLayout(
                documentSize: CGSize(width: containerWidth, height: containerHeight),
                pageFrame: CGRect(x: 0, y: 0, width: containerWidth, height: containerHeight),
                allowsHorizontalScrolling: false
            )
        case .fixed(let width):
            let documentWidth = max(containerWidth, width)
            return BrowserViewportLayout(
                documentSize: CGSize(width: documentWidth, height: containerHeight),
                pageFrame: CGRect(
                    x: max(0, (containerWidth - width) / 2),
                    y: 0,
                    width: width,
                    height: containerHeight
                ),
                allowsHorizontalScrolling: width > containerWidth
            )
        }
    }
}

final class BrowserViewportHostView: NSView {
    let webView: WKWebView
    private let scrollView = NSScrollView()
    private let canvasView = NSView()
    var mode: BrowserViewportMode = .fit {
        didSet {
            mode = mode.normalized
            needsLayout = true
        }
    }

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        wantsLayer = true
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.scrollerStyle = .overlay
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.documentView = canvasView
        scrollView.autoresizingMask = [.width, .height]
        addSubview(scrollView)
        webView.translatesAutoresizingMaskIntoConstraints = true
        webView.autoresizingMask = []
        canvasView.addSubview(webView)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        scrollView.frame = bounds
        let availableSize = scrollView.contentView.bounds.size
        let metrics = BrowserViewportMetrics.layout(in: availableSize, mode: mode)
        canvasView.frame = CGRect(origin: .zero, size: metrics.documentSize)
        webView.frame = metrics.pageFrame
        scrollView.hasHorizontalScroller = metrics.allowsHorizontalScrolling
    }

    func applyBackgroundColor(_ color: NSColor) {
        layer?.backgroundColor = color.cgColor
        canvasView.wantsLayer = true
        canvasView.layer?.backgroundColor = color.cgColor
    }
}

enum BrowserScreenshotMetrics {
    static func visiblePageRect(
        in bounds: CGRect,
        developerToolsVisible: Bool,
        panelPercent: CGFloat
    ) -> CGRect {
        guard developerToolsVisible else { return bounds }
        let percent = BrowserDeveloperToolsMetrics.clamp(panelPercent) / 100
        return CGRect(
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.width,
            height: max(0, bounds.height * (1 - percent))
        )
    }
}

enum BrowserScreenshotEncoder {
    static func pngData(from image: NSImage) -> Data? {
        var proposedRect = CGRect(origin: .zero, size: image.size)
        guard let image = image.cgImage(
            forProposedRect: &proposedRect,
            context: nil,
            hints: nil
        ) else { return nil }
        return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    }
}

enum BrowserScreenshotSaveDecision {
    static func destination(
        for response: NSApplication.ModalResponse,
        selectedURL: URL?
    ) -> URL? {
        response == .OK ? selectedURL : nil
    }
}

enum BrowserDeveloperToolsContextMenu {
    static let inspectElementTitle = "Inspect Element"
    static let clearElementHighlightTitle = "Clear Element Highlight"
    static let closeDeveloperToolsTitle = "Close Developer Tools"
    static let unavailableToolTip = "Developer Tools unavailable because console.js is missing"
    static let initializationFailedToolTip = "Developer Tools unavailable because console.js failed to initialize"
    static let developerToolsIdentifier = NSUserInterfaceItemIdentifier(
        "org.shellular.browser.developer-tools"
    )
    static let clearElementHighlightIdentifier = NSUserInterfaceItemIdentifier(
        "org.shellular.browser.clear-element-highlight"
    )

    @discardableResult
    static func addDeveloperToolsItems(
        to menu: NSMenu,
        target: AnyObject?,
        developerToolsAction: Selector,
        clearHighlightAction: Selector,
        isEnabled: Bool,
        isVisible: Bool,
        isElementHighlighted: Bool
    ) -> NSMenuItem {
        let title = isVisible ? closeDeveloperToolsTitle : inspectElementTitle
        let item: NSMenuItem
        if let existing = menu.items.first(where: {
            $0.identifier == developerToolsIdentifier ||
                (!$0.isSeparatorItem && [inspectElementTitle, closeDeveloperToolsTitle].contains($0.title))
        }) {
            item = existing
        } else {
            if !menu.items.isEmpty, menu.items.last?.isSeparatorItem != true {
                menu.addItem(.separator())
            }
            item = NSMenuItem(title: title, action: developerToolsAction, keyEquivalent: "")
            menu.addItem(item)
        }

        item.identifier = developerToolsIdentifier
        item.title = title
        item.target = isEnabled ? target : nil
        item.action = isEnabled ? developerToolsAction : nil
        item.isEnabled = isEnabled
        item.toolTip = isEnabled ? nil : unavailableToolTip

        let existingClearItem = menu.items.first {
            $0.identifier == clearElementHighlightIdentifier ||
                (!$0.isSeparatorItem && $0.title == clearElementHighlightTitle)
        }
        if isEnabled && isVisible && isElementHighlighted {
            let clearItem = existingClearItem ?? NSMenuItem(
                title: clearElementHighlightTitle,
                action: clearHighlightAction,
                keyEquivalent: ""
            )
            if clearItem.menu == nil {
                menu.insertItem(clearItem, at: menu.index(of: item))
            }
            clearItem.identifier = clearElementHighlightIdentifier
            clearItem.title = clearElementHighlightTitle
            clearItem.target = target
            clearItem.action = clearHighlightAction
            clearItem.isEnabled = true
            clearItem.toolTip = nil
        } else if let existingClearItem {
            menu.removeItem(existingClearItem)
        }
        return item
    }
}

final class BrowserInspectableWebView: WKWebView {
    var embeddedDeveloperToolsAvailable = false
    var developerToolsVisibility: (() -> Bool)?
    var elementHighlightVisibility: (() -> Bool)?
    var onInspectElement: (() -> Void)?
    var onClearElementHighlight: (() -> Void)?
    var onCloseDeveloperTools: (() -> Void)?

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = super.menu(for: event) ?? NSMenu()
        addDeveloperToolsItem(to: menu)
        return menu
    }

    override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
        super.willOpenMenu(menu, with: event)
        addDeveloperToolsItem(to: menu)
    }

    private func addDeveloperToolsItem(to menu: NSMenu) {
        BrowserDeveloperToolsContextMenu.addDeveloperToolsItems(
            to: menu,
            target: self,
            developerToolsAction: #selector(developerToolsFromContextMenu(_:)),
            clearHighlightAction: #selector(clearElementHighlightFromContextMenu(_:)),
            isEnabled: embeddedDeveloperToolsAvailable,
            isVisible: developerToolsVisibility?() ?? false,
            isElementHighlighted: elementHighlightVisibility?() ?? false
        )
    }

    @objc private func clearElementHighlightFromContextMenu(_ sender: Any?) {
        guard embeddedDeveloperToolsAvailable else { return }
        onClearElementHighlight?()
    }

    @objc private func developerToolsFromContextMenu(_ sender: Any?) {
        guard embeddedDeveloperToolsAvailable else { return }
        if developerToolsVisibility?() == true {
            onCloseDeveloperTools?()
        } else {
            onInspectElement?()
        }
    }
}

enum BrowserResizeSource: Hashable {
    case window
    case sidebar
}

struct BrowserResizeLifecycle {
    private(set) var activeSources: Set<BrowserResizeSource> = []

    mutating func begin(_ source: BrowserResizeSource) -> Bool {
        let wasIdle = activeSources.isEmpty
        activeSources.insert(source)
        return wasIdle && !activeSources.isEmpty
    }

    mutating func end(_ source: BrowserResizeSource) -> Bool {
        let wasActive = !activeSources.isEmpty
        activeSources.remove(source)
        return wasActive && activeSources.isEmpty
    }
}

enum BrowserDividerCursorRegion {
    static func rect(in bounds: NSRect) -> NSRect { bounds }
}

enum BrowserRootLayout {
    static func configure(stack: NSStackView, content: NSView) {
        stack.orientation = .vertical
        stack.distribution = .fill
        stack.spacing = 0
        content.setContentHuggingPriority(.defaultLow, for: .vertical)
        content.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    }
}

enum BrowserLiveResizePolicy {
    static func apply(to window: NSWindow, views: [NSView] = []) {
        // WKWebView is backed by a remote compositor. Let AppKit preserve the
        // last committed window contents during a live edge resize instead of
        // exposing an unpainted band while that compositor catches up.
        window.preservesContentDuringLiveResize = true
        for view in views {
            view.layerContentsRedrawPolicy = .duringViewResize
        }
    }
}

final class BrowserResizeUnderlayView: NSView {
    private let contentFillView = NSView()
    private let chromeFillView = NSView()
    private(set) var contentColor = NSColor.windowBackgroundColor
    private(set) var chromeColor = NSColor.windowBackgroundColor
    var chromeHeight: CGFloat = 40 {
        didSet { needsLayout = true }
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        [contentFillView, chromeFillView].forEach {
            $0.wantsLayer = true
            addSubview($0)
        }
        apply(content: contentColor, chrome: chromeColor)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        contentFillView.frame = bounds
        chromeFillView.frame = NSRect(
            x: bounds.minX,
            y: max(bounds.minY, bounds.maxY - min(chromeHeight, bounds.height)),
            width: bounds.width,
            height: min(chromeHeight, bounds.height)
        )
        CATransaction.commit()
    }

    func apply(content: NSColor, chrome: NSColor) {
        contentColor = content
        chromeColor = chrome
        contentFillView.layer?.backgroundColor = content.cgColor
        chromeFillView.layer?.backgroundColor = chrome.cgColor
    }

    var contentFillFrame: NSRect { contentFillView.frame }
    var chromeFillFrame: NSRect { chromeFillView.frame }
}

enum TitlebarDragRegion {
    static func frame(
        in workbenchBounds: NSRect,
        trafficLightTrailingEdge: CGFloat,
        height: CGFloat = 40,
        trailingInset: CGFloat = 12
    ) -> NSRect {
        let leading = ceil(trafficLightTrailingEdge + 10)
        return NSRect(
            x: leading,
            y: max(workbenchBounds.minY, workbenchBounds.maxY - height),
            width: max(0, workbenchBounds.width - leading - trailingInset),
            height: min(height, workbenchBounds.height)
        )
    }
}

enum BrowserTrustEvaluationScheduler {
    static func schedule(
        on queue: DispatchQueue,
        _ operation: @escaping (DispatchQueue) -> Void
    ) {
        queue.async {
            operation(queue)
        }
    }
}

enum BrowserAddressResolver {
    private static let allowedSchemes = Set(["http", "https", "shellular"])

    static func resolve(_ input: String) -> URL? {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return URL(string: "shellular://home") }

        if hasExplicitScheme(value) {
            guard var components = URLComponents(string: value),
                  let scheme = components.scheme?.lowercased(),
                  allowedSchemes.contains(scheme) else { return nil }
            normalizeUnspecifiedHost(&components)
            return components.url
        }

        if value.contains(where: \.isWhitespace) {
            return searchURL(value)
        }

        let candidate = candidateComponents(value)
        guard let rawHost = candidate?.host?.lowercased() else {
            return searchURL(value)
        }
        let host = unbracketedHost(rawHost)
        guard !host.isEmpty else { return searchURL(value) }
        let hasExplicitPort =
            value.range(of: #"(?:\]|\w):\d+(?:[/?#]|$)"#, options: .regularExpression) != nil
        let looksLikeHost =
            hasExplicitPort ||
            host.contains(".") ||
            host == "localhost" ||
            host.hasSuffix(".localhost") ||
            host.hasSuffix(".local") ||
            isIPAddress(host)
        guard looksLikeHost else { return searchURL(value) }

        let scheme = isDevelopmentHost(host) || hasExplicitPort ? "http" : "https"
        let address = (value == "::1" || value == "::") ? "[\(value)]" : value
        var components = URLComponents(string: "\(scheme)://\(address)")
        normalizeUnspecifiedHost(&components)
        return components?.url
    }

    static func isRestorable(_ value: String) -> Bool {
        guard let url = URL(string: value), let scheme = url.scheme?.lowercased() else {
            return false
        }
        if scheme == "shellular" { return !(url.host ?? "").isEmpty }
        return scheme == "http" || scheme == "https"
    }

    private static func candidateComponents(_ value: String) -> URLComponents? {
        if value == "::1" || value == "::" {
            return URLComponents(string: "http://[\(value)]")
        }
        return URLComponents(string: "http://\(value)")
    }

    private static func hasExplicitScheme(_ value: String) -> Bool {
        guard let match = value.range(
            of: #"^[A-Za-z][A-Za-z0-9+.-]*:"#,
            options: .regularExpression
        ) else { return false }
        let remainder = value[match.upperBound...]
        // A hostname followed by a numeric port is not a URL scheme, for example
        // localhost:3000 or app.test:8443/path.
        if let first = remainder.first, first.isNumber {
            return false
        }
        return true
    }

    private static func normalizeUnspecifiedHost(_ components: inout URLComponents?) {
        guard var value = components else { return }
        let host = unbracketedHost(value.host?.lowercased() ?? "")
        if host == "0.0.0.0" || host == "::" {
            value.host = "localhost"
        }
        components = value
    }

    private static func normalizeUnspecifiedHost(_ components: inout URLComponents) {
        let host = unbracketedHost(components.host?.lowercased() ?? "")
        if host == "0.0.0.0" || host == "::" {
            components.host = "localhost"
        }
    }

    private static func unbracketedHost(_ host: String) -> String {
        guard host.hasPrefix("["), host.hasSuffix("]") else { return host }
        return String(host.dropFirst().dropLast())
    }

    private static func isDevelopmentHost(_ host: String) -> Bool {
        if host == "localhost" ||
            host.hasSuffix(".localhost") ||
            host.hasSuffix(".local") ||
            host == "0.0.0.0" ||
            host == "::" ||
            host == "::1" ||
            host.hasPrefix("fe80:") ||
            host.hasPrefix("fc") ||
            host.hasPrefix("fd") {
            return true
        }
        guard let octets = ipv4Octets(host) else { return false }
        return octets[0] == 10 ||
            octets[0] == 127 ||
            (octets[0] == 169 && octets[1] == 254) ||
            (octets[0] == 172 && (16...31).contains(octets[1])) ||
            (octets[0] == 192 && octets[1] == 168)
    }

    private static func isIPAddress(_ host: String) -> Bool {
        ipv4Octets(host) != nil || host.contains(":")
    }

    private static func ipv4Octets(_ host: String) -> [Int]? {
        let values = host.split(separator: ".", omittingEmptySubsequences: false)
            .compactMap { Int($0) }
        guard values.count == 4, values.allSatisfy({ (0...255).contains($0) }) else {
            return nil
        }
        return values
    }

    private static func searchURL(_ query: String) -> URL? {
        var components = URLComponents(string: "https://www.google.com/search")
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        return components?.url
    }
}

enum BrowserSidebarMetrics {
    static let persistenceKey = "shellular.browser.sidebarWidth.v1"
    static let defaultWidth: CGFloat = 400
    static let minimumWidth: CGFloat = 280
    static let maximumWindowFraction: CGFloat = 0.7
    static let minimumWorkbenchWidth: CGFloat = 360

    static func clampedWidth(_ width: CGFloat, containerWidth: CGFloat) -> CGFloat {
        let maximum = max(
            minimumWidth,
            min(
                containerWidth * maximumWindowFraction,
                containerWidth - minimumWorkbenchWidth
            )
        )
        return min(maximum, max(minimumWidth, width))
    }

    static func layout(
        in bounds: NSRect,
        preferredWidth: CGFloat,
        isVisible: Bool
    ) -> BrowserSidebarLayout {
        let sidebarWidth = clampedWidth(preferredWidth, containerWidth: bounds.width)
        let occupiedWidth = isVisible ? sidebarWidth : 0
        let workbenchWidth = max(0, bounds.width - occupiedWidth)
        return BrowserSidebarLayout(
            workbenchFrame: NSRect(
                x: bounds.minX,
                y: bounds.minY,
                width: workbenchWidth,
                height: bounds.height
            ),
            sidebarFrame: NSRect(
                x: bounds.minX + workbenchWidth,
                y: bounds.minY,
                width: sidebarWidth,
                height: bounds.height
            ),
            dividerFrame: NSRect(
                x: max(bounds.minX, bounds.minX + workbenchWidth - 4),
                y: bounds.minY,
                width: 8,
                height: bounds.height
            )
        )
    }
}

struct BrowserSidebarLayout: Equatable {
    let workbenchFrame: NSRect
    let sidebarFrame: NSRect
    let dividerFrame: NSRect
}

struct BrowserSidebarWidthStore {
    private let defaults: UserDefaults
    private let key: String

    init(
        defaults: UserDefaults = .standard,
        key: String = BrowserSidebarMetrics.persistenceKey
    ) {
        self.defaults = defaults
        self.key = key
    }

    func load() -> CGFloat {
        let value = defaults.double(forKey: key)
        return value > 0 ? CGFloat(value) : BrowserSidebarMetrics.defaultWidth
    }

    func save(_ value: CGFloat) {
        defaults.set(Double(value), forKey: key)
    }
}

enum BrowserPresentation: Equatable {
    case sidebar
    case window
}

struct BrowserPresentationState: Equatable {
    private(set) var value: BrowserPresentation = .sidebar

    mutating func moveToSidebar() {
        value = .sidebar
    }

    mutating func moveToWindow() {
        value = .window
    }
}

struct BrowserChromePalette {
    let primary: NSColor
    let secondary: NSColor
    let surfaceSoft: NSColor
    let chromeBackground: NSColor
    let primaryText: NSColor
    let secondaryText: NSColor
    let lineSoft: NSColor
    let accent: NSColor
    let danger: NSColor
    let tabHoverBackground: NSColor
    let tabSelectedBackground: NSColor
    let tabPressedBackground: NSColor

    init(_ theme: [String: Any]) {
        primary = Self.color(theme, keys: ["primary"], fallback: .windowBackgroundColor)
        surfaceSoft = Self.color(
            theme,
            keys: ["surfaceSoft", "secondary"],
            fallback: .controlBackgroundColor
        )
        secondary = Self.color(theme, keys: ["secondary"], fallback: surfaceSoft)
        chromeBackground = Self.mix(secondary, primary, firstWeight: 0.94)
        primaryText = Self.color(theme, keys: ["primaryText"], fallback: .labelColor)
        secondaryText = Self.color(
            theme,
            keys: ["secondaryText", "textMuted"],
            fallback: .secondaryLabelColor
        )
        lineSoft = Self.color(
            theme,
            keys: ["lineSoft", "cardBorder"],
            fallback: .separatorColor
        )
        accent = Self.color(
            theme,
            keys: ["accent", "primaryActiveText", "link"],
            fallback: .controlAccentColor
        )
        danger = Self.color(theme, keys: ["danger"], fallback: .systemRed)
        tabHoverBackground = Self.opaqueMix(
            primaryText,
            chromeBackground,
            foregroundWeight: 0.10
        )
        tabSelectedBackground = Self.opaqueMix(
            accent,
            chromeBackground,
            foregroundWeight: 0.16
        )
        tabPressedBackground = Self.opaqueMix(
            accent,
            chromeBackground,
            foregroundWeight: 0.24
        )
    }

    var separator: NSColor { lineSoft }

    private static func mix(
        _ first: NSColor,
        _ second: NSColor,
        firstWeight: CGFloat
    ) -> NSColor {
        guard let first = first.usingColorSpace(.sRGB),
              let second = second.usingColorSpace(.sRGB) else { return first }
        let firstWeight = min(1, max(0, firstWeight))
        let secondWeight = 1 - firstWeight
        return NSColor(
            srgbRed: first.redComponent * firstWeight + second.redComponent * secondWeight,
            green: first.greenComponent * firstWeight + second.greenComponent * secondWeight,
            blue: first.blueComponent * firstWeight + second.blueComponent * secondWeight,
            alpha: first.alphaComponent * firstWeight + second.alphaComponent * secondWeight
        )
    }

    private static func opaqueMix(
        _ foreground: NSColor,
        _ background: NSColor,
        foregroundWeight: CGFloat
    ) -> NSColor {
        guard let foreground = foreground.usingColorSpace(.sRGB),
              let background = background.usingColorSpace(.sRGB) else {
            return background.withAlphaComponent(1)
        }
        let foregroundWeight = min(1, max(0, foregroundWeight))
        let backgroundWeight = 1 - foregroundWeight
        return NSColor(
            srgbRed: foreground.redComponent * foregroundWeight
                + background.redComponent * backgroundWeight,
            green: foreground.greenComponent * foregroundWeight
                + background.greenComponent * backgroundWeight,
            blue: foreground.blueComponent * foregroundWeight
                + background.blueComponent * backgroundWeight,
            alpha: 1
        )
    }

    private static func color(
        _ theme: [String: Any],
        keys: [String],
        fallback: NSColor
    ) -> NSColor {
        for key in keys {
            guard let rawValue = theme[key] as? String,
                  let components = NativeThemeColorParser.parse(rawValue) else { continue }
            return NSColor(
                srgbRed: CGFloat(components.red),
                green: CGFloat(components.green),
                blue: CGFloat(components.blue),
                alpha: CGFloat(components.alpha)
            )
        }
        return fallback
    }
}

class BrowserNonDraggableButton: NSButton {
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class BrowserTabHoverButton: BrowserNonDraggableButton {
    private var hoverTrackingArea: NSTrackingArea?
    private(set) var isPointerInside = false
    var onStateChange: (() -> Void)?

    override func highlight(_ flag: Bool) {
        super.highlight(flag)
        onStateChange?()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverTrackingArea { removeTrackingArea(hoverTrackingArea) }
        let trackingArea = NSTrackingArea(
            rect: .zero,
            options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
        hoverTrackingArea = trackingArea
    }

    override func mouseEntered(with event: NSEvent) {
        guard !isPointerInside else { return }
        isPointerInside = true
        onStateChange?()
    }

    override func mouseExited(with event: NSEvent) {
        guard isPointerInside else { return }
        isPointerInside = false
        onStateChange?()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard window == nil, isPointerInside else { return }
        isPointerInside = false
        onStateChange?()
    }
}

private final class BrowserTabDecorationView: NSView {
    override var mouseDownCanMoveWindow: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

private final class BrowserTabDecorationLabel: NSTextField {
    override var mouseDownCanMoveWindow: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

struct BrowserTabItemState {
    let id: String
    let title: String
    let isSelected: Bool
    let statusColor: NSColor
}

final class BrowserTabItemView: NSView {
    let id: String
    let selectionButton = BrowserTabHoverButton()
    let closeButton = BrowserTabHoverButton()
    private let statusView = BrowserTabDecorationView()
    private let titleLabel = BrowserTabDecorationLabel(labelWithString: "")
    private var onSelect: ((String) -> Void)?
    private var onClose: ((String) -> Void)?
    private var palette = BrowserChromePalette([:])
    private(set) var isSelected = false
    private(set) var displayedBackgroundColor = NSColor.clear
    var displayedTitle: String { titleLabel.stringValue }
    var displayedTextColor: NSColor { titleLabel.textColor ?? .clear }
    var isHoverHighlighted: Bool { isPointerInside }
    var titleFrame: NSRect { titleLabel.convert(titleLabel.bounds, to: self) }
    var statusFrame: NSRect { statusView.convert(statusView.bounds, to: self) }

    private var isPointerInside: Bool {
        selectionButton.isPointerInside || closeButton.isPointerInside
    }

    private var isPressed: Bool {
        selectionButton.isHighlighted || closeButton.isHighlighted
    }

    override var mouseDownCanMoveWindow: Bool { false }

    init(id: String) {
        self.id = id
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 6
        translatesAutoresizingMaskIntoConstraints = false

        selectionButton.title = ""
        selectionButton.isBordered = false
        selectionButton.bezelStyle = .regularSquare
        selectionButton.focusRingType = .none
        selectionButton.target = self
        selectionButton.action = #selector(selectAction)
        selectionButton.setAccessibilityElement(false)
        selectionButton.onStateChange = { [weak self] in self?.updateAppearance() }
        statusView.wantsLayer = true
        statusView.layer?.cornerRadius = 3
        titleLabel.alignment = .left
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.cell?.usesSingleLineMode = true
        closeButton.image = NSImage(
            systemSymbolName: "xmark",
            accessibilityDescription: "Close Tab"
        )
        closeButton.imagePosition = .imageOnly
        closeButton.title = ""
        closeButton.isBordered = false
        closeButton.toolTip = "Close Tab"
        closeButton.setAccessibilityLabel("Close Tab")
        closeButton.target = self
        closeButton.action = #selector(closeAction)
        closeButton.onStateChange = { [weak self] in self?.updateAppearance() }

        [selectionButton, statusView, titleLabel, closeButton].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            addSubview($0)
        }
        NSLayoutConstraint.activate([
            widthAnchor.constraint(greaterThanOrEqualToConstant: 90),
            widthAnchor.constraint(lessThanOrEqualToConstant: 220),
            heightAnchor.constraint(equalToConstant: 29),
            selectionButton.leadingAnchor.constraint(equalTo: leadingAnchor),
            selectionButton.trailingAnchor.constraint(equalTo: trailingAnchor),
            selectionButton.topAnchor.constraint(equalTo: topAnchor),
            selectionButton.bottomAnchor.constraint(equalTo: bottomAnchor),
            statusView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            statusView.centerYAnchor.constraint(equalTo: centerYAnchor),
            statusView.widthAnchor.constraint(equalToConstant: 6),
            statusView.heightAnchor.constraint(equalToConstant: 6),
            titleLabel.leadingAnchor.constraint(equalTo: statusView.trailingAnchor, constant: 5),
            titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            titleLabel.trailingAnchor.constraint(equalTo: closeButton.leadingAnchor, constant: -2),
            closeButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -5),
            closeButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 18),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let localPoint = superview.map { convert(point, from: $0) } ?? point
        guard !isHidden, alphaValue > 0, bounds.contains(localPoint) else { return nil }
        let closePoint = closeButton.convert(localPoint, from: self)
        if closeButton.bounds.contains(closePoint) {
            return closeButton
        }
        return selectionButton
    }

    override func accessibilityPerformPress() -> Bool {
        onSelect?(id)
        return true
    }

    func update(
        state: BrowserTabItemState,
        palette: BrowserChromePalette,
        onSelect: @escaping (String) -> Void,
        onClose: @escaping (String) -> Void
    ) {
        self.onSelect = onSelect
        self.onClose = onClose
        self.palette = palette
        isSelected = state.isSelected
        titleLabel.stringValue = state.title.isEmpty ? "New Tab" : state.title
        titleLabel.font = .systemFont(ofSize: 12, weight: state.isSelected ? .medium : .regular)
        setAccessibilityRole(.radioButton)
        setAccessibilityLabel(titleLabel.stringValue)
        setAccessibilitySelected(state.isSelected)
        statusView.layer?.backgroundColor = state.statusColor.cgColor
        updateAppearance()
    }

    @objc private func selectAction() { onSelect?(id) }
    @objc private func closeAction() { onClose?(id) }

    private func updateAppearance() {
        let color: NSColor
        if isPressed {
            color = palette.tabPressedBackground
        } else if isSelected {
            color = palette.tabSelectedBackground
        } else if isPointerInside {
            color = palette.tabHoverBackground
        } else {
            color = palette.chromeBackground
        }
        let foreground = (isSelected || isPointerInside || isPressed)
            ? palette.primaryText
            : palette.secondaryText
        displayedBackgroundColor = color
        layer?.backgroundColor = color.cgColor
        titleLabel.textColor = foreground
        closeButton.contentTintColor = foreground
    }
}

enum BrowserThemeScript {
    static func variables(from theme: [String: Any]) -> [String: String] {
        theme.reduce(into: [:]) { result, entry in
            guard let value = entry.value as? String else { return }
            result[cssVariableName(for: entry.key)] = value
        }
    }

    static func make(from theme: [String: Any]) -> String? {
        let variables = variables(from: theme)
        guard JSONSerialization.isValidJSONObject(variables),
              let data = try? JSONSerialization.data(withJSONObject: variables, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return """
        (() => {
          const variables = \(json);
          const root = document.documentElement;
          for (const [name, value] of Object.entries(variables)) {
            root.style.setProperty(name, value);
          }
          return true;
        })();
        """
    }

    static func cssVariableName(for key: String) -> String {
        if key.hasPrefix("--") { return key }
        let kebab = key.reduce(into: "") { result, character in
            if character.isUppercase {
                result.append("-")
                result.append(contentsOf: character.lowercased())
            } else {
                result.append(character)
            }
        }
        return "--\(kebab)"
    }
}

final class BrowserAddressBar: NSView {
    let securityButton = NSButton()
    let textField = NSTextField()
    let clearButton = NSButton()
    private(set) var isFocused = false
    private(set) var hasValidationError = false
    private var palette = BrowserChromePalette([:])

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 6
        layer?.borderWidth = 1
        setContentHuggingPriority(.defaultLow, for: .horizontal)
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        configureButton(securityButton, symbol: "info.circle", label: "Connection security")
        configureButton(clearButton, symbol: "xmark.circle.fill", label: "Clear address")
        clearButton.isHidden = true

        textField.placeholderString = "Search Google or enter an address"
        textField.font = .systemFont(ofSize: 13)
        textField.isBezeled = false
        textField.isBordered = false
        textField.drawsBackground = false
        textField.focusRingType = .none
        textField.lineBreakMode = .byTruncatingTail
        textField.cell?.usesSingleLineMode = true
        textField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        textField.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        [securityButton, textField, clearButton].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            addSubview($0)
        }
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 36).isActive = true
        NSLayoutConstraint.activate([
            securityButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 5),
            securityButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            securityButton.widthAnchor.constraint(equalToConstant: 26),
            securityButton.heightAnchor.constraint(equalToConstant: 26),
            textField.leadingAnchor.constraint(equalTo: securityButton.trailingAnchor, constant: 2),
            textField.centerYAnchor.constraint(equalTo: centerYAnchor),
            textField.trailingAnchor.constraint(equalTo: clearButton.leadingAnchor, constant: -2),
            clearButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -5),
            clearButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            clearButton.widthAnchor.constraint(equalToConstant: 26),
            clearButton.heightAnchor.constraint(equalToConstant: 26),
        ])
        applyPalette(palette)
    }

    required init?(coder: NSCoder) { fatalError() }

    func applyPalette(_ palette: BrowserChromePalette) {
        self.palette = palette
        textField.textColor = hasValidationError ? palette.danger : palette.primaryText
        textField.placeholderAttributedString = NSAttributedString(
            string: "Search Google or enter an address",
            attributes: [
                .foregroundColor: palette.secondaryText.withAlphaComponent(0.6),
                .font: NSFont.systemFont(ofSize: 13),
            ]
        )
        securityButton.contentTintColor = palette.secondaryText
        clearButton.contentTintColor = palette.secondaryText
        updateLayerColors()
    }

    func setFocused(_ focused: Bool) {
        isFocused = focused
        updateLayerColors()
    }

    func setValidationError(_ invalid: Bool) {
        hasValidationError = invalid
        textField.textColor = invalid ? palette.danger : palette.primaryText
        updateLayerColors()
    }

    func updateClearButton(isEditing: Bool) {
        clearButton.isHidden = !isEditing || textField.stringValue.isEmpty
    }

    func setSecurity(symbol: String, help: String, color: NSColor) {
        securityButton.image = NSImage(
            systemSymbolName: symbol,
            accessibilityDescription: help
        )
        securityButton.toolTip = help
        securityButton.setAccessibilityLabel(help)
        securityButton.contentTintColor = color
    }

    private func updateLayerColors() {
        layer?.backgroundColor = (isFocused ? palette.primary : palette.surfaceSoft).cgColor
        layer?.borderColor = (hasValidationError ? palette.danger : isFocused ? palette.accent : palette.lineSoft).cgColor
    }

    private func configureButton(_ button: NSButton, symbol: String, label: String) {
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        button.imagePosition = .imageOnly
        button.title = ""
        button.isBordered = false
        button.bezelStyle = .texturedRounded
        button.toolTip = label
        button.setAccessibilityLabel(label)
    }
}

final class BrowserTabHeaderView: NSView {
    let tabStack = NSStackView()
    let addButton = BrowserNonDraggableButton()
    let tabListButton = BrowserNonDraggableButton()
    let presentationButton = BrowserNonDraggableButton()
    let closeButton = BrowserNonDraggableButton()
    private let scrollView = NSScrollView()
    private let tabDocumentView = NSView()
    private let actionsStack = NSStackView()
    private let separatorView = NSView()
    private var scrollLeadingConstraint: NSLayoutConstraint!
    private var tabItemsByID: [String: BrowserTabItemView] = [:]
    private var orderedTabIDs: [String] = []
    private var selectedTabID: String?
    private(set) var presentation: BrowserPresentation = .sidebar
    private(set) var palette = BrowserChromePalette([:])

    override var mouseDownCanMoveWindow: Bool { false }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 40).isActive = true

        scrollView.drawsBackground = false
        scrollView.hasHorizontalScroller = false
        scrollView.hasVerticalScroller = false
        scrollView.horizontalScrollElasticity = .automatic
        scrollView.verticalScrollElasticity = .none
        scrollView.documentView = tabDocumentView

        tabStack.orientation = .horizontal
        tabStack.alignment = .centerY
        tabStack.spacing = 3
        tabStack.translatesAutoresizingMaskIntoConstraints = false
        tabDocumentView.addSubview(tabStack)

        actionsStack.orientation = .horizontal
        actionsStack.alignment = .centerY
        actionsStack.spacing = 2
        actionsStack.setContentHuggingPriority(.required, for: .horizontal)
        actionsStack.setContentCompressionResistancePriority(.required, for: .horizontal)
        [addButton, tabListButton, presentationButton, closeButton].forEach {
            configureButton($0)
            actionsStack.addArrangedSubview($0)
        }

        [scrollView, actionsStack, separatorView].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            addSubview($0)
        }
        scrollLeadingConstraint = scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6)
        NSLayoutConstraint.activate([
            scrollLeadingConstraint,
            scrollView.topAnchor.constraint(equalTo: topAnchor, constant: 5),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
            scrollView.trailingAnchor.constraint(equalTo: actionsStack.leadingAnchor, constant: -4),
            actionsStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            actionsStack.centerYAnchor.constraint(equalTo: centerYAnchor),
            separatorView.leadingAnchor.constraint(equalTo: leadingAnchor),
            separatorView.trailingAnchor.constraint(equalTo: trailingAnchor),
            separatorView.bottomAnchor.constraint(equalTo: bottomAnchor),
            separatorView.heightAnchor.constraint(equalToConstant: 1),
            tabStack.leadingAnchor.constraint(equalTo: tabDocumentView.leadingAnchor),
            tabStack.trailingAnchor.constraint(equalTo: tabDocumentView.trailingAnchor),
            tabStack.topAnchor.constraint(equalTo: tabDocumentView.topAnchor),
            tabStack.bottomAnchor.constraint(equalTo: tabDocumentView.bottomAnchor),
        ])
        applyPresentation(.sidebar)
        applyPalette(palette)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.acceptsMouseMovedEvents = true
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let localPoint = superview.map { convert(point, from: $0) } ?? point
        if scrollView.frame.contains(localPoint) {
            for case let item as BrowserTabItemView in tabStack.arrangedSubviews.reversed() {
                let itemPoint = item.convert(localPoint, from: self)
                if item.bounds.contains(itemPoint) {
                    let closePoint = item.closeButton.convert(itemPoint, from: item)
                    return item.closeButton.bounds.contains(closePoint)
                        ? item.closeButton
                        : item.selectionButton
                }
            }
        }
        return super.hitTest(point)
    }

    override func layout() {
        super.layout()
        let viewport = scrollView.contentView.bounds.size
        let fitting = tabStack.fittingSize
        let documentSize = NSSize(
            width: max(viewport.width, fitting.width),
            height: max(viewport.height, fitting.height)
        )
        if tabDocumentView.frame.size != documentSize {
            tabDocumentView.frame = NSRect(origin: .zero, size: documentSize)
        }
        tabDocumentView.layoutSubtreeIfNeeded()
    }

    func applyPresentation(_ presentation: BrowserPresentation) {
        self.presentation = presentation
        scrollLeadingConstraint.constant = presentation == .window ? 78 : 6
        closeButton.isHidden = presentation == .window
        let symbol = presentation == .window ? "sidebar.right" : "arrow.up.right.square"
        let help = presentation == .window ? "Move to Sidebar" : "Open in Separate Window"
        presentationButton.image = NSImage(systemSymbolName: symbol, accessibilityDescription: help)
        presentationButton.toolTip = help
        presentationButton.setAccessibilityLabel(help)
        needsLayout = true
    }

    func applyPalette(_ palette: BrowserChromePalette) {
        self.palette = palette
        layer?.backgroundColor = palette.chromeBackground.cgColor
        separatorView.wantsLayer = true
        separatorView.layer?.backgroundColor = palette.lineSoft.cgColor
        [addButton, tabListButton, presentationButton, closeButton].forEach {
            $0.contentTintColor = palette.secondaryText
        }
    }

    func reconcileTabs(
        _ states: [BrowserTabItemState],
        onSelect: @escaping (String) -> Void,
        onClose: @escaping (String) -> Void
    ) {
        let nextIDs = states.map(\.id)
        let structureChanged = nextIDs != orderedTabIDs
        let validIDs = Set(nextIDs)
        for id in orderedTabIDs where !validIDs.contains(id) {
            guard let item = tabItemsByID.removeValue(forKey: id) else { continue }
            tabStack.removeArrangedSubview(item)
            item.removeFromSuperview()
        }

        if structureChanged {
            for (index, state) in states.enumerated() {
                let item = tabItemsByID[state.id] ?? BrowserTabItemView(id: state.id)
                tabItemsByID[state.id] = item
                if !tabStack.arrangedSubviews.contains(where: { $0 === item }) {
                    tabStack.insertArrangedSubview(item, at: min(index, tabStack.arrangedSubviews.count))
                } else if tabStack.arrangedSubviews.firstIndex(where: { $0 === item }) != index {
                    tabStack.removeArrangedSubview(item)
                    tabStack.insertArrangedSubview(item, at: min(index, tabStack.arrangedSubviews.count))
                }
            }
            orderedTabIDs = nextIDs
        }

        for state in states {
            tabItemsByID[state.id]?.update(
                state: state,
                palette: palette,
                onSelect: onSelect,
                onClose: onClose
            )
        }

        let nextSelectedID = states.first(where: \.isSelected)?.id
        let shouldScroll = nextSelectedID != selectedTabID || structureChanged
        selectedTabID = nextSelectedID
        needsLayout = true
        guard shouldScroll, let nextSelectedID,
              let selectedItem = tabItemsByID[nextSelectedID] else { return }
        DispatchQueue.main.async { [weak self, weak selectedItem] in
            guard let self, let selectedItem else { return }
            self.scrollTabToVisible(selectedItem)
        }
    }

    func tabItem(withID id: String) -> BrowserTabItemView? {
        tabItemsByID[id]
    }

    func scrollTabToVisible(_ tabView: NSView) {
        layoutSubtreeIfNeeded()
        tabDocumentView.layoutSubtreeIfNeeded()
        let rect = tabView.convert(tabView.bounds, to: tabDocumentView)
        scrollView.contentView.scrollToVisible(rect.insetBy(dx: -4, dy: 0))
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    private func configureButton(_ button: NSButton) {
        button.imagePosition = .imageOnly
        button.title = ""
        button.isBordered = false
        button.bezelStyle = .texturedRounded
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: 30).isActive = true
        button.heightAnchor.constraint(equalToConstant: 30).isActive = true
    }
}

struct BrowserTrustException: Hashable {
    let host: String
    let port: Int
    let certificateFingerprint: String
}

final class BrowserTrustExceptionStore {
    private var values = Set<BrowserTrustException>()

    func approve(_ exception: BrowserTrustException) {
        values.insert(exception)
    }

    func contains(_ exception: BrowserTrustException) -> Bool {
        values.contains(exception)
    }

    func removeAll() {
        values.removeAll()
    }
}

final class BrowserOneTimeTokenStore {
    private var tokens = Set<String>()

    func issue() -> String {
        let token = UUID().uuidString
        tokens.insert(token)
        return token
    }

    func consume(_ token: String) -> Bool {
        tokens.remove(token) != nil
    }
}
