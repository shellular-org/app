import Foundation
import Network
import WebKit

final class EmbeddedProxyServer {
    private static let tunnelFrameBytes = 64 * 1024

    private final class RawTunnel {
        let id: String
        let port: Int
        let connection: NWConnection
        weak var webView: WKWebView?
        var sendCredit = 0
        var reading = false
        var closed = false

        init(id: String, port: Int, connection: NWConnection, webView: WKWebView) {
            self.id = id
            self.port = port
            self.connection = connection
            self.webView = webView
        }
    }

    struct PendingConnection {
        let connection: NWConnection
        let requestId: String
        var useChunked = false
    }

    static let shared = EmbeddedProxyServer()

    private let queue = DispatchQueue(label: "shellular.embeddedProxy", qos: .userInitiated)
    private var listeners: [Int: NWListener] = [:]
    private var tunnelListeners: [String: NWListener] = [:]
    private var tunnelTargets: [Int: String] = [:]
    private var rawTunnels: [String: RawTunnel] = [:]
    private(set) var activePorts: Set<Int> = []
    private var pendingConnections: [String: PendingConnection] = [:]

    func startServer(port: Int, webView: WKWebView) -> Bool {
        guard !activePorts.contains(port) else { return true }

        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true

        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else {
            print("[EmbeddedProxy] Invalid port: \(port)")
            return false
        }

        params.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host("127.0.0.1"),
            port: nwPort
        )

        guard let listener = try? NWListener(using: params) else {
            print("[EmbeddedProxy] Failed to create listener on port \(port)")
            return false
        }

        listener.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection, webView: webView)
        }

        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed(let error):
                print("[EmbeddedProxy] Listener failed on port \(port): \(error)")
                self?.activePorts.remove(port)
            case .cancelled:
                self?.activePorts.remove(port)
            default:
                break
            }
        }

        listener.start(queue: queue)
        listeners[port] = listener
        activePorts.insert(port)
        print("[EmbeddedProxy] Server started on 127.0.0.1:\(port)")
        return true
    }

    func stopServer(port: Int) {
        guard let listener = listeners[port] else { return }
        listener.cancel()
        listeners.removeValue(forKey: port)
        activePorts.remove(port)
    }

    func stopAll() {
        for (_, listener) in listeners {
            listener.cancel()
        }
        listeners.removeAll()
        for (_, listener) in tunnelListeners {
            listener.cancel()
        }
        tunnelListeners.removeAll()
        tunnelTargets.removeAll()
        for (_, tunnel) in rawTunnels {
            tunnel.closed = true
            tunnel.connection.cancel()
        }
        rawTunnels.removeAll()
        activePorts.removeAll()
    }

    func hasServer(port: Int) -> Bool {
        return activePorts.contains(port)
    }

    func startTunnelServer(port: Int, targetHost: String, webView: WKWebView) -> Bool {
        if tunnelTargets[port] == targetHost { return true }
        guard !activePorts.contains(port) else { return false }
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else { return false }

        var started = false
        for bindHost in ["127.0.0.1", "::1"] {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            params.requiredLocalEndpoint = .hostPort(
                host: NWEndpoint.Host(bindHost),
                port: nwPort
            )
            guard let listener = try? NWListener(using: params) else { continue }
            let key = "\(bindHost):\(port)"
            listener.newConnectionHandler = { [weak self, weak webView] connection in
                guard let self, let webView else {
                    connection.cancel()
                    return
                }
                self.handleRawTunnelConnection(
                    connection,
                    targetHost: targetHost,
                    port: port,
                    webView: webView
                )
            }
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                if case .failed = state {
                    self.tunnelListeners.removeValue(forKey: key)
                    if !self.tunnelListeners.keys.contains(where: { $0.hasSuffix(":\(port)") }) {
                        self.tunnelTargets.removeValue(forKey: port)
                        self.activePorts.remove(port)
                    }
                }
            }
            listener.start(queue: queue)
            tunnelListeners[key] = listener
            started = true
        }
        guard started else { return false }
        tunnelTargets[port] = targetHost
        activePorts.insert(port)
        return true
    }

    func stopTunnelServer(port: Int) {
        let suffix = ":\(port)"
        for key in tunnelListeners.keys.filter({ $0.hasSuffix(suffix) }) {
            tunnelListeners.removeValue(forKey: key)?.cancel()
        }
        tunnelTargets.removeValue(forKey: port)
        for tunnel in rawTunnels.values.filter({ $0.port == port }) {
            closeRawTunnel(tunnel, notifyJavaScript: true)
        }
        if listeners[port] == nil {
            activePorts.remove(port)
        }
    }

    func tunnelOpened(id: String, sendCredit: Int) {
        queue.async { [weak self] in
            guard let self, let tunnel = self.rawTunnels[id], !tunnel.closed else { return }
            tunnel.sendCredit = min(1024 * 1024, max(0, sendCredit))
            self.receiveRawTunnelData(tunnel)
        }
    }

    func addTunnelWindow(id: String, bytes: Int) {
        queue.async { [weak self] in
            guard let self, let tunnel = self.rawTunnels[id], !tunnel.closed else { return }
            tunnel.sendCredit = min(1024 * 1024, tunnel.sendCredit + max(0, bytes))
            self.receiveRawTunnelData(tunnel)
        }
    }

    func sendTunnelData(id: String, data: Data) {
        queue.async { [weak self] in
            guard let self, let tunnel = self.rawTunnels[id], !tunnel.closed else { return }
            tunnel.connection.send(content: data, completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                if let error {
                    self.closeRawTunnel(tunnel, notifyJavaScript: true, error: error.localizedDescription)
                    return
                }
                self.callProxy(
                    tunnel.webView,
                    function: "tcpConsumed",
                    arguments: ["id": id, "bytes": data.count]
                )
            })
        }
    }

    func endTunnel(id: String) {
        queue.async { [weak self] in
            guard let self, let tunnel = self.rawTunnels[id], !tunnel.closed else { return }
            tunnel.connection.send(
                content: nil,
                contentContext: .finalMessage,
                isComplete: true,
                completion: .contentProcessed { error in
                    if let error {
                        self.closeRawTunnel(tunnel, notifyJavaScript: true, error: error.localizedDescription)
                    }
                }
            )
        }
    }

    func closeTunnel(id: String, error: String? = nil) {
        queue.async { [weak self] in
            guard let self, let tunnel = self.rawTunnels[id] else { return }
            self.closeRawTunnel(tunnel, notifyJavaScript: false, error: error)
        }
    }

    func cancelAllPending() {
        queue.async { [weak self] in
            guard let self else { return }
            for (_, pending) in self.pendingConnections {
                pending.connection.cancel()
            }
            self.pendingConnections.removeAll()
        }
    }

    func sendResponseStart(requestId: String, status: Int, statusText: String, headersJson: String) {
        queue.async { [weak self] in
            guard let self, var pending = self.pendingConnections[requestId] else { return }

            var headerLines = "HTTP/1.1 \(status) \(statusText)\r\n"
            var hasTransferEncoding = false

            if let data = headersJson.data(using: .utf8),
               let headers = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
                for (key, value) in headers {
                    let lower = key.lowercased()
                    if lower == "connection" { continue }

                    if lower == "transfer-encoding" {
                        hasTransferEncoding = true
                        if value.lowercased().contains("chunked") {
                            pending.useChunked = true
                        }
                    }

                    if lower == "set-cookie" {
                        let cookies = value.components(separatedBy: "\n")
                        for cookie in cookies {
                            let trimmed = cookie.trimmingCharacters(in: .whitespaces)
                            if !trimmed.isEmpty {
                                headerLines += "\(key): \(trimmed)\r\n"
                            }
                        }
                    } else {
                        headerLines += "\(key): \(value)\r\n"
                    }
                }
            }

            if !hasTransferEncoding {
                headerLines += "Connection: close\r\n"
            }

            headerLines += "\r\n"
            self.pendingConnections[requestId] = pending

            guard let headerData = headerLines.data(using: .utf8) else { return }
            pending.connection.send(content: headerData, completion: .contentProcessed({ _ in }))
        }
    }

    func sendResponseData(requestId: String, chunkBase64: String, index: Int) {
        queue.async { [weak self] in
            guard let self, let pending = self.pendingConnections[requestId] else { return }
            guard var data = Data(base64Encoded: chunkBase64) else { return }

            if pending.useChunked {
                let hexSize = String(format: "%X", data.count)
                var chunked = Data()
                chunked.append(hexSize.data(using: .utf8)!)
                chunked.append(Data([0x0D, 0x0A])) // \r\n
                chunked.append(data)
                chunked.append(Data([0x0D, 0x0A])) // \r\n
                data = chunked
            }

            pending.connection.send(content: data, completion: .contentProcessed({ _ in }))
        }
    }

    func sendResponseEnd(requestId: String) {
        queue.async { [weak self] in
            guard let self, let pending = self.pendingConnections.removeValue(forKey: requestId) else { return }

            if pending.useChunked {
                let finalChunk = "0\r\n\r\n".data(using: .utf8)!
                pending.connection.send(content: finalChunk, completion: .contentProcessed({ _ in
                    pending.connection.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed({ _ in
                        pending.connection.cancel()
                    }))
                }))
            } else {
                pending.connection.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed({ _ in
                    pending.connection.cancel()
                }))
            }
        }
    }

    func sendResponseError(requestId: String, errorMessage: String) {
        queue.async { [weak self] in
            guard let self, let pending = self.pendingConnections.removeValue(forKey: requestId) else { return }
            let body = errorMessage.data(using: .utf8) ?? Data()
            let response = "HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
            guard let headerData = response.data(using: .utf8) else {
                pending.connection.cancel()
                return
            }
            pending.connection.send(content: headerData + body, completion: .contentProcessed({ _ in
                pending.connection.cancel()
            }))
        }
    }

    // MARK: - Connection Handling

    private func handleConnection(_ connection: NWConnection, webView: WKWebView) {
        connection.start(queue: queue)
        readHTTPRequest(connection, webView: webView, accumulatedData: Data())
    }

    private func handleRawTunnelConnection(
        _ connection: NWConnection,
        targetHost: String,
        port: Int,
        webView: WKWebView
    ) {
        let id = "tcp_\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        let tunnel = RawTunnel(
            id: id,
            port: port,
            connection: connection,
            webView: webView
        )
        rawTunnels[id] = tunnel
        connection.stateUpdateHandler = { [weak self, weak tunnel] state in
            guard let self, let tunnel else { return }
            switch state {
            case .failed(let error):
                self.closeRawTunnel(tunnel, notifyJavaScript: true, error: error.localizedDescription)
            case .cancelled:
                self.closeRawTunnel(tunnel, notifyJavaScript: true)
            default:
                break
            }
        }
        connection.start(queue: queue)
        callProxy(
            webView,
            function: "tcpOpen",
            arguments: ["id": id, "host": targetHost, "port": port]
        )
    }

    private func receiveRawTunnelData(_ tunnel: RawTunnel) {
        guard !tunnel.closed, !tunnel.reading, tunnel.sendCredit > 0 else { return }
        tunnel.reading = true
        let maximum = min(Self.tunnelFrameBytes, tunnel.sendCredit)
        tunnel.connection.receive(
            minimumIncompleteLength: 1,
            maximumLength: maximum
        ) { [weak self, weak tunnel] data, _, isComplete, error in
            guard let self, let tunnel else { return }
            tunnel.reading = false
            if let error {
                self.closeRawTunnel(tunnel, notifyJavaScript: true, error: error.localizedDescription)
                return
            }
            if let data, !data.isEmpty {
                tunnel.sendCredit -= data.count
                self.callProxy(
                    tunnel.webView,
                    function: "tcpData",
                    arguments: ["id": tunnel.id, "chunk": data.base64EncodedString()]
                )
            }
            if isComplete {
                self.callProxy(
                    tunnel.webView,
                    function: "tcpEnd",
                    arguments: ["id": tunnel.id]
                )
                return
            }
            self.receiveRawTunnelData(tunnel)
        }
    }

    private func closeRawTunnel(
        _ tunnel: RawTunnel,
        notifyJavaScript: Bool,
        error: String? = nil
    ) {
        guard !tunnel.closed else { return }
        tunnel.closed = true
        rawTunnels.removeValue(forKey: tunnel.id)
        tunnel.connection.cancel()
        if notifyJavaScript {
            callProxy(
                tunnel.webView,
                function: "tcpClose",
                arguments: ["id": tunnel.id]
            )
        }
        if let error, !error.isEmpty {
            print("[EmbeddedProxy] TCP tunnel \(tunnel.id) closed: \(error)")
        }
    }

    private func callProxy(
        _ webView: WKWebView?,
        function: String,
        arguments: [String: Any]
    ) {
        guard let webView else { return }
        DispatchQueue.main.async {
            webView.callAsyncJavaScript(
                "window.__shellularProxy && window.__shellularProxy[function](...args)",
                arguments: [
                    "function": function,
                    "args": Self.proxyArguments(function: function, values: arguments),
                ],
                in: nil,
                in: .page
            ) { _ in }
        }
    }

    private static func proxyArguments(function: String, values: [String: Any]) -> [Any] {
        switch function {
        case "tcpOpen":
            return [values["id"] ?? "", values["host"] ?? "localhost", values["port"] ?? 0]
        case "tcpData":
            return [values["id"] ?? "", values["chunk"] ?? ""]
        case "tcpConsumed":
            return [values["id"] ?? "", values["bytes"] ?? 0]
        default:
            return [values["id"] ?? ""]
        }
    }

    private func readHTTPRequest(_ connection: NWConnection, webView: WKWebView, accumulatedData: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self else { return }

            if error != nil {
                connection.cancel()
                return
            }

            guard let data = data, !data.isEmpty else {
                if isComplete { connection.cancel() }
                else { self.readHTTPRequest(connection, webView: webView, accumulatedData: accumulatedData) }
                return
            }

            var allData = accumulatedData
            allData.append(data)

            let request = self.parseHTTPRequest(allData)
            guard let req = request else {
                if isComplete {
                    self.sendErrorResponse(connection, status: 400, message: "Bad Request")
                } else {
                    self.readHTTPRequest(connection, webView: webView, accumulatedData: allData)
                }
                return
            }

            let contentLength = req.headers.first(where: { $0.key.lowercased() == "content-length" })
                .flatMap { Int($0.value) } ?? 0
            if contentLength > 0, let body = req.body {
                if body.count < contentLength && !isComplete {
                    self.readHTTPRequest(connection, webView: webView, accumulatedData: allData)
                    return
                }
            }

            self.proxyRequest(connection, request: req, webView: webView)
        }
    }

    private func proxyRequest(_ connection: NWConnection, request: ParsedRequest, webView: WKWebView) {
        let requestId = "req_\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"

        queue.async { [weak self] in
            self?.pendingConnections[requestId] = PendingConnection(connection: connection, requestId: requestId)
        }

        DispatchQueue.main.async {
            let headersDict = Dictionary(uniqueKeysWithValues: request.headers.map { ($0.key, $0.value) })
            let headersJson = (try? JSONSerialization.data(withJSONObject: headersDict)).flatMap {
                String(data: $0, encoding: .utf8)
            } ?? "{}"

            let bodyStr = request.body.flatMap { String(data: $0, encoding: .utf8) } ?? ""

            let escapedHeaders = self.escapeForJS(headersJson)
            let escapedBody = self.escapeForJS(bodyStr)
            let escapedUrl = self.escapeForJS(request.url)
            let escapedMethod = self.escapeForJS(request.method)

            let js = "window.__shellularProxy&&window.__shellularProxy.httpRequest('\(requestId)','\(escapedMethod)','\(escapedUrl)','\(escapedHeaders)','\(escapedBody)')"
            webView.evaluateJavaScript(js)
        }
    }

    private func escapeForJS(_ str: String) -> String {
        return str
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }

    // MARK: - Error Response

    private func sendErrorResponse(_ connection: NWConnection, status: Int, message: String) {
        let body = message.data(using: .utf8) ?? Data()
        let response = "HTTP/1.1 \(status) Error\r\nContent-Type: text/plain\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        guard let headerData = response.data(using: .utf8) else {
            connection.cancel()
            return
        }
        connection.send(content: headerData + body, completion: .contentProcessed({ _ in
            connection.cancel()
        }))
    }

    // MARK: - HTTP Parsing

    struct ParsedRequest {
        let method: String
        let url: String
        let headers: [(key: String, value: String)]
        let body: Data?
    }

    private func parseHTTPRequest(_ data: Data) -> ParsedRequest? {
        guard let string = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .ascii) else {
            return nil
        }

        let parts = string.components(separatedBy: "\r\n\r\n")
        guard let headerSection = parts.first else { return nil }

        let bodyStr = parts.count > 1 ? parts.dropFirst().joined(separator: "\r\n\r\n") : nil
        let body = bodyStr.flatMap { $0.data(using: .utf8) }

        var lines = headerSection.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else { return nil }
        lines.removeFirst()

        let requestParts = requestLine.components(separatedBy: " ")
        guard requestParts.count >= 2 else { return nil }

        let method = requestParts[0].uppercased()
        let rawUrl = requestParts[1]

        var headers: [(key: String, value: String)] = []
        for line in lines {
            guard let colonIndex = line.firstIndex(of: ":") else { continue }
            let key = String(line[..<colonIndex]).trimmingCharacters(in: .whitespaces)
            let value = String(line[line.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)
            headers.append((key: key, value: value))
        }

        return ParsedRequest(method: method, url: rawUrl, headers: headers, body: body)
    }
}
