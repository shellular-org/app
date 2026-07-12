import AppKit
import WebKit

protocol ServiceProtocol: AnyObject { func exec(action: String, args: [Any], callback: Callback) }
class BaseService: NSObject, ServiceProtocol {
    weak var bridge: Bridge?; required init(bridge: Bridge) { self.bridge = bridge }
    var webView: WKWebView? { bridge?.webView }; var viewController: WebViewController? { bridge?.viewController }
    func exec(action: String, args: [Any], callback: Callback) { callback.error("Action '\(action)' not implemented") }
}
extension Array { subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil } }

final class Callback {
    let id: Int; private weak var webView: WKWebView?
    init(id: Int, webView: WKWebView?) { self.id = id; self.webView = webView }
    func success(_ value: Any? = nil, keep: Bool = false) { send(value, nil, keep, false, 0) }
    func successBinary(_ data: Data, keep: Bool = false) { send(String(bytes: data, encoding: .isoLatin1), nil, keep, true, data.count) }
    func error(_ message: String) { send(nil, message, false, false, 0) }
    private func send(_ success: Any?, _ error: String?, _ keep: Bool, _ binary: Bool, _ length: Int) {
        var payload: [String: Any] = ["id":id, "keep":keep, "isBinary":binary, "length":length]
        if let error { payload["error"] = error } else { payload["success"] = success ?? NSNull() }
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak webView] in webView?.evaluateJavaScript("window.iOS&&window.iOS.callback(\(json))") }
    }
}

final class Bridge: NSObject, WKScriptMessageHandler {
    private(set) weak var webView: WKWebView?; private(set) weak var viewController: WebViewController?
    private var services: [String: ServiceProtocol] = [:]
    func setup(webView: WKWebView, viewController: WebViewController) {
        self.webView = webView; self.viewController = viewController
        services = ["Native":NativeService(bridge:self), "FileHandler":FileHandlerService(bridge:self), "Device":DeviceService(bridge:self), "Dialog":DialogService(bridge:self), "Encryption":EncryptionService(bridge:self), "Notification":NotificationService.sharedInstance(bridge:self), "SecureStore":SecureStoreService(bridge:self), "Scanner":ScannerService(bridge:self), "Browser":BrowserService(bridge:self), "EmbeddedProxy":EmbeddedProxyService(bridge:self), "SocketService":SocketService(bridge:self)]
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String:Any], let service = body["service"] as? String, let action = body["action"] as? String, let string = body["args"] as? String, let id = body["id"] as? Int, let target = services[service] else { return }
        let args = (try? JSONSerialization.jsonObject(with: Data(string.utf8))) as? [Any] ?? []
        target.exec(action: action, args: args, callback: Callback(id: id, webView: webView))
    }
}
