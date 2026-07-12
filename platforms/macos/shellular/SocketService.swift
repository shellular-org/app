import Foundation
import UserNotifications

/// Foreground-only Socket.IO v4 / EIO4 client built on URLSessionWebSocketTask.
/// No external dependencies — the EIO4 / SIO v4 protocol is implemented directly.
final class SocketService: BaseService {

    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var pingTimer: Timer?
    private var pingInterval: TimeInterval = 25
    private var authJSON: String?
    private var isConnected = false
    private var isAppPaused = false

    private var onMessageCallback:    Callback?
    private var onConnectCallback:    Callback?
    private var onDisconnectCallback: Callback?
    private var onErrorCallback:      Callback?

    private var titleTemplate = "New Order #$id"
    private var bodyTemplate  = "Amount: $amount"

    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "startSocketService":
            startSocket(args: args, callback: callback)
        case "stopSocketService":
            stopSocket(args: args, callback: callback)
        case "isSocketServiceRunning":
            callback.success(isConnected ? 1 : 0)
        case "postMessageToSocketService":
            postMessage(args: args, callback: callback)
        case "setAppPaused":
            isAppPaused = boolArg(args, index: 0)
            callback.success()
        case "setSocketServiceOnMessageListener":
            onMessageCallback = callback
            callback.success(nil, keep: true)
        case "setSocketServiceOnConnectListener":
            onConnectCallback = callback
            callback.success(nil, keep: true)
        case "setSocketServiceOnDisconnectListener":
            onDisconnectCallback = callback
            callback.success(nil, keep: true)
        case "setSocketServiceOnErrorListener":
            onErrorCallback = callback
            callback.success(nil, keep: true)
        case "setNewOrderNotificationTitleTemplate":
            if let t = args[safe: 0] as? String { titleTemplate = t }
            callback.success()
        case "setNewOrderNotificationMessageTemplate":
            if let t = args[safe: 0] as? String { bodyTemplate = t }
            callback.success()
        default:
            callback.error("Unknown action: \(action)")
        }
    }

    // MARK: - Start / Stop

    private func startSocket(args: [Any], callback: Callback) {
        guard let urlString = args[safe: 0] as? String else {
            callback.error("url required"); return
        }
        authJSON = args[safe: 1] as? String
        guard let wsURL = buildWebSocketURL(from: urlString) else {
            callback.error("Invalid URL: \(urlString)"); return
        }

        // Tear down any existing connection
        tearDown()

        let config = URLSessionConfiguration.default
        // Allow plain-text sockets in development; production should use wss://
        config.tlsMinimumSupportedProtocolVersion = .TLSv10
        urlSession = URLSession(configuration: config)
        webSocketTask = urlSession?.webSocketTask(with: wsURL)
        webSocketTask?.resume()
        startReceiving()
        callback.success()
    }

    private func stopSocket(args: [Any], callback: Callback) {
        tearDown()
        callback.success()
    }

    private func tearDown() {
        pingTimer?.invalidate()
        pingTimer = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        if isConnected {
            isConnected = false
            onDisconnectCallback?.success(nil, keep: true)
        }
    }

    // MARK: - Receive loop

    private func startReceiving() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(.string(let text)):
                self.handlePacket(text)
                self.startReceiving()
            case .success(.data(let data)):
                if let text = String(data: data, encoding: .utf8) { self.handlePacket(text) }
                self.startReceiving()
            case .failure(let error):
                self.handleDisconnect(reason: error.localizedDescription)
            @unknown default:
                self.startReceiving()
            }
        }
    }

    // MARK: - EIO4 packet handling

    private func handlePacket(_ text: String) {
        guard let first = text.first else { return }
        let rest = String(text.dropFirst())
        switch String(first) {
        case "0": // EIO OPEN
            if let data = rest.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                pingInterval = (json["pingInterval"] as? Double ?? 25000) / 1000
            }
            // Send SIO CONNECT with optional auth
            let connectPacket: String
            if let auth = authJSON, !auth.isEmpty {
                connectPacket = "40{\"auth\":\(auth)}"
            } else {
                connectPacket = "40"
            }
            sendRaw(connectPacket)
            schedulePingTimer()

        case "1": // EIO CLOSE
            handleDisconnect(reason: "Server closed connection")

        case "2": // EIO PING — server-initiated, respond with PONG
            sendRaw("3")

        case "4": // EIO MESSAGE — contains SIO packet
            handleSIOPacket(rest)

        default:
            break
        }
    }

    // MARK: - SIO packet handling

    private func handleSIOPacket(_ text: String) {
        guard let first = text.first else { return }
        let rest = String(text.dropFirst())
        switch String(first) {
        case "0": // SIO CONNECT ACK
            isConnected = true
            onConnectCallback?.success(nil, keep: true)

        case "1": // SIO DISCONNECT
            handleDisconnect(reason: nil)

        case "2": // SIO EVENT
            guard let data = rest.data(using: .utf8),
                  let arr  = try? JSONSerialization.jsonObject(with: data) as? [Any],
                  let name = arr.first as? String,
                  name == "message",
                  arr.count > 1 else { return }
            let payload = arr[1]
            onMessageCallback?.success(payload, keep: true)
            if isAppPaused { postBackgroundNotification(for: payload) }

        case "4": // SIO CONNECT_ERROR
            onErrorCallback?.success(rest, keep: true)

        default:
            break
        }
    }

    // MARK: - Send

    private func postMessage(args: [Any], callback: Callback) {
        guard let message = args[safe: 0] else { callback.error("message required"); return }
        let json: String
        if let str = message as? String {
            // Wrap raw string as a JSON string value
            guard let data = try? JSONSerialization.data(withJSONObject: str),
                  let s = String(data: data, encoding: .utf8) else {
                callback.error("Failed to serialize message"); return
            }
            json = s
        } else if let data = try? JSONSerialization.data(withJSONObject: message),
                  let s = String(data: data, encoding: .utf8) {
            json = s
        } else {
            callback.error("Failed to serialize message"); return
        }
        sendRaw("42[\"message\",\(json)]")
        callback.success()
    }

    private func sendRaw(_ text: String) {
        webSocketTask?.send(.string(text)) { [weak self] error in
            if let error = error {
                self?.onErrorCallback?.success(error.localizedDescription, keep: true)
            }
        }
    }

    // MARK: - Ping timer (client-side keep-alive)

    private func schedulePingTimer() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.pingTimer?.invalidate()
            self.pingTimer = Timer.scheduledTimer(withTimeInterval: self.pingInterval, repeats: true) { [weak self] _ in
                self?.sendRaw("2")
            }
        }
    }

    // MARK: - Disconnect

    private func handleDisconnect(reason: String?) {
        guard isConnected || webSocketTask != nil else { return }
        isConnected = false
        pingTimer?.invalidate()
        pingTimer = nil
        onDisconnectCallback?.success(reason, keep: true)
    }

    // MARK: - Background notification

    private func postBackgroundNotification(for payload: Any) {
        var id     = ""
        var amount = ""
        if let dict = payload as? [String: Any] {
            id     = "\(dict["id"] ?? "")"
            amount = "\(dict["amount"] ?? "")"
        }
        let title = titleTemplate.replacingOccurrences(of: "$id", with: id)
        let body  = bodyTemplate.replacingOccurrences(of: "$amount", with: amount)
        let content = UNMutableNotificationContent()
        content.title = title
        content.body  = body
        content.sound = .default
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Helpers

    private func buildWebSocketURL(from string: String) -> URL? {
        guard var comps = URLComponents(string: string) else { return nil }
        if comps.scheme == "http" || comps.scheme == "https" { comps.scheme = "ws" }
        var items = comps.queryItems ?? []
        items.removeAll { $0.name == "EIO" || $0.name == "transport" }
        items.append(URLQueryItem(name: "EIO", value: "4"))
        items.append(URLQueryItem(name: "transport", value: "websocket"))
        comps.queryItems = items
        return comps.url
    }

    private func boolArg(_ args: [Any], index: Int) -> Bool {
        if let b = args[safe: index] as? Bool  { return b }
        if let i = args[safe: index] as? Int   { return i == 1 }
        return false
    }
}
