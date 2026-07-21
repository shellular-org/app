import AppKit
import WebKit

protocol RecentPointerEventProviding: AnyObject {
    func recentContextEvent(near point: CGPoint) -> NSEvent?
}

private final class ShellularWorkbenchWebView: WKWebView, RecentPointerEventProviding {
    private struct CapturedPointerEvent {
        let event: NSEvent
        let capturedAt: TimeInterval
    }

    private var recentPointerEvents: [CapturedPointerEvent] = []

    override func menu(for event: NSEvent) -> NSMenu? {
        capture(event)
        return nil
    }

    override func mouseDown(with event: NSEvent) {
        capture(event)
        super.mouseDown(with: event)
    }

    override func rightMouseDown(with event: NSEvent) {
        capture(event)
        super.rightMouseDown(with: event)
    }

    override func otherMouseDown(with event: NSEvent) {
        capture(event)
        super.otherMouseDown(with: event)
    }

    func recentContextEvent(near point: CGPoint) -> NSEvent? {
        let now = ProcessInfo.processInfo.systemUptime
        recentPointerEvents.removeAll { now - $0.capturedAt > 1.25 }
        let candidates = recentPointerEvents.enumerated().filter { _, captured in
            let event = captured.event
            let isContextEvent = event.type == .rightMouseDown ||
                (event.type == .leftMouseDown && event.modifierFlags.contains(.control))
            return isContextEvent && event.window === window
        }
        guard let match = candidates.min(by: { first, second in
            distance(from: first.element.event, to: point) <
                distance(from: second.element.event, to: point)
        }) else { return nil }
        let event = match.element.event
        // One DOM context-menu invocation consumes the captured native event.
        // Discard duplicates recorded by both rightMouseDown and menu(for:).
        recentPointerEvents.removeAll { captured in
            captured.event.type == .rightMouseDown ||
                (captured.event.type == .leftMouseDown && captured.event.modifierFlags.contains(.control))
        }
        return event
    }

    private func distance(from event: NSEvent, to point: CGPoint) -> CGFloat {
        let eventPoint = convert(event.locationInWindow, from: nil)
        return hypot(eventPoint.x - point.x, eventPoint.y - point.y)
    }

    private func capture(_ event: NSEvent) {
        guard event.type == .leftMouseDown ||
                event.type == .rightMouseDown ||
                event.type == .otherMouseDown else { return }
        let now = ProcessInfo.processInfo.systemUptime
        recentPointerEvents.removeAll { now - $0.capturedAt > 1.25 }
        recentPointerEvents.append(CapturedPointerEvent(event: event, capturedAt: now))
        if recentPointerEvents.count > 8 {
            recentPointerEvents.removeFirst(recentPointerEvents.count - 8)
        }
    }
}

private final class WorkbenchRootView: NSView {
    var backgroundColor = NSColor.windowBackgroundColor {
        didSet { needsDisplay = true }
    }
    var onLiveResizeChange: ((Bool) -> Void)?

    override var wantsUpdateLayer: Bool { true }

    override func updateLayer() {
        layer?.backgroundColor = backgroundColor.cgColor
    }

    override func viewWillStartLiveResize() {
        super.viewWillStartLiveResize()
        onLiveResizeChange?(true)
    }

    override func viewDidEndLiveResize() {
        super.viewDidEndLiveResize()
        onLiveResizeChange?(false)
    }
}

private final class TitlebarDragView: NSView {
    override func mouseDown(with event: NSEvent) {
        guard let window = window as? ShellularWindow else { return }
        if event.clickCount == 2 {
            window.performConfiguredTitlebarDoubleClick()
            return
        }
        window.beginTitlebarDrag()
        window.performDrag(with: event)
        window.endTitlebarDrag()
    }
}

private final class WindowChromeController {
    static let titlebarHeight: CGFloat = 40

    private weak var window: NSWindow?
    private weak var titlebarHostView: NSView?
    private var observers: [NSObjectProtocol] = []

    deinit {
        stopObserving()
    }

    func attach(to nextWindow: NSWindow?, titlebarHostView: NSView) {
        self.titlebarHostView = titlebarHostView
        guard window !== nextWindow else {
            layout()
            return
        }
        stopObserving()
        window = nextWindow
        guard let nextWindow else { return }

        nextWindow.styleMask.insert(.fullSizeContentView)
        nextWindow.titleVisibility = .hidden
        nextWindow.titlebarAppearsTransparent = true
        nextWindow.titlebarSeparatorStyle = .none
        nextWindow.tabbingMode = .disallowed
        nextWindow.preservesContentDuringLiveResize = true

        let center = NotificationCenter.default
        let notifications: [Notification.Name] = [
            NSWindow.didEnterFullScreenNotification,
            NSWindow.didExitFullScreenNotification,
            NSWindow.didChangeBackingPropertiesNotification,
        ]
        observers = notifications.map { name in
            center.addObserver(forName: name, object: nextWindow, queue: .main) { [weak self, weak nextWindow] _ in
                guard let self, let nextWindow else { return }
                self.titlebarHostView?.needsLayout = true
                self.layoutTrafficLights(in: nextWindow)
            }
        }
        layoutTrafficLights(in: nextWindow)
    }

    func layout() {
        guard let window else { return }
        layoutTrafficLights(in: window)
    }

    private func layoutTrafficLights(in window: NSWindow) {
        guard !window.styleMask.contains(.fullScreen),
              let titlebarHostView,
              titlebarHostView.window === window else {
            return
        }
        let customTitlebarTop = titlebarHostView.convert(titlebarHostView.bounds, to: nil).maxY
        let desiredCenterY = customTitlebarTop - Self.titlebarHeight / 2
        for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            guard let button = window.standardWindowButton(kind),
                  let container = button.superview else { continue }
            let currentCenterY = container.convert(button.frame, to: nil).midY
            let offset = desiredCenterY - currentCenterY
            if abs(offset) > 0.25 {
                button.frame.origin.y += offset
            }
        }
    }

    private func stopObserving() {
        let center = NotificationCenter.default
        observers.forEach(center.removeObserver)
        observers.removeAll()
    }
}

final class WebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate {
    private(set) var webView: WKWebView!
    let bridge = Bridge()
    private let errorLabel = NSTextField(labelWithString: "")
    private let titlebarDragView = TitlebarDragView()
    private let windowChrome = WindowChromeController()
    private var pendingWindowTitle = "Home"

    override func loadView() {
        let rootView = WorkbenchRootView(frame: NSRect(x: 0, y: 0, width: 1100, height: 760))
        rootView.wantsLayer = true
        rootView.autoresizesSubviews = true
        rootView.onLiveResizeChange = { [weak self] active in
            self?.notifyWebContentOfLiveResize(active)
        }
        view = rootView
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "shellular")
        configuration.userContentController.add(bridge, name: "exec")
        webView = ShellularWorkbenchWebView(frame: view.bounds, configuration: configuration)
        webView.navigationDelegate = self; webView.uiDelegate = self; webView.isInspectable = true
        webView.underPageBackgroundColor = (view as? WorkbenchRootView)?.backgroundColor
        webView.autoresizingMask = [.width, .height]
        view.addSubview(webView)
        titlebarDragView.autoresizingMask = [.width, .minYMargin]
        view.addSubview(titlebarDragView)
        errorLabel.alignment = .center; errorLabel.maximumNumberOfLines = 4; errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(errorLabel)
        NSLayoutConstraint.activate([errorLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor), errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor), errorLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 620)])
        bridge.setup(webView: webView, viewController: self)
        if (LocalCLIManager.shared.capability()["available"] as? Bool) == true {
            LocalCLIManager.shared.ensureRunning { result in
                if case .failure(let error) = result {
                    NSLog("Local CLI bootstrap failed: %@", error.localizedDescription)
                }
            }
        }
        webView.load(URLRequest(url: URL(string: "shellular://localhost/")!))
        NotificationCenter.default.addObserver(forName: .reloadWebView, object: nil, queue: .main) { [weak self] _ in self?.webView.reload() }
        NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.webView.evaluateJavaScript("document.dispatchEvent(new CustomEvent('pause'))") }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.webView.evaluateJavaScript("document.dispatchEvent(new CustomEvent('resume'))") }
    }
    override func viewDidAppear() {
        super.viewDidAppear()
        attach(to: view.window)
    }
    override func viewDidLayout() {
        super.viewDidLayout()
        windowChrome.layout()
        if let window = view.window {
            layoutTitlebarDragRegion(in: window)
        }
    }
    private func attach(to window: NSWindow?) {
        windowChrome.attach(to: window, titlebarHostView: view)
        guard let window else { return }
        window.title = pendingWindowTitle
        if let rootView = view as? WorkbenchRootView {
            window.backgroundColor = rootView.backgroundColor
        }
    }

    private func layoutTitlebarDragRegion(in window: NSWindow) {
        let trailingTrafficLightEdge = [
            NSWindow.ButtonType.closeButton,
            .miniaturizeButton,
            .zoomButton,
        ].compactMap { kind -> CGFloat? in
            guard let button = window.standardWindowButton(kind) else { return nil }
            return view.convert(button.bounds, from: button).maxX
        }.max() ?? 82
        let leading = ceil(trailingTrafficLightEdge + 10)
        let frame = NSRect(
            x: leading,
            y: view.bounds.height - WindowChromeController.titlebarHeight,
            width: max(0, view.bounds.width - leading - 12),
            height: WindowChromeController.titlebarHeight
        )
        if titlebarDragView.frame != frame {
            titlebarDragView.frame = frame
        }
    }

    private func notifyWebContentOfLiveResize(_ active: Bool) {
        let event = active ? "shellular:native-resize-start" : "shellular:native-resize-end"
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(event)'))")
    }

    func setTheme(_ theme: [String: Any]) {
        guard let primary = theme["primary"] as? String,
              let components = NativeThemeColorParser.parse(primary) else { return }
        let color = NSColor(
            srgbRed: CGFloat(components.red),
            green: CGFloat(components.green),
            blue: CGFloat(components.blue),
            alpha: CGFloat(components.alpha)
        )
        guard let rootView = view as? WorkbenchRootView else { return }
        rootView.backgroundColor = color
        webView?.underPageBackgroundColor = color
        view.window?.backgroundColor = color
    }
    func setWindowTitle(_ rawTitle: String) {
        let cleaned = rawTitle.unicodeScalars
            .filter { !CharacterSet.controlCharacters.contains($0) }
            .prefix(160)
        let title = String(cleaned.map { Character($0) }).trimmingCharacters(in: .whitespacesAndNewlines)
        pendingWindowTitle = title.isEmpty ? "Home" : title
        view.window?.title = pendingWindowTitle
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { errorLabel.isHidden = true }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { show(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { show(error) }
    private func show(_ error: Error) { errorLabel.stringValue = "Shellular could not load its interface.\n\(error.localizedDescription)"; errorLabel.isHidden = false }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = parameters.allowsDirectories
        panel.beginSheetModal(for: view.window!) { completionHandler($0 == .OK ? panel.urls : nil) }
    }
}

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        let name = url.path == "/" || url.path.isEmpty ? "index.html" : String(url.path.dropFirst())
        guard let root = Bundle.main.resourceURL else { return task.didFailWithError(URLError(.fileDoesNotExist)) }
        let file = root.appendingPathComponent("bundle").appendingPathComponent(name)
        guard let data = try? Data(contentsOf: file) else { return task.didFailWithError(URLError(.fileDoesNotExist)) }
        let types = ["html":"text/html", "js":"application/javascript", "css":"text/css", "json":"application/json", "svg":"image/svg+xml", "png":"image/png", "ttf":"font/ttf", "woff2":"font/woff2"]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": types[file.pathExtension] ?? "application/octet-stream"])!
        task.didReceive(response); task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
