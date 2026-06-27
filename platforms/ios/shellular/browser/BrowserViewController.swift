import UIKit
import WebKit
import SafariServices

final class BrowserViewController: UIViewController {

    // MARK: - Configuration

    struct Config {
        let url: String?
        let theme: [String: String]
        let mode: String          // "devtools" | "auth"
        let callbackScheme: String?
        let htmlContent: String?
    }

    var config: Config!
    var onAuthResult: ((String) -> Void)?
    var onDismiss: (() -> Void)?
    weak var mainWebView: WKWebView?

    // MARK: - UI

    private var webView: WKWebView!
    private var urlField: UITextField!
    private var faviconView: UIImageView!
    private var loadingIndicator: UIActivityIndicatorView!
    private var emulatorContainer: UIView?
    private var titleBarView: UIView!

    private var isConsoleVisible = false
    private var consoleButton: UIButton?
    private var isEmulatorActive = false
    private var isDesktopMode = false
    private var isLoadingShellularContent = false
    private var isMinimized = false
    private var activeProxyPorts: Set<Int> = []

    private var currentURL: String = ""
    private var currentTitle: String = "Browser"

    // Bottom toolbar
    private var bottomToolbar: UIView?
    private var bottomToolbarHeightConstraint: NSLayoutConstraint?

    // Device emulator state
    private var selectedDevice: DevicePreset?
    private var webViewWidthConstraint: NSLayoutConstraint?
    private var webViewHeightConstraint: NSLayoutConstraint?
    private var webViewLeadingConstraint: NSLayoutConstraint?
    private var webViewTrailingConstraint: NSLayoutConstraint?
    private var webViewBottomConstraint: NSLayoutConstraint?
    private var webViewTopConstraint: NSLayoutConstraint?
    private var webViewCenterXConstraint: NSLayoutConstraint?
    private var menuButton: UIButton?
    private var backButton: UIButton?
    private var forwardButton: UIButton?
    private var pageBridgeHandler: PageBridgeHandler?
    private var portBridgeHandler: PortBridgeHandler?

    // Device presets matching Android
    struct DevicePreset {
        let name: String
        let width: Int
        let height: Int
        let isMobile: Bool

        static let presets: [DevicePreset] = [
            DevicePreset(name: "iPhone SE",   width: 320,  height: 568,  isMobile: true),
            DevicePreset(name: "iPhone 8",    width: 375,  height: 667,  isMobile: true),
            DevicePreset(name: "iPhone 8+",   width: 414,  height: 736,  isMobile: true),
            DevicePreset(name: "iPhone X",    width: 375,  height: 812,  isMobile: true),
            DevicePreset(name: "iPad",        width: 768,  height: 1024, isMobile: true),
            DevicePreset(name: "iPad Pro",    width: 1024, height: 1366, isMobile: true),
            DevicePreset(name: "Galaxy S5",   width: 360,  height: 640,  isMobile: true),
            DevicePreset(name: "Pixel 2",     width: 411,  height: 731,  isMobile: true),
            DevicePreset(name: "Pixel 2 XL",  width: 411,  height: 823,  isMobile: true),
            DevicePreset(name: "Nexus 5X",    width: 411,  height: 731,  isMobile: true),
            DevicePreset(name: "Nexus 7",     width: 600,  height: 960,  isMobile: true),
            DevicePreset(name: "Nexus 10",    width: 800,  height: 1280, isMobile: true),
            DevicePreset(name: "Laptop",      width: 1280, height: 800,  isMobile: false),
            DevicePreset(name: "Laptop L",    width: 1440, height: 900,  isMobile: false),
            DevicePreset(name: "4K",          width: 3840, height: 2160, isMobile: false),
        ]
    }

    // MARK: - Theme helpers

    private var primaryColor: UIColor { UIColor(hexString: config.theme["primary"] ?? "#1e1e23") ?? .black }
    private var primaryTextColor: UIColor { UIColor(hexString: config.theme["primaryText"] ?? "#ffffff") ?? .white }
    private var activeColor: UIColor { UIColor(hexString: config.theme["primaryActiveText"] ?? config.theme["link"] ?? config.theme["primaryText"] ?? "#4fc3f7") ?? .systemBlue }
    private var themeType: String { config.theme["type"] ?? "dark" }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = primaryColor
        setupTitleBar()
        setupBottomToolbar()
        setupWebView()
        if let html = config.htmlContent {
            loadHTML(html)
        } else if let url = config.url {
            loadURL(url)
        } else {
            loadURL("shellular://home")
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
    }

    private func close() {
        for port in activeProxyPorts {
            EmbeddedProxyServer.shared.stopServer(port: port)
        }
        EmbeddedProxyServer.shared.cancelAllPending()
        activeProxyPorts.removeAll()

        hide(animated: true) {
            if let handler = self.pageBridgeHandler {
                self.mainWebView?.configuration.userContentController.removeScriptMessageHandler(forName: "shellularPageBridge")
                self.pageBridgeHandler = nil
            }
            if let handler = self.portBridgeHandler {
                self.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "shellularEnsurePort")
                self.portBridgeHandler = nil
            }
            self.willMove(toParent: nil)
            self.removeFromParent()
            self.onDismiss?()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        themeType == "light" ? .darkContent : .lightContent
    }

    // MARK: - Title Bar

    private func setupTitleBar() {
        let bar = UIView()
        bar.backgroundColor = primaryColor
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        titleBarView = bar

        let iconSize: CGFloat = 22

        // Favicon
        faviconView = UIImageView(image: IconFont.image(code: IconFont.code("globe"), size: iconSize, color: primaryTextColor))
        faviconView.contentMode = .scaleAspectFit
        faviconView.translatesAutoresizingMaskIntoConstraints = false

        // Loading
        loadingIndicator = UIActivityIndicatorView(style: .medium)
        loadingIndicator.color = primaryTextColor
        loadingIndicator.hidesWhenStopped = true
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false

        // URL field
        urlField = UITextField()
        urlField.text = config.url
        urlField.textColor = primaryTextColor
        urlField.font = .systemFont(ofSize: 14)
        urlField.backgroundColor = themeType == "light" ? UIColor.black.withAlphaComponent(0.07) : UIColor.white.withAlphaComponent(0.07)
        urlField.layer.cornerRadius = 16
        urlField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        urlField.leftViewMode = .always
        urlField.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        urlField.rightViewMode = .always
        urlField.returnKeyType = .go
        urlField.keyboardType = .URL
        urlField.autocapitalizationType = .none
        urlField.autocorrectionType = .no
        urlField.delegate = self
        urlField.translatesAutoresizingMaskIntoConstraints = false

        // Menu
        let menuBtn = makeIconButton(IconFont.code("more-vertical"), size: iconSize)
        menuBtn.showsMenuAsPrimaryAction = true
        menuBtn.menu = buildMenu()
        menuButton = menuBtn

        let stack = UIStackView(arrangedSubviews: [faviconView, loadingIndicator, urlField, menuBtn])
        stack.axis = .horizontal
        stack.spacing = 6
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(stack)

        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 96), // 52 bar + safe area

            stack.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -8),
            stack.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: -6),
            stack.heightAnchor.constraint(equalToConstant: 40),

            faviconView.widthAnchor.constraint(equalToConstant: 28),
            faviconView.heightAnchor.constraint(equalToConstant: 28),
            urlField.heightAnchor.constraint(equalToConstant: 32),
            menuBtn.widthAnchor.constraint(equalToConstant: 32),
        ])
    }

    // MARK: - Bottom Toolbar

    private func setupBottomToolbar() {
        let bar = UIView()
        bar.backgroundColor = primaryColor
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        bottomToolbar = bar

        let iconSize: CGFloat = 22

        // Minimize
        let minimizeBtn = makeIconButton(IconFont.code("chevron-down"), size: iconSize)
        minimizeBtn.addTarget(self, action: #selector(minimizeTapped), for: .touchUpInside)

        // Back
        let backBtn = makeIconButton(IconFont.code("chevron-left"), size: iconSize)
        backBtn.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        backButton = backBtn

        // Forward
        let forwardBtn = makeIconButton(IconFont.code("chevron-right"), size: iconSize)
        forwardBtn.addTarget(self, action: #selector(forwardTapped), for: .touchUpInside)
        forwardButton = forwardBtn

        // Home
        let homeBtn = makeIconButton(IconFont.code("home"), size: iconSize)
        homeBtn.addTarget(self, action: #selector(homeTapped), for: .touchUpInside)

        // Refresh
        let refreshBtn = makeIconButton(IconFont.code("refresh-cw"), size: iconSize)
        refreshBtn.addTarget(self, action: #selector(refreshTapped), for: .touchUpInside)

        // Console
        let consoleBtn = makeIconButton(IconFont.code("terminal"), size: iconSize)
        consoleBtn.addTarget(self, action: #selector(consoleTapped), for: .touchUpInside)
        consoleButton = consoleBtn

        let touchPad: CGFloat = 11
        for btn in [minimizeBtn, backBtn, forwardBtn, homeBtn, refreshBtn, consoleBtn] {
            btn.contentEdgeInsets = UIEdgeInsets(top: touchPad, left: touchPad, bottom: touchPad, right: touchPad)
        }

        let stack = UIStackView(arrangedSubviews: [minimizeBtn, backBtn, forwardBtn, homeBtn, refreshBtn, consoleBtn])
        stack.axis = .horizontal
        stack.distribution = .equalCentering
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(stack)

        let toolbarHeight: CGFloat = 50
        bottomToolbarHeightConstraint = bar.heightAnchor.constraint(equalToConstant: toolbarHeight)
        bottomToolbarHeightConstraint?.priority = .defaultHigh

        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            bar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            bottomToolbarHeightConstraint!,

            stack.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
            stack.topAnchor.constraint(equalTo: bar.topAnchor),
            stack.bottomAnchor.constraint(equalTo: bar.bottomAnchor),
        ])
        updateConsoleButton()
    }

    // MARK: - WebView

    private func setupWebView() {
        let wkConfig = WKWebViewConfiguration()
        wkConfig.preferences.javaScriptCanOpenWindowsAutomatically = true
        wkConfig.defaultWebpagePreferences.allowsContentJavaScript = true

        // Serve bundled assets (icon font etc.) for shellular://assets/* requests
        wkConfig.setURLSchemeHandler(ShellularURLSchemeHandler(), forURLScheme: "shellular")

        // Register message handler for auto-starting proxy servers on new ports
        let portHandler = PortBridgeHandler()
        portHandler.controller = self
        portBridgeHandler = portHandler
        wkConfig.userContentController.add(portHandler, name: "shellularEnsurePort")

        // Inject localhost API hooks at document start so they're ready before any page JS runs
        injectLocalhostHooks(into: wkConfig.userContentController)

        webView = WKWebView(frame: .zero, configuration: wkConfig)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        // White backdrop so external pages without an explicit background render like
        // a normal browser (readable dark text). Internal shellular:// pages set their
        // own opaque dark background, so they keep the dark theme.
        webView.backgroundColor = .white
        webView.scrollView.backgroundColor = .white
        view.addSubview(webView)

        webViewTopConstraint = webView.topAnchor.constraint(equalTo: view.topAnchor, constant: 96)
        webViewLeadingConstraint = webView.leadingAnchor.constraint(equalTo: view.leadingAnchor)
        webViewTrailingConstraint = webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        webViewBottomConstraint = webView.bottomAnchor.constraint(equalTo: bottomToolbar!.topAnchor)

        NSLayoutConstraint.activate([
            webViewTopConstraint!,
            webViewLeadingConstraint!,
            webViewTrailingConstraint!,
            webViewBottomConstraint!,
        ])
    }

    private func injectLocalhostHooks(into controller: WKUserContentController) {
        let script = """
        (function(){
          if(window.__shellularHooksInjected)return;
          window.__shellularHooksInjected=true;
          function es(u){
            try{
              var p=new URL(u,location.href);
              var h=p.hostname;
              if(h!=='localhost'&&h!=='127.0.0.1')return;
              var pt=p.port||(p.protocol==='https:'?'443':'80');
              window.webkit&&window.webkit.messageHandlers.shellularEnsurePort&&
                window.webkit.messageHandlers.shellularEnsurePort.postMessage({port:parseInt(pt)});
            }catch(e){}
          }
          var _f=window.fetch;
          window.fetch=function(i,o){
            var u=typeof i==='string'?i:(i&&i.url);
            if(u)es(u);
            return _f.apply(this,arguments);
          };
          var _o=XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open=function(m,u){
            es(u);
            return _o.apply(this,arguments);
          };
          var _ES=window.EventSource;
          if(_ES){
            window.EventSource=function(u,c){
              es(u);
              return new _ES(u,c);
            };
            window.EventSource.prototype=_ES.prototype;
            window.EventSource.CONNECTING=_ES.CONNECTING;
            window.EventSource.OPEN=_ES.OPEN;
            window.EventSource.CLOSED=_ES.CLOSED;
          }
          var _WS=window.WebSocket;
          if(_WS){
            window.WebSocket=function(u,p){
              es(u);
              return new _WS(u,p);
            };
            window.WebSocket.prototype=_WS.prototype;
            window.WebSocket.CONNECTING=_WS.CONNECTING;
            window.WebSocket.OPEN=_WS.OPEN;
            window.WebSocket.CLOSING=_WS.CLOSING;
            window.WebSocket.CLOSED=_WS.CLOSED;
          }
        })();
        """
        let userScript = WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        controller.addUserScript(userScript)
    }

    func setUrl(_ urlString: String) {
        loadURL(urlString)
    }

    private func loadURL(_ urlString: String) {
        var str = urlString

        menuButton?.isHidden = str.hasPrefix("shellular://")

        // Handle shellular:// pages
        if str.hasPrefix("shellular://") {
            if let pageName = URL(string: str)?.host, pageName != "auth-callback" {
                loadShellularPage(pageName)
                return
            }
        }

        if !str.hasPrefix("http://") && !str.hasPrefix("https://") {
            str = "https://" + str
        }
        currentURL = str

        guard let url = URL(string: str) else { return }
        webView.load(URLRequest(url: url))
        updateConsoleButton()
    }

    private func loadShellularPage(_ pageName: String) {
        currentURL = "shellular://\(pageName)"
        currentTitle = pageName.prefix(1).uppercased() + pageName.dropFirst()
        urlField?.text = currentURL
        loadingIndicator?.startAnimating()
        updateConsoleButton()

        // Set page-specific favicon immediately
        let faviconCode: String
        switch pageName {
        case "home":  faviconCode = IconFont.code("shellular")
        case "ports": faviconCode = IconFont.code("shellular")
        default:      faviconCode = IconFont.code("globe")
        }
        faviconView.image = IconFont.image(code: faviconCode, size: 22, color: primaryTextColor)

        // Register a one-time script message handler on the main WebView so
        // the async __shellularPage Promise can call back with the HTML.
        if pageBridgeHandler == nil, let mwv = mainWebView {
            let handler = PageBridgeHandler()
            handler.controller = self
            pageBridgeHandler = handler
            mwv.configuration.userContentController.add(handler, name: "shellularPageBridge")
        }

        let escaped = pageName.replacingOccurrences(of: "'", with: "\\'")
        let js = """
        (function(n){
          var r=window.__shellularPage&&window.__shellularPage(n);
          if(r&&typeof r.then==='function')
            r.then(function(h){webkit.messageHandlers.shellularPageBridge.postMessage({page:n,html:h})});
          else if(r)
            webkit.messageHandlers.shellularPageBridge.postMessage({page:n,html:r});
        })('\(escaped)');
        """
        mainWebView?.evaluateJavaScript(js, completionHandler: nil)
    }

    func receivePageResult(pageName: String, html: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.loadingIndicator?.stopAnimating()
            self.isLoadingShellularContent = true
            self.webView.loadHTMLString(html, baseURL: URL(string: "shellular://\(pageName)"))
        }
    }

    func setHtml(_ html: String) {
        loadHTML(html)
    }

    private func loadHTML(_ html: String) {
        currentURL = ""
        urlField?.text = ""
        webView.loadHTMLString(html, baseURL: nil)
        updateConsoleButton()
    }

    // MARK: - Menu

    private func buildMenu() -> UIMenu {
        // Device presets submenu
        var deviceActions: [UIAction] = []
        let resetAction = UIAction(
            title: "Reset",
            image: IconFont.image(code: IconFont.code("smartphone"), size: 16, color: primaryTextColor),
            state: selectedDevice == nil ? .on : .off
        ) { [weak self] _ in
            self?.selectDevice(nil)
        }
        deviceActions.append(resetAction)

        for preset in DevicePreset.presets {
            let icon: String
            if preset.width >= 1280 { icon = IconFont.code("monitor") }
            else if preset.width >= 600 { icon = IconFont.code("sidebar") }
            else { icon = IconFont.code("smartphone") }

            let action = UIAction(
                title: "\(preset.name) (\(preset.width)x\(preset.height))",
                image: IconFont.image(code: icon, size: 16, color: primaryTextColor),
                state: selectedDevice?.name == preset.name ? .on : .off
            ) { [weak self] _ in
                self?.selectDevice(preset)
            }
            deviceActions.append(action)
        }

        let devicesMenu = UIMenu(title: "Devices", image: IconFont.image(code: IconFont.code("monitor"), size: 18, color: primaryTextColor), children: deviceActions)

        let cacheAction = UIAction(title: "Disable Cache", image: IconFont.image(code: IconFont.code("refresh-cw"), size: 18, color: primaryTextColor)) { [weak self] _ in
            // Toggle via reload ignoring cache
            self?.webView.reloadFromOrigin()
        }
        let externalAction = UIAction(title: "Open in Safari", image: IconFont.image(code: IconFont.code("external-link"), size: 18, color: primaryTextColor)) { [weak self] _ in
            guard let self, let url = URL(string: self.currentURL) else { return }
            UIApplication.shared.open(url)
        }
        let exitAction = UIAction(title: "Exit", image: IconFont.image(code: IconFont.code("x"), size: 18, color: primaryTextColor), attributes: .destructive) { [weak self] _ in
            self?.close()
        }

        return UIMenu(children: [devicesMenu, cacheAction, externalAction, exitAction])
    }

    private func refreshMenu() {
        menuButton?.menu = buildMenu()
    }

    @objc private func consoleTapped() {
        toggleConsole()
    }

    private func updateConsoleButton() {
        guard let btn = consoleButton else { return }
        let isShellPage = currentURL.hasPrefix("shellular://home") || currentURL.hasPrefix("shellular://ports")
        let enabled = !isEmulatorActive && !isShellPage
        btn.isEnabled = enabled
        btn.alpha = enabled ? 1 : 0.3
        let tintColor = isConsoleVisible ? activeColor : primaryTextColor
        btn.setImage(IconFont.image(code: IconFont.code("terminal"), size: 22, color: tintColor)?.withRenderingMode(.alwaysOriginal), for: .normal)
    }

    // MARK: - Actions

    @objc private func backTapped() {
        if !goBack() {
            close()
        }
    }

    @objc private func forwardTapped() {
        if webView.canGoForward {
            webView.goForward()
        }
    }

    private func updateNavigationButtons() {
        forwardButton?.isEnabled = webView.canGoForward
        forwardButton?.alpha = webView.canGoForward ? 1 : 0.3
    }

    @objc private func homeTapped() {
        loadURL("shellular://home")
    }

    @objc private func refreshTapped() {
        webView.reload()
    }

    @objc private func minimizeTapped() {
        setMinimized(true)
    }

    // MARK: - Show / Hide / Minimize / Restore

    func present(animated: Bool) {
        guard let superview = parent?.view else { return }
        superview.addSubview(view)
        view.frame = superview.bounds
        if animated {
            view.transform = CGAffineTransform(translationX: 0, y: view.bounds.height)
            view.alpha = 0
            UIView.animate(withDuration: 0.3, delay: 0, options: .curveEaseOut) {
                self.view.transform = .identity
                self.view.alpha = 1
            }
        }
    }

    func hide(animated: Bool, completion: (() -> Void)? = nil) {
        if animated {
            UIView.animate(withDuration: 0.3, delay: 0, options: .curveEaseIn, animations: {
                self.view.transform = CGAffineTransform(translationX: 0, y: self.view.bounds.height)
                self.view.alpha = 0
            }) { _ in
                self.view.transform = .identity
                self.view.alpha = 1
                self.view.removeFromSuperview()
                completion?()
            }
        } else {
            view.removeFromSuperview()
            completion?()
        }
    }

    func setMinimized(_ minimized: Bool) {
        isMinimized = minimized
        if minimized {
            hide(animated: true)
        } else {
            present(animated: true)
        }
    }

    func restoreBrowser(url: String? = nil) {
        setMinimized(false)
        if let url {
            loadURL(url)
        }
    }

    var minimized: Bool { isMinimized }

    private func toggleConsole() {
        isConsoleVisible.toggle()
        let event = isConsoleVisible ? "showconsole" : "hideconsole"
        webView.evaluateJavaScript("if(window.eruda){document.dispatchEvent(new CustomEvent('\(event)'));}", completionHandler: nil)
        updateConsoleButton()
    }

    private func selectDevice(_ device: DevicePreset?) {
        selectedDevice = device

        // Deactivate all emulator-specific constraints
        webViewWidthConstraint?.isActive = false
        webViewHeightConstraint?.isActive = false
        webViewCenterXConstraint?.isActive = false
        webViewWidthConstraint = nil
        webViewHeightConstraint = nil
        webViewCenterXConstraint = nil

        // Reset transform
        webView.transform = .identity
        webView.clipsToBounds = true

        if let device {
            isDesktopMode = !device.isMobile
            isEmulatorActive = true

            // Set user agent
            let ua = device.isMobile
                ? ""
                : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
            webView.customUserAgent = ua.isEmpty ? nil : ua

            // Calculate scale to fit device dimensions in available space
            let availableWidth = view.bounds.width
            let availableHeight = view.bounds.height - 96 - 50 // minus title bar + bottom toolbar
            let deviceW = CGFloat(device.width)
            let deviceH = CGFloat(device.height)

            let scaleX = availableWidth / deviceW
            let scaleY = availableHeight / deviceH
            let scale = min(scaleX, scaleY, 1.0) // don't upscale

            // The scaled visual height
            let scaledH = deviceH * scale

            // Detach edge constraints
            webViewLeadingConstraint?.isActive = false
            webViewTrailingConstraint?.isActive = false
            webViewBottomConstraint?.isActive = false

            // Set fixed size at native device resolution
            webViewWidthConstraint = webView.widthAnchor.constraint(equalToConstant: deviceW)
            webViewHeightConstraint = webView.heightAnchor.constraint(equalToConstant: deviceH)
            webViewCenterXConstraint = webView.centerXAnchor.constraint(equalTo: view.centerXAnchor)
            webViewWidthConstraint?.isActive = true
            webViewHeightConstraint?.isActive = true
            webViewCenterXConstraint?.isActive = true

            // Apply scale transform; anchor to top-center so it doesn't drift
            if scale < 1.0 {
                // Offset the anchor point so the top of the scaled view aligns with the top constraint
                let yOffset = (deviceH - scaledH) / 2.0
                webView.transform = CGAffineTransform(scaleX: scale, y: scale)
                    .translatedBy(x: 0, y: -yOffset / scale)
            }

            // Inject viewport meta (disable user scaling to prevent pinch-zoom cropping)
            updateViewportDimension(width: device.width, height: device.height)
        } else {
            isDesktopMode = false
            isEmulatorActive = false
            webView.customUserAgent = nil

            // Restore full-screen constraints
            webViewLeadingConstraint?.isActive = true
            webViewTrailingConstraint?.isActive = true
            webViewBottomConstraint?.isActive = true

            // Reset viewport
            let resetScript = """
            !function(){var m=document.querySelector('meta[name=viewport][data-emulated]');if(m)m.remove();}();
            """
            webView.evaluateJavaScript(resetScript, completionHandler: nil)
        }

        view.setNeedsLayout()
        view.layoutIfNeeded()
        webView.reload()
        updateConsoleButton()
        refreshMenu()
    }

    private func updateViewportDimension(width: Int, height: Int) {
        let script = """
        !function(){
          var e=document.head;
          if(e){
            e.querySelectorAll('meta[name=viewport][data-emulated]').forEach(function(e){e.remove()});
            var t=document.createElement('meta');
            t.name='viewport';
            t.setAttribute('data-emulated','true');
            t.content='width=\(width), height=\(height), initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            e.append(t);
          }
        }();
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func goBack() -> Bool {
        if isConsoleVisible {
            toggleConsole()
            return true
        }
        if webView.canGoBack {
            webView.goBack()
            return true
        }
        return false
    }

    // MARK: - Eruda Injection

    private func injectErudaEarly() {
        let rawURL = webView.url?.absoluteString ?? ""
        guard !rawURL.isEmpty && rawURL != "about:blank" && !rawURL.hasPrefix("shellular://") else { return }
        // Check using a window-scoped flag — resets on every navigation, unlike sessionStorage
        webView.evaluateJavaScript("window.__erudaInitialized") { [weak self] result, _ in
            guard let self else { return }
            if let val = result as? Bool, val { return }
            let show = self.isConsoleVisible ? "eruda.show();" : ""
            let inSubfolder = Bundle.main.bundleURL.appendingPathComponent("bundle/console.js")
            let inRoot      = Bundle.main.bundleURL.appendingPathComponent("console.js")
            let bundleURL   = FileManager.default.fileExists(atPath: inSubfolder.path) ? inSubfolder : inRoot

            if !FileManager.default.fileExists(atPath: bundleURL.path) {
                NSLog("[CONSOLE] console.js not found in bundle at expected path: \(bundleURL.path)")
                return
            }

            guard let content = try? String(contentsOf: bundleURL, encoding: .utf8) else { return }
            
            let source = """
            (function(){
              if(window.__erudaInitialized)return;
              \(content)
              if(!window.eruda)return;
              window.__erudaInitialized=true;
              eruda.init({theme:'dark'});
              eruda._shadowRoot.querySelector('.eruda-entry-btn').style.display='none';
              document.addEventListener('showconsole',function(){eruda.show();});
              document.addEventListener('hideconsole',function(){eruda.hide();});
              \(show)
            })();
            """
            self.webView.evaluateJavaScript(source, completionHandler: nil)
        }
    }

    // MARK: - Helpers

    private func ensureProxyServer(for url: URL) {
        guard let host = url.host, (host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0") else { return }
        let port = url.port ?? (url.scheme == "https" ? 443 : 80)
        if activeProxyPorts.contains(port) { return }
        guard let mwv = mainWebView else { return }

        let ok = EmbeddedProxyServer.shared.startServer(port: port, webView: mwv)
        if ok {
            activeProxyPorts.insert(port)
        }
    }

    /// Called from JS bridge when JS detects a cross-port localhost request
    func ensurePort(_ port: Int) {
        guard !activeProxyPorts.contains(port) else { return }
        guard let mwv = mainWebView else { return }

        let ok = EmbeddedProxyServer.shared.startServer(port: port, webView: mwv)
        if ok {
            activeProxyPorts.insert(port)
        }
    }

    private func makeIconButton(_ code: String, size: CGFloat) -> UIButton {
        let btn = UIButton(type: .system)
        btn.setImage(IconFont.image(code: code, size: size, color: primaryTextColor)?.withRenderingMode(.alwaysOriginal), for: .normal)
        btn.translatesAutoresizingMaskIntoConstraints = false
        return btn
    }

}

// MARK: - WKNavigationDelegate

extension BrowserViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }

        if isAuthCallback(url) {
            onAuthResult?(url.absoluteString)
            close()
            return .cancel
        }

        // Intercept shellular:// page navigations
        if url.scheme == "shellular", let pageName = url.host, pageName != "auth-callback" {
            // Allow the loadHTMLString navigation through (it uses shellular:// as baseURL)
            if isLoadingShellularContent {
                isLoadingShellularContent = false
                return .allow
            }
            loadShellularPage(pageName)
            return .cancel
        }

        // Explicitly handle link-activated http/https navigations to keep them in this WebView.
        // Returning .allow for a .linkActivated navigation from a shellular:// (custom-scheme)
        // page causes WebKit to dispatch the URL to the system browser on some iOS versions.
        // Re-loading programmatically changes navigationType to .other on the next call, which
        // passes through to .allow without triggering the cross-scheme system dispatch.
        if let scheme = url.scheme, (scheme == "http" || scheme == "https"),
           navigationAction.navigationType == .linkActivated {
            // Auto-start embedded proxy server for localhost URLs
            ensureProxyServer(for: url)
            webView.load(navigationAction.request)
            return .cancel
        }

        // Auto-start embedded proxy server for non-link-activated localhost navigations
        if let host = url.host, let scheme = url.scheme, (scheme == "http" || scheme == "https"),
           (host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0") {
            ensureProxyServer(for: url)
        }

        return .allow
    }

    private func isAuthCallback(_ url: URL) -> Bool {
        guard url.host == "auth-callback" else { return false }
        return url.scheme == "shellular"
            || url.scheme == "foxbiz"
            || (config.callbackScheme != nil && url.scheme == config.callbackScheme)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loadingIndicator.startAnimating()
        let rawURL = webView.url?.absoluteString ?? ""
        // Update address bar when navigating to any real (non-shellular, non-blank) page,
        // including when leaving a shellular:// page.
        if !rawURL.isEmpty && rawURL != "about:blank" && !rawURL.hasPrefix("shellular://") {
            currentURL = rawURL
            urlField.text = currentURL
            faviconView.image = IconFont.image(code: IconFont.code("globe"), size: 22, color: primaryTextColor)
            menuButton?.isHidden = false
            updateConsoleButton()
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // Inject eruda as early as possible so it captures console/network logs from page startup
        injectErudaEarly()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator.stopAnimating()
        let rawURL = webView.url?.absoluteString ?? ""
        let isRealPage = !rawURL.isEmpty && rawURL != "about:blank" && !rawURL.hasPrefix("shellular://")
        if isRealPage {
            currentURL = rawURL
            currentTitle = webView.title ?? currentURL
            urlField.text = currentTitle
            updateConsoleButton()
        } else if currentURL.hasPrefix("shellular://") {
            urlField.text = currentTitle
        }
        // Report history to the app (skip shellular:// and proxy URLs)
        let pageUrl = currentURL
        if !pageUrl.isEmpty
            && !pageUrl.hasPrefix("shellular://") {
            let escapedUrl = pageUrl.replacingOccurrences(of: "'", with: "\\'")
            let escapedTitle = (currentTitle).replacingOccurrences(of: "'", with: "\\'")
            let origin = URL(string: pageUrl).flatMap { url in
                guard let scheme = url.scheme, let host = url.host else { return nil as String? }
                let port = url.port.map { ":\($0)" } ?? ""
                return "\(scheme)://\(host)\(port)"
            } ?? ""
            let faviconUrl = origin.isEmpty ? "" : "\(origin)/favicon.ico"
            let escapedFavicon = faviconUrl.replacingOccurrences(of: "'", with: "\\'")
            let historyJs = "window.__shellularHistory && window.__shellularHistory({url:'\(escapedUrl)',title:'\(escapedTitle)',favicon:'\(escapedFavicon)'})"
            mainWebView?.evaluateJavaScript(historyJs, completionHandler: nil)

            // Fetch and display the site favicon in the titlebar
            if !origin.isEmpty, let url = URL(string: faviconUrl) {
                let snapshotUrl = pageUrl
                URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
                    guard let self,
                          let data, !data.isEmpty,
                          let image = UIImage(data: data) else { return }
                    DispatchQueue.main.async {
                        if self.currentURL == snapshotUrl {
                            self.faviconView.image = image
                        }
                    }
                }.resume()
            }
        }
        updateNavigationButtons()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadingIndicator.stopAnimating()
    }
}

// MARK: - WKUIDelegate

extension BrowserViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Open target=_blank links in the same webview
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}

// MARK: - UITextFieldDelegate

extension BrowserViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        guard let text = textField.text, !text.isEmpty else { return true }
        loadURL(text)
        textField.resignFirstResponder()
        return true
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        textField.text = currentURL
        DispatchQueue.main.async {
            textField.selectAll(nil)
        }
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
        textField.text = currentTitle
    }
}

// MARK: - PageBridgeHandler

/// Receives async __shellularPage results from the main WKWebView and
/// forwards them to the BrowserViewController to load into the browser WebView.
private final class PageBridgeHandler: NSObject, WKScriptMessageHandler {
    weak var controller: BrowserViewController?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let pageName = body["page"] as? String,
              let html = body["html"] as? String else { return }
        controller?.receivePageResult(pageName: pageName, html: html)
    }
}

// MARK: - PortBridgeHandler

/// Receives ensurePort messages from injected JS hooks to auto-start proxy
/// servers when the page makes cross-port localhost requests.
private final class PortBridgeHandler: NSObject, WKScriptMessageHandler {
    weak var controller: BrowserViewController?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let port = body["port"] as? Int else { return }
        controller?.ensurePort(port)
    }
}
