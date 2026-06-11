import UIKit
import WebKit

final class WebViewController: UIViewController {
    private(set) var webView: WKWebView!
    let bridge = Bridge()
    private(set) var isKeyboardVisible = false
    private var scrollObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(ShellularURLSchemeHandler(), forURLScheme: "shellular")

        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageHandler(bridge), name: "exec")
        config.userContentController = contentController
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        webView = NoAccessoryWKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isInspectable = true
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = false
        webView.backgroundColor = .black
        webView.isOpaque = false

        view.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        // Prevent WebKit from auto-scrolling the scroll view when a text input
        // is focused and the keyboard appears. Our CSS already positions the page
        // above the keyboard via `bottom: var(--keyboard-height)`, so the native
        // scroll-into-view would double-shift the content.
        scrollObservation = webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scrollView, _ in
            if scrollView.contentOffset != .zero {
                scrollView.contentOffset = .zero
            }
        }

        bridge.setup(webView: webView, viewController: self)
        webView.load(URLRequest(url: URL(string: "shellular://localhost/")!))
        observeKeyboard()

        NotificationCenter.default.addObserver(self, selector: #selector(appMovedToBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appCameToForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc func appMovedToBackground() {
        let script = "document.dispatchEvent(new CustomEvent('pause'));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    @objc func appCameToForeground() {
        let script = "document.dispatchEvent(new CustomEvent('resume'));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func observeKeyboard() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillHide),
            name: UIResponder.keyboardWillHideNotification, object: nil
        )
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        isKeyboardVisible = true
        guard let info = notification.userInfo,
              let frame = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let keyboardHeight = frame.height
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('keyboardshow', { detail: { height: \(keyboardHeight) } }))", completionHandler: nil)
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        isKeyboardVisible = false
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('keyboardhide'))", completionHandler: nil)
    }

    private(set) var themeType: String = "dark"

    override var preferredStatusBarStyle: UIStatusBarStyle {
        themeType == "light" ? .darkContent : .lightContent
    }

    override var prefersStatusBarHidden: Bool { false }

    func setThemeType(_ type: String) {
        themeType = type
        setNeedsStatusBarAppearanceUpdate()
        var vc: UIViewController? = parent
        while let current = vc {
            current.setNeedsStatusBarAppearanceUpdate()
            vc = current.parent
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if url.scheme == "shellular" { return .allow }
        #if DEBUG
        if url.scheme == "http" || url.scheme == "https" { return .allow }
        #endif
        return .cancel
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("[WebView] didFailProvisionalNavigation: \(error)")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[WebView] didFail: \(error)")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[WebView] didFinish loading: \(webView.url?.absoluteString ?? "nil")")
    }
}

// Prevents WKUserContentController from retaining the message handler (avoids memory leak).
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var delegate: WKScriptMessageHandler?
    init(_ delegate: WKScriptMessageHandler) { self.delegate = delegate }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(controller, didReceive: message)
    }
}

// Custom WKWebView that removes the input accessory bar (autocorrect toolbar)
final class NoAccessoryWKWebView: WKWebView {
    override var inputAccessoryView: UIView? {
        return nil
    }
    
    // Recursively remove input accessory view from all subviews
    override func didMoveToWindow() {
        super.didMoveToWindow()
        removeInputAccessoryView()
    }
    
    private func removeInputAccessoryView() {
        // Find and remove input accessory view from scroll view subviews
        guard let targetView = scrollView.subviews.first(where: {
            String(describing: type(of: $0)).contains("WKContent")
        }) else { return }
        
        // Traverse subviews to find input views
        for view in targetView.subviews {
            let viewDescription = String(describing: type(of: view))
            if viewDescription.contains("WKContent") {
                for subview in view.subviews {
                    let subviewDescription = String(describing: type(of: subview))
                    if subviewDescription.contains("Input") || subviewDescription.contains("Accessory") {
                        subview.removeFromSuperview()
                    }
                }
            }
        }
    }
}
