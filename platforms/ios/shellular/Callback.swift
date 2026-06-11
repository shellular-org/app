import WebKit

final class Callback {
    let id: Int
    private weak var webView: WKWebView?

    init(id: Int, webView: WKWebView?) {
        self.id = id
        self.webView = webView
    }

    func success(_ value: Any? = nil, keep: Bool = false) {
        send(success: value, error: nil, keep: keep, isBinary: false, length: 0)
    }

    /// Returns raw bytes as a Latin-1 encoded string so the JS side can
    /// recover each byte via charCodeAt() — mirrors Android Callback behaviour.
    func successBinary(_ data: Data, keep: Bool = false) {
        let str = String(bytes: data, encoding: .isoLatin1) ?? ""
        send(success: str, error: nil, keep: keep, isBinary: true, length: data.count)
    }

    func error(_ message: String) {
        send(success: nil, error: message, keep: false, isBinary: false, length: 0)
    }

    private func send(success: Any?, error: String?, keep: Bool, isBinary: Bool, length: Int) {
        var payload: [String: Any] = [
            "id":       id,
            "keep":     keep,
            "isBinary": isBinary,
            "length":   length,
        ]
        if let error = error {
            payload["error"] = error
        } else {
            payload["success"] = success ?? NSNull()
        }

        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }

        let js = "window.iOS&&window.iOS.callback(\(json))"
        DispatchQueue.main.async { [weak webView] in
            webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
