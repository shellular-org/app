import WebKit

final class ShellularURLSchemeHandler: NSObject, WKURLSchemeHandler {
    private let homeURL      = URL(fileURLWithPath: NSHomeDirectory())
    private let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    private let cachesURL    = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        let path = url.path
        let fileURL: URL

        if path.hasPrefix("/__file__/") {
            // Relative to sandbox home (covers /files/, /Documents/, /Library/, etc.)
            let relative = String(path.dropFirst("/__file__/".count))
            fileURL = homeURL.appendingPathComponent(relative)
        } else if path.hasPrefix("/__cache__/") {
            let relative = String(path.dropFirst("/__cache__/".count))
            fileURL = cachesURL.appendingPathComponent(relative)
        } else {
            let assetPath = path == "/" || path.isEmpty ? "index.html" : String(path.dropFirst())
            // Prefer OTA patch over embedded bundle
            let patchDir = documentsURL.appendingPathComponent("patch")
            if FileManager.default.fileExists(atPath: patchDir.appendingPathComponent(assetPath).path) {
                fileURL = patchDir.appendingPathComponent(assetPath)
            } else {
                // Try bundle/assetPath first (preserved folder structure), then flat root (Xcode flattened)
                let inSubfolder = Bundle.main.bundleURL.appendingPathComponent("bundle").appendingPathComponent(assetPath)
                let inRoot = Bundle.main.bundleURL.appendingPathComponent(assetPath)
                if FileManager.default.fileExists(atPath: inSubfolder.path) {
                    fileURL = inSubfolder
                } else if FileManager.default.fileExists(atPath: inRoot.path) {
                    fileURL = inRoot
                } else {
                    print("[SchemeHandler] Not found: \(assetPath)")
                    print("[SchemeHandler] Checked: \(inSubfolder.path)")
                    print("[SchemeHandler] Checked: \(inRoot.path)")
                    print("[SchemeHandler] Bundle contents: \((try? FileManager.default.contentsOfDirectory(atPath: Bundle.main.bundlePath)) ?? [])")
                    task.didFailWithError(URLError(.fileDoesNotExist))
                    return
                }
            }
        }

        do {
            let data = try Data(contentsOf: fileURL)
            let mime = mimeType(for: fileURL.pathExtension)
            let headers: [String: String] = [
                "Content-Type":   mime,
                "Content-Length": "\(data.count)",
                "Cache-Control":  "no-cache",
            ]
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            task.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html":        return "text/html; charset=utf-8"
        case "js":          return "application/javascript"
        case "css":         return "text/css"
        case "json":        return "application/json"
        case "png":         return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif":         return "image/gif"
        case "svg":         return "image/svg+xml"
        case "webp":        return "image/webp"
        case "ico":         return "image/x-icon"
        case "ttf":         return "font/ttf"
        case "woff":        return "font/woff"
        case "woff2":       return "font/woff2"
        case "eot":         return "application/vnd.ms-fontobject"
        case "mp4":         return "video/mp4"
        case "mp3":         return "audio/mpeg"
        case "pdf":         return "application/pdf"
        default:            return "application/octet-stream"
        }
    }
}
