import WebKit

final class Bridge: NSObject, WKScriptMessageHandler {
    private(set) weak var webView: WKWebView?
    private(set) weak var viewController: WebViewController?
    private var services: [String: ServiceProtocol] = [:]

    func setup(webView: WKWebView, viewController: WebViewController) {
        self.webView = webView
        self.viewController = viewController
        services = [
            "Native":          NativeService(bridge: self),
            "FileHandler":     FileHandlerService(bridge: self),
            "Device":          DeviceService(bridge: self),
            "Dialog":          DialogService(bridge: self),
            "Encryption":      EncryptionService(bridge: self),
            "Notification":    NotificationService(bridge: self),
            "SecureStore":     SecureStoreService(bridge: self),
            "Scanner":         ScannerService(bridge: self),
            "Browser":         BrowserService(bridge: self),
            "EmbeddedProxy":   EmbeddedProxyService(bridge: self),
        ]
    }

    // Called on the main thread by WKWebView.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "exec",
              let body = message.body as? [String: Any],
              let service = body["service"] as? String,
              let action = body["action"] as? String,
              let argsString = body["args"] as? String,
              let id = body["id"] as? Int,
              let svc = services[service] else { return }

        let args: [Any]
        if let data = argsString.data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [Any] {
            args = arr
        } else {
            args = []
        }

        let callback = Callback(id: id, webView: webView)
        DispatchQueue.global(qos: .userInitiated).async {
            svc.exec(action: action, args: args, callback: callback)
        }
    }
}
