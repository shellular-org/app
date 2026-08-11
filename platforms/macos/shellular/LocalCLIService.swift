import Foundation
import Security
import CoreImage
import AppKit

final class LocalCLIService: BaseService {
    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "capability": callback.success(LocalCLIManager.shared.capability())
        case "ensureRunning": LocalCLIManager.shared.ensureRunning { result in self.finish(result, callback) }
        case "status": LocalCLIManager.shared.request(path: "/control/status", method: "GET", body: nil) { self.finish($0, callback) }
        case "ticket": LocalCLIManager.shared.request(path: "/control/ticket", method: "POST", body: args.first) { self.finish($0, callback) }
        case "mutateClient": LocalCLIManager.shared.request(path: "/control/clients", method: "POST", body: args.first) { self.finish($0, callback) }
        case "stop": LocalCLIManager.shared.request(path: "/control/stop", method: "POST", body: [:]) { self.finish($0, callback) }
        case "disable": LocalCLIManager.shared.request(path: "/control/disable", method: "POST", body: [:]) { self.finish($0, callback) }
        case "qrCode":
            guard let text = args.first as? String, let data = text.data(using: .utf8), let filter = CIFilter(name: "CIQRCodeGenerator") else { return callback.error("QR data required") }
            filter.setValue(data, forKey: "inputMessage"); filter.setValue("M", forKey: "inputCorrectionLevel")
            guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 7, y: 7)),
                  let cgImage = CIContext().createCGImage(image, from: image.extent) else { return callback.error("Could not create QR code") }
            let bitmap = NSBitmapImageRep(cgImage: cgImage)
            guard let png = bitmap.representation(using: NSBitmapImageRep.FileType.png, properties: [:]) else { return callback.error("Could not encode QR code") }
            callback.success("data:image/png;base64,\(png.base64EncodedString())")
        default: callback.error("Unknown action: \(action)")
        }
    }
    private func finish(_ result: Result<Any, Error>, _ callback: Callback) {
        switch result { case .success(let value): callback.success(value); case .failure(let error): callback.error(error.localizedDescription) }
    }
}

final class LocalCLIManager {
    static let shared = LocalCLIManager()
    private let protocolVersion = 1
    private let devPort = 51238
    private let token = UUID().uuidString + UUID().uuidString
    private let ownerId = UUID().uuidString
    private let activationClient = LocalCLIActivationClient()
    private let ensureQueue = DispatchQueue(label: "io.foxbiz.shellular.local-cli.ensure")
    private var ensureCallbacks: [(Result<Any, Error>) -> Void] = []
    private var port: Int?
    private var process: Process?
    private var didTryGlobalInstall = false

    private init() {}

    func capability() -> [String: Any] {
        let sandboxed: Bool
        if let task = SecTaskCreateFromSelf(nil),
           let value = SecTaskCopyValueForEntitlement(task, "com.apple.security.app-sandbox" as CFString, nil) {
            sandboxed = (value as? Bool) == true
        } else {
            sandboxed = false
        }
        return ["available": !sandboxed, "sandboxed": sandboxed, "protocolVersion": protocolVersion]
    }

    func ensureRunning(completion: @escaping (Result<Any, Error>) -> Void) {
        ensureQueue.async {
            self.ensureCallbacks.append(completion)
            guard self.ensureCallbacks.count == 1 else { return }
            self.ensureRunningOnce { result in
                self.ensureQueue.async {
                    let callbacks = self.ensureCallbacks
                    self.ensureCallbacks.removeAll()
                    callbacks.forEach { $0(result) }
                }
            }
        }
    }

    private func ensureRunningOnce(completion: @escaping (Result<Any, Error>) -> Void) {
        guard (capability()["available"] as? Bool) == true else { return completion(.failure(LocalCLIError("Local access is unavailable in this build."))) }
        if let discovery = readDiscovery() {
            guard discovery.protocolVersion == protocolVersion else {
                return completion(.failure(LocalCLIError("CLI update required (running v\(discovery.cliVersion)). Restart the updated CLI once to enable local access.")))
            }
            port = discovery.port
            return request(path: "/control/status", method: "GET", body: nil) { result in
                switch result {
                case .success: completion(result)
                case .failure: self.activateRunningOrStart(preferredPort: self.devPort, completion: completion)
                }
            }
        }
        activateRunningOrStart(preferredPort: devPort, completion: completion)
    }

    private func activateRunningOrStart(preferredPort: Int, completion: @escaping (Result<Any, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            #if DEBUG
            let activationPort = preferredPort
            #else
            let activationPort = 0
            #endif
            do {
                let activation: LocalCLIActivationResult?
                do {
                    activation = try self.activationClient.activate(
                        token: self.token,
                        ownerId: self.ownerId,
                        port: activationPort
                    )
                } catch let error as LocalCLIActivationError
                    where error.code == "PORT_IN_USE" && activationPort != 0
                {
                    activation = try self.activationClient.activate(
                        token: self.token,
                        ownerId: self.ownerId,
                        port: 0
                    )
                }
                guard let activation else {
                    return self.startLocal(preferredPort: preferredPort, completion: completion)
                }
                self.port = activation.port
                self.request(path: "/control/status", method: "GET", body: nil) { result in
                    switch result {
                    case .success: completion(result)
                    case .failure(let error):
                        completion(.failure(LocalCLIError(
                            "The running CLI enabled local access, but the app could not connect: \(error.localizedDescription)"
                        )))
                    }
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func startLocal(preferredPort: Int, completion: @escaping (Result<Any, Error>) -> Void) {
        #if DEBUG
        guard let directory = Bundle.main.object(forInfoDictionaryKey: "ShellularDevCLIDirectory") as? String,
              !directory.isEmpty, FileManager.default.fileExists(atPath: directory) else {
            return completion(.failure(LocalCLIError("The workspace CLI could not be found for this development build.")))
        }
        start(
            command: "pnpm",
            arguments: [
                "run", "activate:local",
                "--port", String(preferredPort),
                "--activate-existing-only",
                "--wait-for-existing", "45000",
            ],
            directory: directory,
            retryDynamicPort: preferredPort != 0,
            completion: completion
        )
        #else
        start(command: "npx", arguments: ["--yes", "shellular@latest", "--start-local", "--port", "0", "--no-qr"], completion: completion)
        #endif
    }

    func request(path: String, method: String, body: Any?, completion: @escaping (Result<Any, Error>) -> Void) {
        guard let port else { return completion(.failure(LocalCLIError("Local CLI is not running"))) }
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = method
        request.timeoutInterval = 4
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try? JSONSerialization.data(withJSONObject: body) }
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error { return completion(.failure(error)) }
            guard let http = response as? HTTPURLResponse, let data else { return completion(.failure(LocalCLIError("Invalid local CLI response"))) }
            let value = (try? JSONSerialization.jsonObject(with: data)) ?? [:]
            guard (200..<300).contains(http.statusCode) else { return completion(.failure(LocalCLIError(Self.errorMessage(value) ?? "Local CLI request failed (\(http.statusCode))"))) }
            completion(.success(value))
        }.resume()
    }

    private func start(command: String, arguments: [String], directory: String? = nil, retryDynamicPort: Bool = false, completion: @escaping (Result<Any, Error>) -> Void) {
        let child = Process()
        child.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        child.arguments = [command] + arguments
        if let directory { child.currentDirectoryURL = URL(fileURLWithPath: directory) }
        var environment = ProcessInfo.processInfo.environment
        environment["SHELLULAR_LOCAL_TOKEN"] = token
        environment["SHELLULAR_LOCAL_OWNER_ID"] = ownerId
        #if DEBUG
        environment["SHELLULAR_LOCAL_SOURCE"] = "development"
        #else
        environment["SHELLULAR_LOCAL_SOURCE"] = command == "shellular" ? "global" : "npx"
        #endif
        environment["PATH"] = Self.commandSearchPath(existing: environment["PATH"])
        child.environment = environment
        child.standardInput = FileHandle.nullDevice
        child.standardOutput = FileHandle.nullDevice
        let errorPipe = Pipe(); child.standardError = errorPipe
        do { try child.run(); process = child } catch { return completion(.failure(error)) }
        pollForDiscovery(attempt: 0, errorPipe: errorPipe, retryDynamicPort: retryDynamicPort, completion: completion)
    }

    private func pollForDiscovery(attempt: Int, errorPipe: Pipe, retryDynamicPort: Bool = false, completion: @escaping (Result<Any, Error>) -> Void) {
        let childExited = process?.isRunning == false
        if let discovery = readDiscovery(), discovery.protocolVersion == protocolVersion {
            port = discovery.port
            return request(path: "/control/status", method: "GET", body: nil) { result in
                switch result {
                case .success: completion(result)
                case .failure:
                    if attempt >= 240 || childExited {
                        self.finishStartFailure(errorPipe: errorPipe, retryDynamicPort: retryDynamicPort, completion: completion)
                    } else {
                        DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) {
                            self.pollForDiscovery(attempt: attempt + 1, errorPipe: errorPipe, retryDynamicPort: retryDynamicPort, completion: completion)
                        }
                    }
                }
            }
        }
        if attempt >= 240 || childExited {
            if attempt >= 240, process?.isRunning == true { process?.terminate(); process?.waitUntilExit() }
            return finishStartFailure(errorPipe: errorPipe, retryDynamicPort: retryDynamicPort, completion: completion)
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) { self.pollForDiscovery(attempt: attempt + 1, errorPipe: errorPipe, retryDynamicPort: retryDynamicPort, completion: completion) }
    }

    private func finishStartFailure(errorPipe: Pipe, retryDynamicPort: Bool, completion: @escaping (Result<Any, Error>) -> Void) {
        let stderr = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        if retryDynamicPort, Self.structuredError(stderr)?.code == "PORT_IN_USE" {
            return startLocal(preferredPort: 0, completion: completion)
        }
        #if !DEBUG
        let exit127 = process.map { !$0.isRunning && $0.terminationStatus == 127 } ?? false
        let resolutionFailure = stderr.localizedCaseInsensitiveContains("not found") || stderr.localizedCaseInsensitiveContains("could not determine executable") || exit127
        if resolutionFailure && !didTryGlobalInstall {
            didTryGlobalInstall = true
            return installGlobalAndStart(completion: completion)
        }
        #endif
        if let error = Self.structuredError(stderr) {
            let message: String
            if error.code == "EXISTING_CLI_UNSUPPORTED" {
                message = "CLI update required\(error.currentVersion.map { " (running v\($0))" } ?? ""). Restart the updated CLI once to enable local access."
            } else if error.code == "CLI_NOT_RUNNING" {
                message = "Waiting for the development workspace CLI. Start the normal CLI development command and the app will connect automatically."
            } else {
                message = error.message
            }
            return completion(.failure(LocalCLIError(message)))
        }
        completion(.failure(LocalCLIError(stderr.isEmpty ? "Local access could not be prepared." : stderr)))
    }

    private func installGlobalAndStart(completion: @escaping (Result<Any, Error>) -> Void) {
        DispatchQueue.global().async {
            let installer = Process(); installer.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            installer.arguments = ["npm", "install", "--global", "shellular@latest"]
            var environment = ProcessInfo.processInfo.environment
            environment["PATH"] = Self.commandSearchPath(existing: environment["PATH"])
            installer.environment = environment
            let pipe = Pipe(); installer.standardError = pipe; installer.standardOutput = FileHandle.nullDevice
            do { try installer.run(); installer.waitUntilExit() } catch { return completion(.failure(error)) }
            guard installer.terminationStatus == 0 else {
                let message = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "npm install failed"
                return completion(.failure(LocalCLIError(message)))
            }
            self.start(command: "shellular", arguments: ["--start-local", "--port", "0", "--no-qr"], completion: completion)
        }
    }

    private struct Discovery: Decodable { let pid: Int; let port: Int; let cliVersion: String; let protocolVersion: Int }
    private struct StructuredCLIError: Decodable {
        let code: String
        let message: String
        let currentVersion: String?
    }
    private func readDiscovery() -> Discovery? {
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".shellular/local-control.json")
        guard let data = try? Data(contentsOf: url), let value = try? JSONDecoder().decode(Discovery.self, from: data), kill(pid_t(value.pid), 0) == 0 else { return nil }
        return value
    }

    private static func errorMessage(_ value: Any) -> String? { ((value as? [String: Any])?["error"] as? [String: Any])?["message"] as? String }
    private static func commandSearchPath(existing: String?) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser
        var paths = (existing ?? "").split(separator: ":").map(String.init)
        paths += [
            "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin",
            home.appendingPathComponent(".volta/bin").path,
            home.appendingPathComponent(".local/share/pnpm").path,
            home.appendingPathComponent("Library/pnpm").path,
        ]
        let nvmRoot = home.appendingPathComponent(".nvm/versions/node")
        if let versions = try? FileManager.default.contentsOfDirectory(at: nvmRoot, includingPropertiesForKeys: nil) {
            paths += versions.sorted { $0.lastPathComponent > $1.lastPathComponent }.map { $0.appendingPathComponent("bin").path }
        }
        return Array(NSOrderedSet(array: paths))
            .compactMap { $0 as? String }
            .joined(separator: ":")
    }
    private static func structuredError(_ text: String) -> StructuredCLIError? {
        guard let line = text.split(separator: "\n").last(where: { $0.contains("SHELLULAR_LOCAL_ERROR ") }),
              let marker = line.range(of: "SHELLULAR_LOCAL_ERROR ") else { return nil }
        let json = String(line[marker.upperBound...])
        return try? JSONDecoder().decode(StructuredCLIError.self, from: Data(json.utf8))
    }
}

private struct LocalCLIError: LocalizedError {
    let text: String
    init(_ text: String) { self.text = text }
    var errorDescription: String? { text }
}
