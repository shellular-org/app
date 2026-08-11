import AppKit
import QuartzCore
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

private final class BrowserSidebarDivider: NSView {
    weak var splitView: WorkbenchRootView?
    private var dragging = false
    private var cursorRectsDisabled = false
    private var cursorWasPushed = false
    private weak var cursorWindow: NSWindow?
    private var windowResignObserver: NSObjectProtocol?
    var separatorColor = NSColor.separatorColor {
        didSet { needsDisplay = true }
    }

    override var acceptsFirstResponder: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        separatorColor.setFill()
        NSRect(x: floor(bounds.midX), y: bounds.minY, width: 1, height: bounds.height).fill()
    }

    override func resetCursorRects() {
        addCursorRect(
            BrowserDividerCursorRegion.rect(in: bounds),
            cursor: .resizeLeftRight
        )
    }

    override func mouseDown(with event: NSEvent) {
        guard let splitView else { return }
        if event.clickCount == 2 {
            splitView.resetBrowserSidebarWidth()
            return
        }
        dragging = true
        beginCursorSession()
        splitView.beginBrowserSidebarResize()
    }

    override func mouseDragged(with event: NSEvent) {
        guard dragging, let splitView else { return }
        NSCursor.resizeLeftRight.set()
        let point = splitView.convert(event.locationInWindow, from: nil)
        splitView.setBrowserSidebarWidth(splitView.bounds.maxX - point.x)
    }

    override func mouseUp(with event: NSEvent) {
        finishDragging()
    }

    override func cancelOperation(_ sender: Any?) {
        finishDragging()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if dragging, cursorWindow !== window {
            finishDragging()
        }
        stopObservingWindow()
        guard let window else {
            finishDragging()
            return
        }
        windowResignObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didResignKeyNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            self?.finishDragging()
        }
    }

    override func keyDown(with event: NSEvent) {
        guard let splitView else { return super.keyDown(with: event) }
        let delta: CGFloat
        switch event.keyCode {
        case 123: delta = 10
        case 124: delta = -10
        default: return super.keyDown(with: event)
        }
        splitView.setBrowserSidebarWidth(splitView.browserSidebarWidth + delta)
        splitView.persistBrowserSidebarWidth()
    }

    deinit {
        stopObservingWindow()
        endCursorSession()
    }

    private func beginCursorSession() {
        guard !cursorWasPushed else { return }
        cursorWindow = window
        if let cursorWindow {
            cursorWindow.disableCursorRects()
            cursorRectsDisabled = true
        }
        NSCursor.resizeLeftRight.push()
        cursorWasPushed = true
    }

    private func finishDragging() {
        guard dragging else {
            endCursorSession()
            return
        }
        dragging = false
        splitView?.endBrowserSidebarResize()
        endCursorSession()
    }

    private func endCursorSession() {
        if cursorWasPushed {
            NSCursor.pop()
            cursorWasPushed = false
        }
        if cursorRectsDisabled {
            cursorWindow?.enableCursorRects()
            cursorRectsDisabled = false
        }
        if let cursorWindow {
            cursorWindow.invalidateCursorRects(for: self)
        }
        cursorWindow = nil
    }

    private func stopObservingWindow() {
        guard let windowResignObserver else { return }
        NotificationCenter.default.removeObserver(windowResignObserver)
        self.windowResignObserver = nil
    }
}

private final class WorkbenchRootView: NSView {
    let workbenchHostView = NSView()
    let browserSidebarHostView = NSView()
    private let workbenchResizeUnderlay = BrowserResizeUnderlayView()
    private let browserResizeUnderlay = BrowserResizeUnderlayView()
    private let browserSidebarDivider = BrowserSidebarDivider()
    private let browserSidebarWidthStore: BrowserSidebarWidthStore
    private weak var workbenchContentView: NSView?
    private weak var browserSidebarContentView: NSView?
    private var resizeLifecycle = BrowserResizeLifecycle()
    private(set) var browserSidebarVisible = false
    private(set) var browserSidebarWidth: CGFloat
    var backgroundColor = NSColor.windowBackgroundColor {
        didSet {
            needsDisplay = true
            updateResizeUnderlays()
        }
    }
    var chromeBackgroundColor = NSColor.windowBackgroundColor {
        didSet { updateResizeUnderlays() }
    }
    var browserSeparatorColor = NSColor.separatorColor {
        didSet { browserSidebarDivider.separatorColor = browserSeparatorColor }
    }
    var onLiveResizeChange: ((Bool) -> Void)?
    var onWorkbenchLayout: (() -> Void)?

    override init(frame frameRect: NSRect) {
        let widthStore = BrowserSidebarWidthStore()
        browserSidebarWidthStore = widthStore
        browserSidebarWidth = widthStore.load()
        super.init(frame: frameRect)
        browserSidebarDivider.splitView = self
        browserSidebarDivider.wantsLayer = true
        browserSidebarDivider.setAccessibilityRole(.splitter)
        browserSidebarDivider.setAccessibilityLabel("Resize browser sidebar")
        browserSidebarHostView.isHidden = true
        workbenchHostView.wantsLayer = true
        browserSidebarHostView.wantsLayer = true
        layerContentsRedrawPolicy = .duringViewResize
        workbenchHostView.layerContentsRedrawPolicy = .duringViewResize
        browserSidebarHostView.layerContentsRedrawPolicy = .duringViewResize
        workbenchHostView.layer?.masksToBounds = true
        browserSidebarHostView.layer?.masksToBounds = true
        workbenchResizeUnderlay.autoresizingMask = [.width, .height]
        browserResizeUnderlay.autoresizingMask = [.width, .height]
        workbenchHostView.addSubview(workbenchResizeUnderlay)
        browserSidebarHostView.addSubview(browserResizeUnderlay)
        updateResizeUnderlays()
        addSubview(workbenchHostView)
        addSubview(browserSidebarHostView)
        addSubview(browserSidebarDivider)
        browserSidebarDivider.isHidden = true
    }

    required init?(coder: NSCoder) { fatalError() }

    override var wantsUpdateLayer: Bool { true }

    override func updateLayer() {
        layer?.backgroundColor = backgroundColor.cgColor
        workbenchHostView.layer?.backgroundColor = backgroundColor.cgColor
        browserSidebarHostView.layer?.backgroundColor = backgroundColor.cgColor
        updateResizeUnderlays()
    }

    override func viewWillStartLiveResize() {
        super.viewWillStartLiveResize()
        notifyResizeStarted(.window)
    }

    override func viewDidEndLiveResize() {
        super.viewDidEndLiveResize()
        needsLayout = true
        layoutSubtreeIfNeeded()
        notifyResizeEnded(.window)
    }

    override func layout() {
        super.layout()
        let frames = BrowserSidebarMetrics.layout(
            in: bounds,
            preferredWidth: browserSidebarWidth,
            isVisible: browserSidebarVisible
        )
        browserSidebarWidth = frames.sidebarFrame.width
        let previousDividerFrame = browserSidebarDivider.frame
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        workbenchHostView.frame = frames.workbenchFrame
        browserSidebarHostView.frame = frames.sidebarFrame
        browserSidebarDivider.frame = frames.dividerFrame
        workbenchResizeUnderlay.frame = workbenchHostView.bounds
        browserResizeUnderlay.frame = browserSidebarHostView.bounds
        workbenchResizeUnderlay.layoutSubtreeIfNeeded()
        browserResizeUnderlay.layoutSubtreeIfNeeded()
        if let workbenchContentView {
            // The controller registers its WebView before the first root
            // layout, when this host can still be zero-width. Retrying the
            // attachment here completes that deferred startup safely.
            BrowserViewAttachment.attach(workbenchContentView, to: workbenchHostView)
        }
        BrowserViewAttachment.synchronize(browserSidebarContentView, with: browserSidebarHostView)
        CATransaction.commit()
        if inLiveResize { window?.viewsNeedDisplay = true }
        onWorkbenchLayout?()
        if previousDividerFrame != frames.dividerFrame, let window {
            window.invalidateCursorRects(for: browserSidebarDivider)
        }
    }

    func attachWorkbenchContent(_ content: NSView) {
        workbenchContentView = content
        if !BrowserViewAttachment.attach(content, to: workbenchHostView) {
            needsLayout = true
            layoutSubtreeIfNeeded()
        }
    }

    func showBrowserSidebar(_ content: NSView) {
        browserSidebarContentView = content
        browserSidebarVisible = true
        browserSidebarHostView.isHidden = false
        browserSidebarDivider.isHidden = false
        needsLayout = true
        layoutSubtreeIfNeeded()
        BrowserViewAttachment.attach(content, to: browserSidebarHostView)
        content.layoutSubtreeIfNeeded()
        window?.invalidateCursorRects(for: browserSidebarDivider)
    }

    func hideBrowserSidebar() {
        browserSidebarVisible = false
        browserSidebarHostView.isHidden = true
        browserSidebarDivider.isHidden = true
        needsLayout = true
        layoutSubtreeIfNeeded()
        window?.invalidateCursorRects(for: browserSidebarDivider)
    }

    func setBrowserSidebarWidth(_ value: CGFloat) {
        browserSidebarWidth = clampedBrowserSidebarWidth(value)
        needsLayout = true
        layoutSubtreeIfNeeded()
    }

    func resetBrowserSidebarWidth() {
        setBrowserSidebarWidth(BrowserSidebarMetrics.defaultWidth)
        persistBrowserSidebarWidth()
    }

    func beginBrowserSidebarResize() {
        notifyResizeStarted(.sidebar)
    }

    func endBrowserSidebarResize() {
        persistBrowserSidebarWidth()
        needsLayout = true
        layoutSubtreeIfNeeded()
        notifyResizeEnded(.sidebar)
    }

    func persistBrowserSidebarWidth() {
        browserSidebarWidthStore.save(browserSidebarWidth)
    }

    var workbenchBounds: NSRect { workbenchHostView.bounds }

    private func clampedBrowserSidebarWidth(_ value: CGFloat) -> CGFloat {
        BrowserSidebarMetrics.clampedWidth(value, containerWidth: bounds.width)
    }

    private func updateResizeUnderlays() {
        workbenchResizeUnderlay.apply(content: backgroundColor, chrome: chromeBackgroundColor)
        browserResizeUnderlay.apply(content: backgroundColor, chrome: chromeBackgroundColor)
    }

    private func notifyResizeStarted(_ source: BrowserResizeSource) {
        if resizeLifecycle.begin(source) {
            onLiveResizeChange?(true)
        }
    }

    private func notifyResizeEnded(_ source: BrowserResizeSource) {
        if resizeLifecycle.end(source) {
            onLiveResizeChange?(false)
        }
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
        BrowserLiveResizePolicy.apply(to: nextWindow, views: [titlebarHostView])

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
        guard let rootView = view as? WorkbenchRootView else { return }
        rootView.onWorkbenchLayout = { [weak self] in
            guard let self, let window = self.view.window else { return }
            self.layoutTitlebarDragRegion(in: window)
        }
        let workbenchHost = rootView.workbenchHostView
        webView = ShellularWorkbenchWebView(frame: workbenchHost.bounds, configuration: configuration)
        webView.navigationDelegate = self; webView.uiDelegate = self; webView.isInspectable = true
        webView.underPageBackgroundColor = (view as? WorkbenchRootView)?.backgroundColor
        rootView.attachWorkbenchContent(webView)
        titlebarDragView.autoresizingMask = [.width, .minYMargin]
        workbenchHost.addSubview(titlebarDragView, positioned: .above, relativeTo: webView)
        errorLabel.alignment = .center; errorLabel.maximumNumberOfLines = 4; errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false; workbenchHost.addSubview(errorLabel)
        NSLayoutConstraint.activate([errorLabel.centerXAnchor.constraint(equalTo: workbenchHost.centerXAnchor), errorLabel.centerYAnchor.constraint(equalTo: workbenchHost.centerYAnchor), errorLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 620)])
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
        view.needsLayout = true
        view.layoutSubtreeIfNeeded()
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
        layoutTitlebarDragRegion(in: window)
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
        let workbenchBounds = (view as? WorkbenchRootView)?.workbenchBounds ?? view.bounds
        let frame = TitlebarDragRegion.frame(
            in: workbenchBounds,
            trafficLightTrailingEdge: trailingTrafficLightEdge,
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
        let palette = BrowserChromePalette(theme)
        guard let rootView = view as? WorkbenchRootView else { return }
        rootView.backgroundColor = palette.primary
        rootView.chromeBackgroundColor = palette.chromeBackground
        rootView.browserSeparatorColor = palette.separator
        webView?.underPageBackgroundColor = palette.primary
        view.window?.backgroundColor = palette.primary
    }
    func setWindowTitle(_ rawTitle: String) {
        let cleaned = rawTitle.unicodeScalars
            .filter { !CharacterSet.controlCharacters.contains($0) }
            .prefix(160)
        let title = String(cleaned.map { Character($0) }).trimmingCharacters(in: .whitespacesAndNewlines)
        pendingWindowTitle = title.isEmpty ? "Home" : title
        view.window?.title = pendingWindowTitle
    }

    func showBrowserSidebar(_ browserView: NSView) {
        guard let rootView = view as? WorkbenchRootView else { return }
        rootView.showBrowserSidebar(browserView)
        view.needsLayout = true
    }

    func hideBrowserSidebar() {
        (view as? WorkbenchRootView)?.hideBrowserSidebar()
        view.needsLayout = true
    }

    var isBrowserSidebarVisible: Bool {
        (view as? WorkbenchRootView)?.browserSidebarVisible ?? false
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorLabel.isHidden = true
    }
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
