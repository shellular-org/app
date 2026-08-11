import Darwin
import Foundation

let localCLIActivationProtocolVersion = 1
let localCLIRequiredProtocolVersion = 1
let localCLIActivationMaxMessageBytes = 16 * 1024

struct LocalCLIActivationLock: Decodable, Equatable {
    let pid: Int
    let instanceId: String?
    let cliVersion: String?
    let activationProtocolVersion: Int?
    let activationEndpoint: String?
    let activationSecret: String?
    let activationReady: Bool?
}

struct LocalCLIActivationResult: Decodable, Equatable {
    let state: String
    let pid: Int
    let port: Int
    let cliVersion: String
    let localProtocolVersion: Int
}

struct LocalCLIActivationError: LocalizedError, Equatable {
    let code: String
    let message: String
    let currentVersion: String?

    init(code: String, message: String, currentVersion: String? = nil) {
        self.code = code
        self.message = message
        self.currentVersion = currentVersion
    }

    static func unsupported(currentVersion: String?) -> LocalCLIActivationError {
        LocalCLIActivationError(
            code: "EXISTING_CLI_UNSUPPORTED",
            message: "The running Shellular CLI must be updated and restarted once to enable local access.",
            currentVersion: currentVersion
        )
    }

    var errorDescription: String? {
        if code == "EXISTING_CLI_UNSUPPORTED" {
            let version = currentVersion.map { " (running v\($0))" } ?? ""
            return "CLI update required\(version). Restart the updated CLI once to enable local access."
        }
        return message
    }
}

struct LocalCLIActivationLockLoader {
    struct Config: Decodable { let machineId: String }

    let homeDirectory: URL
    let temporaryDirectory: URL
    let username: String
    let readData: (URL) throws -> Data
    let pauseBetweenReads: () -> Void

    init(
        homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser,
        temporaryDirectory: URL = FileManager.default.temporaryDirectory,
        username: String = NSUserName(),
        readData: @escaping (URL) throws -> Data = { try Data(contentsOf: $0) },
        pauseBetweenReads: @escaping () -> Void = { Thread.sleep(forTimeInterval: 0.01) }
    ) {
        self.homeDirectory = homeDirectory
        self.temporaryDirectory = temporaryDirectory
        self.username = username
        self.readData = readData
        self.pauseBetweenReads = pauseBetweenReads
    }

    func load() throws -> LocalCLIActivationLock? {
        let configURL = homeDirectory.appendingPathComponent(".shellular/config.json")
        let configData: Data
        do {
            configData = try readData(configURL)
        } catch {
            if Self.isFileNotFound(error) { return nil }
            throw Self.invalidLock("Could not read the Shellular CLI configuration.")
        }

        let config: Config
        do {
            config = try JSONDecoder().decode(Config.self, from: configData)
        } catch {
            throw Self.invalidLock("The Shellular CLI configuration is malformed.")
        }
        guard Self.isSafeFilenameComponent(config.machineId), Self.isSafeFilenameComponent(username) else {
            throw Self.invalidLock("The Shellular CLI identity is invalid.")
        }

        let lockURL = temporaryDirectory
            .appendingPathComponent("shellular-\(config.machineId)-\(username).lock")
        for attempt in 0..<3 {
            do {
                let data = try readData(lockURL)
                return try JSONDecoder().decode(LocalCLIActivationLock.self, from: data)
            } catch {
                if Self.isFileNotFound(error) { return nil }
                if attempt < 2 {
                    pauseBetweenReads()
                    continue
                }
                throw Self.invalidLock("The running Shellular CLI state is malformed.")
            }
        }
        return nil
    }

    private static func invalidLock(_ message: String) -> LocalCLIActivationError {
        LocalCLIActivationError(code: "INVALID_CLI_STATE", message: message)
    }

    private static func isSafeFilenameComponent(_ value: String) -> Bool {
        !value.isEmpty && value != "." && value != ".." &&
            !value.contains("/") && !value.contains("\0")
    }

    private static func isFileNotFound(_ error: Error) -> Bool {
        let nsError = error as NSError
        return (nsError.domain == NSCocoaErrorDomain && nsError.code == NSFileNoSuchFileError) ||
            (nsError.domain == NSPOSIXErrorDomain && nsError.code == Int(ENOENT))
    }
}

enum LocalCLIUnixSocketTransportError: LocalizedError, Equatable {
    case invalidEndpoint
    case unavailable(Int32)
    case timedOut
    case closed
    case responseTooLarge

    var retryable: Bool {
        switch self {
        case .unavailable, .timedOut, .closed: true
        case .invalidEndpoint, .responseTooLarge: false
        }
    }

    var errorDescription: String? {
        switch self {
        case .invalidEndpoint: "The CLI activation socket path is invalid."
        case .unavailable(let code): "The CLI activation socket is unavailable (\(code))."
        case .timedOut: "Timed out waiting for the CLI activation socket."
        case .closed: "The CLI activation socket closed without a response."
        case .responseTooLarge: "The CLI activation response is too large."
        }
    }
}

struct LocalCLIUnixSocketTransport {
    func exchange(endpoint: String, request: Data, timeout: TimeInterval) throws -> Data {
        let descriptor = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard descriptor >= 0 else {
            throw LocalCLIUnixSocketTransportError.unavailable(errno)
        }
        defer { Darwin.close(descriptor) }

        var noSignal: Int32 = 1
        guard setsockopt(
            descriptor,
            SOL_SOCKET,
            SO_NOSIGPIPE,
            &noSignal,
            socklen_t(MemoryLayout.size(ofValue: noSignal))
        ) == 0 else {
            throw LocalCLIUnixSocketTransportError.unavailable(errno)
        }

        var timeoutValue = timeval(
            tv_sec: Int(timeout),
            tv_usec: Int32((timeout - floor(timeout)) * 1_000_000)
        )
        let timeoutSize = socklen_t(MemoryLayout.size(ofValue: timeoutValue))
        guard withUnsafePointer(to: &timeoutValue, {
            setsockopt(descriptor, SOL_SOCKET, SO_RCVTIMEO, $0, timeoutSize)
        }) == 0 else {
            throw LocalCLIUnixSocketTransportError.unavailable(errno)
        }
        guard withUnsafePointer(to: &timeoutValue, {
            setsockopt(descriptor, SOL_SOCKET, SO_SNDTIMEO, $0, timeoutSize)
        }) == 0 else {
            throw LocalCLIUnixSocketTransportError.unavailable(errno)
        }

        var address = sockaddr_un()
        let path = Array(endpoint.utf8CString)
        let pathOffset = MemoryLayout<sockaddr_un>.offset(of: \.sun_path) ?? 0
        guard !endpoint.isEmpty, path.count <= MemoryLayout.size(ofValue: address.sun_path) else {
            throw LocalCLIUnixSocketTransportError.invalidEndpoint
        }
        let addressLength = pathOffset + path.count
        guard addressLength <= Int(UInt8.max) else {
            throw LocalCLIUnixSocketTransportError.invalidEndpoint
        }
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(addressLength)
        withUnsafeMutablePointer(to: &address.sun_path) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: path.count) { destination in
                for index in path.indices {
                    destination[index] = path[index]
                }
            }
        }

        let connectResult = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(descriptor, $0, socklen_t(addressLength))
            }
        }
        guard connectResult == 0 else {
            throw LocalCLIUnixSocketTransportError.unavailable(errno)
        }

        try request.withUnsafeBytes { bytes in
            guard let baseAddress = bytes.baseAddress else { return }
            var sent = 0
            while sent < bytes.count {
                let count = Darwin.send(
                    descriptor,
                    baseAddress.advanced(by: sent),
                    bytes.count - sent,
                    0
                )
                if count > 0 {
                    sent += count
                } else if count < 0 && errno == EINTR {
                    continue
                } else if errno == EAGAIN || errno == EWOULDBLOCK {
                    throw LocalCLIUnixSocketTransportError.timedOut
                } else {
                    throw LocalCLIUnixSocketTransportError.unavailable(errno)
                }
            }
        }

        var response = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while response.count <= localCLIActivationMaxMessageBytes {
            let count = buffer.withUnsafeMutableBytes {
                Darwin.recv(descriptor, $0.baseAddress, $0.count, 0)
            }
            if count > 0 {
                response.append(buffer, count: count)
                if let newline = response.firstIndex(of: 0x0A) {
                    return Data(response.prefix(through: newline))
                }
            } else if count == 0 {
                throw LocalCLIUnixSocketTransportError.closed
            } else if errno == EINTR {
                continue
            } else if errno == EAGAIN || errno == EWOULDBLOCK {
                throw LocalCLIUnixSocketTransportError.timedOut
            } else {
                throw LocalCLIUnixSocketTransportError.unavailable(errno)
            }
        }
        throw LocalCLIUnixSocketTransportError.responseTooLarge
    }
}

final class LocalCLIActivationClient {
    typealias LockProvider = () throws -> LocalCLIActivationLock?
    typealias ProcessChecker = (Int) -> Bool
    typealias Exchange = (String, Data, TimeInterval) throws -> Data

    private struct Request: Encodable {
        let type = "ACTIVATE_LOCAL"
        let protocolVersion = localCLIActivationProtocolVersion
        let requestId: String
        let targetInstanceId: String
        let secret: String
        let requiredLocalProtocolVersion = localCLIRequiredProtocolVersion
        let port: Int
        let token: String
        let source = "attached"
        let ownerId: String
    }

    private struct Response: Decodable {
        struct RemoteError: Decodable {
            let code: String
            let message: String
            let currentVersion: String?
        }

        let requestId: String
        let ok: Bool
        let state: String?
        let pid: Int?
        let port: Int?
        let cliVersion: String?
        let localProtocolVersion: Int?
        let error: RemoteError?
    }

    private let lockProvider: LockProvider
    private let processChecker: ProcessChecker
    private let exchange: Exchange
    private let endpointValidator: (String) -> Bool
    private let now: () -> Date
    private let sleep: (TimeInterval) -> Void
    private let requestId: () -> String
    private let activationTimeout: TimeInterval
    private let attemptTimeout: TimeInterval
    private let retryInterval: TimeInterval

    init(
        lockProvider: @escaping LockProvider = { try LocalCLIActivationLockLoader().load() },
        processChecker: @escaping ProcessChecker = LocalCLIActivationClient.defaultProcessChecker,
        exchange: @escaping Exchange = LocalCLIUnixSocketTransport().exchange,
        endpointValidator: @escaping (String) -> Bool = LocalCLIActivationClient.defaultEndpointValidator,
        now: @escaping () -> Date = Date.init,
        sleep: @escaping (TimeInterval) -> Void = Thread.sleep(forTimeInterval:),
        requestId: @escaping () -> String = { UUID().uuidString },
        activationTimeout: TimeInterval = 15,
        attemptTimeout: TimeInterval = 2,
        retryInterval: TimeInterval = 0.1
    ) {
        self.lockProvider = lockProvider
        self.processChecker = processChecker
        self.exchange = exchange
        self.endpointValidator = endpointValidator
        self.now = now
        self.sleep = sleep
        self.requestId = requestId
        self.activationTimeout = activationTimeout
        self.attemptTimeout = attemptTimeout
        self.retryInterval = retryInterval
    }

    /// Returns nil only when no live CLI owns the boot lock. A live but
    /// incompatible CLI is an error so the caller never starts a competing CLI.
    func activate(token: String, ownerId: String, port: Int) throws -> LocalCLIActivationResult? {
        guard token.utf8.count >= 16, (0...65535).contains(port) else {
            throw LocalCLIActivationError(
                code: "START_FAILED",
                message: "The local CLI activation parameters are invalid."
            )
        }
        guard var lock = try lockProvider() else { return nil }
        guard processChecker(lock.pid) else { return nil }

        let deadline = now().addingTimeInterval(activationTimeout)
        var lastTransportError: Error?
        while now() < deadline {
            try validate(lock)
            if lock.activationReady == true,
               let endpoint = lock.activationEndpoint,
               let instanceId = lock.instanceId,
               let secret = lock.activationSecret
            {
                let id = requestId()
                let data = try Self.makeRequestData(
                    requestId: id,
                    instanceId: instanceId,
                    secret: secret,
                    token: token,
                    ownerId: ownerId,
                    port: port
                )
                do {
                    let response = try exchange(endpoint, data, attemptTimeout)
                    return try Self.parseResponse(response, expectedRequestId: id)
                } catch let error as LocalCLIUnixSocketTransportError {
                    guard error.retryable else {
                        throw LocalCLIActivationError(
                            code: "START_FAILED",
                            message: error.localizedDescription
                        )
                    }
                    lastTransportError = error
                }
            }

            sleep(retryInterval)
            guard let refreshed = try lockProvider() else {
                throw LocalCLIActivationError(
                    code: "START_FAILED",
                    message: "The running Shellular CLI exited during activation."
                )
            }
            guard processChecker(refreshed.pid) else {
                throw LocalCLIActivationError(
                    code: "START_FAILED",
                    message: "The running Shellular CLI exited during activation."
                )
            }
            lock = refreshed
        }

        throw LocalCLIActivationError(
            code: "ACTIVATION_TIMEOUT",
            message: lastTransportError?.localizedDescription ?? "Timed out enabling local access."
        )
    }

    static func makeRequestData(
        requestId: String,
        instanceId: String,
        secret: String,
        token: String,
        ownerId: String,
        port: Int
    ) throws -> Data {
        var data = try JSONEncoder().encode(Request(
            requestId: requestId,
            targetInstanceId: instanceId,
            secret: secret,
            port: port,
            token: token,
            ownerId: ownerId
        ))
        data.append(0x0A)
        return data
    }

    static func parseResponse(
        _ data: Data,
        expectedRequestId: String
    ) throws -> LocalCLIActivationResult {
        guard data.count <= localCLIActivationMaxMessageBytes,
              let newline = data.firstIndex(of: 0x0A)
        else {
            throw LocalCLIActivationError(
                code: "INVALID_RESPONSE",
                message: "The CLI activation response is malformed."
            )
        }
        let response: Response
        do {
            response = try JSONDecoder().decode(Response.self, from: data.prefix(upTo: newline))
        } catch {
            throw LocalCLIActivationError(
                code: "INVALID_RESPONSE",
                message: "The CLI activation response is malformed."
            )
        }
        guard response.requestId == expectedRequestId else {
            throw LocalCLIActivationError(
                code: "INVALID_RESPONSE",
                message: "The CLI activation response did not match the request."
            )
        }
        if !response.ok {
            guard let error = response.error else {
                throw LocalCLIActivationError(
                    code: "INVALID_RESPONSE",
                    message: "The CLI activation error response is malformed."
                )
            }
            throw LocalCLIActivationError(
                code: error.code,
                message: error.message,
                currentVersion: error.currentVersion
            )
        }
        guard let state = response.state,
              state == "started" || state == "already-running",
              let pid = response.pid,
              let port = response.port,
              (1...65535).contains(port),
              let cliVersion = response.cliVersion,
              let localProtocolVersion = response.localProtocolVersion
        else {
            throw LocalCLIActivationError(
                code: "INVALID_RESPONSE",
                message: "The CLI activation success response is malformed."
            )
        }
        guard localProtocolVersion == localCLIRequiredProtocolVersion else {
            throw LocalCLIActivationError.unsupported(currentVersion: cliVersion)
        }
        return LocalCLIActivationResult(
            state: state,
            pid: pid,
            port: port,
            cliVersion: cliVersion,
            localProtocolVersion: localProtocolVersion
        )
    }

    private func validate(_ lock: LocalCLIActivationLock) throws {
        guard lock.activationProtocolVersion == localCLIActivationProtocolVersion,
              let instanceId = lock.instanceId, !instanceId.isEmpty,
              let endpoint = lock.activationEndpoint, endpointValidator(endpoint),
              let secret = lock.activationSecret, secret.utf8.count >= 32
        else {
            throw LocalCLIActivationError.unsupported(currentVersion: lock.cliVersion)
        }
    }

    private static func defaultProcessChecker(_ pid: Int) -> Bool {
        guard pid > 0, pid <= Int(Int32.max) else { return false }
        return Darwin.kill(pid_t(pid), 0) == 0 || errno == EPERM
    }

    private static func defaultEndpointValidator(_ endpoint: String) -> Bool {
        guard !endpoint.isEmpty else { return false }
        let temporaryDirectory = FileManager.default.temporaryDirectory
            .standardizedFileURL.path
        let parent = URL(fileURLWithPath: endpoint)
            .deletingLastPathComponent()
            .standardizedFileURL.path
        return parent == temporaryDirectory
    }
}
