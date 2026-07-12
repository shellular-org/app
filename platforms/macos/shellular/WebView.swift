import SwiftUI
import AppKit
import WebKit

struct WebContainer: NSViewControllerRepresentable {
    func makeNSViewController(context: Context) -> WebViewController { WebViewController() }
    func updateNSViewController(_ controller: WebViewController, context: Context) {}
}

final class WebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate {
    private(set) var webView: WKWebView!
    let bridge = Bridge()
    private let errorLabel = NSTextField(labelWithString: "")

    override func loadView() { view = NSView(frame: NSRect(x: 0, y: 0, width: 1100, height: 760)) }
    override func viewDidLoad() {
        super.viewDidLoad()
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "shellular")
        configuration.userContentController.add(bridge, name: "exec")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self; webView.uiDelegate = self; webView.isInspectable = true
        webView.setValue(false, forKey: "drawsBackground")
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor), webView.topAnchor.constraint(equalTo: view.topAnchor), webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        errorLabel.alignment = .center; errorLabel.maximumNumberOfLines = 4; errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(errorLabel)
        NSLayoutConstraint.activate([errorLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor), errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor), errorLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 620)])
        bridge.setup(webView: webView, viewController: self)
        webView.load(URLRequest(url: URL(string: "shellular://localhost/")!))
        NotificationCenter.default.addObserver(forName: .reloadWebView, object: nil, queue: .main) { [weak self] _ in self?.webView.reload() }
        NotificationCenter.default.addObserver(forName: .openFile, object: nil, queue: .main) { [weak self] _ in
            guard let self, let window = self.view.window else { return }
            let panel = NSOpenPanel(); panel.allowsMultipleSelection = true
            panel.beginSheetModal(for: window) { response in
                guard response == .OK,
                      let data = try? JSONSerialization.data(withJSONObject: panel.urls.map(\.path)),
                      let json = String(data: data, encoding: .utf8) else { return }
                self.webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('macosopenfiles',{detail:\(json)}))")
            }
        }
        NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.webView.evaluateJavaScript("document.dispatchEvent(new CustomEvent('pause'))") }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.webView.evaluateJavaScript("document.dispatchEvent(new CustomEvent('resume'))") }
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
