@testable import WindowChromeSupport
import Darwin
import Foundation
import XCTest

final class LocalCLIActivationLockLoaderTests: XCTestCase {
    private let home = URL(fileURLWithPath: "/test/home", isDirectory: true)
    private let temporary = URL(fileURLWithPath: "/test/tmp", isDirectory: true)

    func testLoadsValidBootLockFromCLIPaths() throws {
        let loader = makeLoader { url in
            if url.lastPathComponent == "config.json" {
                return Data(#"{"machineId":"machine-123"}"#.utf8)
            }
            XCTAssertEqual(url.lastPathComponent, "shellular-machine-123-friend.lock")
            return self.lockData()
        }

        XCTAssertEqual(try loader.load(), makeLock())
    }

    func testReturnsNilWhenConfigurationOrLockDoesNotExist() throws {
        let missingConfig = makeLoader { _ in throw CocoaError(.fileNoSuchFile) }
        XCTAssertNil(try missingConfig.load())

        let missingLock = makeLoader { url in
            if url.lastPathComponent == "config.json" {
                return Data(#"{"machineId":"machine-123"}"#.utf8)
            }
            throw CocoaError(.fileNoSuchFile)
        }
        XCTAssertNil(try missingLock.load())
    }

    func testRejectsMalformedConfigurationAndPersistentMalformedLock() {
        let malformedConfig = makeLoader { _ in Data("{".utf8) }
        XCTAssertThrowsError(try malformedConfig.load()) {
            XCTAssertEqual(($0 as? LocalCLIActivationError)?.code, "INVALID_CLI_STATE")
        }

        var lockReads = 0
        let malformedLock = makeLoader { url in
            if url.lastPathComponent == "config.json" {
                return Data(#"{"machineId":"machine-123"}"#.utf8)
            }
            lockReads += 1
            return Data("{".utf8)
        }
        XCTAssertThrowsError(try malformedLock.load()) {
            XCTAssertEqual(($0 as? LocalCLIActivationError)?.code, "INVALID_CLI_STATE")
        }
        XCTAssertEqual(lockReads, 3)
    }

    func testRetriesPartiallyWrittenLock() throws {
        var lockReads = 0
        var pauses = 0
        let loader = makeLoader(
            readData: { url in
                if url.lastPathComponent == "config.json" {
                    return Data(#"{"machineId":"machine-123"}"#.utf8)
                }
                lockReads += 1
                return lockReads == 1 ? Data("{".utf8) : self.lockData()
            },
            pause: { pauses += 1 }
        )

        XCTAssertEqual(try loader.load(), makeLock())
        XCTAssertEqual(lockReads, 2)
        XCTAssertEqual(pauses, 1)
    }

    private func makeLoader(
        readData: @escaping (URL) throws -> Data,
        pause: @escaping () -> Void = {}
    ) -> LocalCLIActivationLockLoader {
        LocalCLIActivationLockLoader(
            homeDirectory: home,
            temporaryDirectory: temporary,
            username: "friend",
            readData: readData,
            pauseBetweenReads: pause
        )
    }

    private func lockData() -> Data {
        Data(
            """
            {
              "pid": 123,
              "instanceId": "instance",
              "cliVersion": "0.0.49",
              "activationProtocolVersion": 1,
              "activationEndpoint": "/test/tmp/shellular.sock",
              "activationSecret": "ssssssssssssssssssssssssssssssss",
              "activationReady": true
            }
            """.utf8
        )
    }
}

final class LocalCLIActivationProtocolTests: XCTestCase {
    func testSerializesExactVersionOneActivationRequest() throws {
        let data = try LocalCLIActivationClient.makeRequestData(
            requestId: "request",
            instanceId: "instance",
            secret: String(repeating: "s", count: 32),
            token: String(repeating: "t", count: 32),
            ownerId: "owner",
            port: 51238
        )
        XCTAssertEqual(data.last, 0x0A)

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data.dropLast()) as? [String: Any]
        )
        XCTAssertEqual(object["type"] as? String, "ACTIVATE_LOCAL")
        XCTAssertEqual(object["protocolVersion"] as? Int, 1)
        XCTAssertEqual(object["requestId"] as? String, "request")
        XCTAssertEqual(object["targetInstanceId"] as? String, "instance")
        XCTAssertEqual(object["secret"] as? String, String(repeating: "s", count: 32))
        XCTAssertEqual(object["requiredLocalProtocolVersion"] as? Int, 1)
        XCTAssertEqual(object["port"] as? Int, 51238)
        XCTAssertEqual(object["token"] as? String, String(repeating: "t", count: 32))
        XCTAssertEqual(object["source"] as? String, "attached")
        XCTAssertEqual(object["ownerId"] as? String, "owner")
    }

    func testParsesSuccessResponse() throws {
        let result = try LocalCLIActivationClient.parseResponse(
            successResponse(requestId: "request"),
            expectedRequestId: "request"
        )
        XCTAssertEqual(result, LocalCLIActivationResult(
            state: "started",
            pid: 123,
            port: 51238,
            cliVersion: "0.0.49",
            localProtocolVersion: 1
        ))
    }

    func testRejectsMismatchedMalformedAndUnsupportedResponses() {
        XCTAssertThrowsError(try LocalCLIActivationClient.parseResponse(
            successResponse(requestId: "other"),
            expectedRequestId: "request"
        )) {
            XCTAssertEqual(($0 as? LocalCLIActivationError)?.code, "INVALID_RESPONSE")
        }
        XCTAssertThrowsError(try LocalCLIActivationClient.parseResponse(
            Data(#"{"requestId":"request""#.utf8),
            expectedRequestId: "request"
        )) {
            XCTAssertEqual(($0 as? LocalCLIActivationError)?.code, "INVALID_RESPONSE")
        }
        XCTAssertThrowsError(try LocalCLIActivationClient.parseResponse(
            successResponse(requestId: "request", localProtocolVersion: 2),
            expectedRequestId: "request"
        )) {
            let error = $0 as? LocalCLIActivationError
            XCTAssertEqual(error?.code, "EXISTING_CLI_UNSUPPORTED")
            XCTAssertEqual(error?.currentVersion, "0.0.49")
        }
    }

    func testSurfacesStructuredRemoteError() {
        let response = jsonLine(
            #"{"requestId":"request","ok":false,"error":{"code":"PORT_IN_USE","message":"Port is busy","currentVersion":"0.0.49"}}"#
        )
        XCTAssertThrowsError(try LocalCLIActivationClient.parseResponse(
            response,
            expectedRequestId: "request"
        )) {
            XCTAssertEqual($0 as? LocalCLIActivationError, LocalCLIActivationError(
                code: "PORT_IN_USE",
                message: "Port is busy",
                currentVersion: "0.0.49"
            ))
        }
    }
}

final class LocalCLIActivationClientTests: XCTestCase {
    func testReturnsNilForStaleCLIWithoutCallingTransport() throws {
        var exchanged = false
        let client = makeClient(
            processChecker: { _ in false },
            exchange: { _, _, _ in exchanged = true; return Data() }
        )

        XCTAssertNil(try client.activate(token: token, ownerId: "owner", port: 0))
        XCTAssertFalse(exchanged)
    }

    func testRejectsLiveIncompatibleCLIWithoutStartingAnother() {
        let client = makeClient(lock: makeLock(activationProtocolVersion: nil))

        XCTAssertThrowsError(try client.activate(token: token, ownerId: "owner", port: 0)) {
            let error = $0 as? LocalCLIActivationError
            XCTAssertEqual(error?.code, "EXISTING_CLI_UNSUPPORTED")
            XCTAssertEqual(error?.currentVersion, "0.0.49")
        }
    }

    func testRetriesUntilActivationSocketIsReady() throws {
        let clock = TestClock()
        var loads = 0
        var exchanges = 0
        let client = makeClient(
            lockProvider: {
                loads += 1
                return makeLock(activationReady: loads > 1)
            },
            exchange: { _, request, _ in
                exchanges += 1
                return try responseForRequest(request)
            },
            clock: clock
        )

        let result = try client.activate(token: token, ownerId: "owner", port: 0)
        XCTAssertEqual(result?.port, 51238)
        XCTAssertEqual(exchanges, 1)
        XCTAssertGreaterThanOrEqual(loads, 2)
    }

    func testTimesOutAfterRetryableTransportFailures() {
        let clock = TestClock()
        var attempts = 0
        let client = makeClient(
            exchange: { _, _, _ in
                attempts += 1
                throw LocalCLIUnixSocketTransportError.unavailable(ECONNREFUSED)
            },
            clock: clock,
            activationTimeout: 0.25
        )

        XCTAssertThrowsError(try client.activate(token: token, ownerId: "owner", port: 0)) {
            XCTAssertEqual(($0 as? LocalCLIActivationError)?.code, "ACTIVATION_TIMEOUT")
        }
        XCTAssertGreaterThan(attempts, 1)
    }

    func testUnixSocketIntegrationAuthenticatesAndReturnsPort() throws {
        let fixture = try UnixSocketFixture()
        let served = expectation(description: "activation served")
        fixture.serve { request in
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: request.dropLast()) as? [String: Any]
            )
            XCTAssertEqual(object["targetInstanceId"] as? String, "instance")
            XCTAssertEqual(object["secret"] as? String, String(repeating: "s", count: 32))
            XCTAssertEqual(object["token"] as? String, self.token)
            XCTAssertEqual(object["source"] as? String, "attached")
            XCTAssertEqual(object["ownerId"] as? String, "owner")
            XCTAssertEqual(object["port"] as? Int, 0)
            served.fulfill()
            return successResponse(requestId: try XCTUnwrap(object["requestId"] as? String))
        }

        let client = makeClient(
            lock: makeLock(activationEndpoint: fixture.path),
            exchange: LocalCLIUnixSocketTransport().exchange
        )
        let result = try client.activate(token: token, ownerId: "owner", port: 0)

        XCTAssertEqual(result?.pid, 123)
        XCTAssertEqual(result?.port, 51238)
        wait(for: [served], timeout: 2)
    }

    private let token = String(repeating: "t", count: 32)

    private func makeClient(
        lock: LocalCLIActivationLock = makeLock(),
        lockProvider: (() throws -> LocalCLIActivationLock?)? = nil,
        processChecker: @escaping (Int) -> Bool = { _ in true },
        exchange: @escaping LocalCLIActivationClient.Exchange = { _, request, _ in
            try responseForRequest(request)
        },
        clock: TestClock = TestClock(),
        activationTimeout: TimeInterval = 1
    ) -> LocalCLIActivationClient {
        LocalCLIActivationClient(
            lockProvider: lockProvider ?? { lock },
            processChecker: processChecker,
            exchange: exchange,
            endpointValidator: { _ in true },
            now: { clock.now },
            sleep: clock.sleep,
            requestId: { "request" },
            activationTimeout: activationTimeout,
            attemptTimeout: 0.1,
            retryInterval: 0.1
        )
    }
}

private final class TestClock {
    var now = Date(timeIntervalSince1970: 0)
    func sleep(_ interval: TimeInterval) { now.addTimeInterval(interval) }
}

private final class UnixSocketFixture {
    let path: String
    private let descriptor: Int32

    init() throws {
        path = FileManager.default.temporaryDirectory
            .appendingPathComponent("shellular-\(UUID().uuidString.prefix(8)).sock").path
        descriptor = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw POSIXError(.EIO) }
        Darwin.unlink(path)

        var address = try makeUnixAddress(path)
        let result = withUnsafePointer(to: &address.value) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(descriptor, $0, address.length)
            }
        }
        guard result == 0, Darwin.listen(descriptor, 1) == 0 else {
            let code = errno
            Darwin.close(descriptor)
            throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
        }
    }

    deinit {
        Darwin.close(descriptor)
        Darwin.unlink(path)
    }

    func serve(_ handler: @escaping (Data) throws -> Data) {
        DispatchQueue.global(qos: .userInitiated).async {
            let client = Darwin.accept(self.descriptor, nil, nil)
            guard client >= 0 else { return }
            defer { Darwin.close(client) }

            do {
                var request = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while request.firstIndex(of: 0x0A) == nil {
                    let count = buffer.withUnsafeMutableBytes {
                        Darwin.recv(client, $0.baseAddress, $0.count, 0)
                    }
                    guard count > 0 else { return }
                    request.append(buffer, count: count)
                }
                let response = try handler(request)
                try response.withUnsafeBytes { bytes in
                    guard let baseAddress = bytes.baseAddress else { return }
                    var sent = 0
                    while sent < bytes.count {
                        let count = Darwin.send(
                            client,
                            baseAddress.advanced(by: sent),
                            bytes.count - sent,
                            0
                        )
                        guard count > 0 else { throw POSIXError(.EIO) }
                        sent += count
                    }
                }
            } catch {
                XCTFail("Unix socket fixture failed: \(error)")
            }
        }
    }
}

private func makeLock(
    activationProtocolVersion: Int? = 1,
    activationEndpoint: String = "/test/tmp/shellular.sock",
    activationReady: Bool? = true
) -> LocalCLIActivationLock {
    LocalCLIActivationLock(
        pid: 123,
        instanceId: "instance",
        cliVersion: "0.0.49",
        activationProtocolVersion: activationProtocolVersion,
        activationEndpoint: activationEndpoint,
        activationSecret: String(repeating: "s", count: 32),
        activationReady: activationReady
    )
}

private func successResponse(
    requestId: String,
    localProtocolVersion: Int = 1
) -> Data {
    jsonLine(
        #"{"requestId":"\#(requestId)","ok":true,"state":"started","pid":123,"port":51238,"cliVersion":"0.0.49","localProtocolVersion":\#(localProtocolVersion)}"#
    )
}

private func jsonLine(_ value: String) -> Data {
    var data = Data(value.utf8)
    data.append(0x0A)
    return data
}

private func responseForRequest(_ request: Data) throws -> Data {
    let object = try XCTUnwrap(
        JSONSerialization.jsonObject(with: request.dropLast()) as? [String: Any]
    )
    return successResponse(requestId: try XCTUnwrap(object["requestId"] as? String))
}

private func makeUnixAddress(_ path: String) throws -> (value: sockaddr_un, length: socklen_t) {
    var address = sockaddr_un()
    let bytes = Array(path.utf8CString)
    let pathOffset = MemoryLayout<sockaddr_un>.offset(of: \.sun_path) ?? 0
    let length = pathOffset + bytes.count
    guard !path.isEmpty,
          bytes.count <= MemoryLayout.size(ofValue: address.sun_path),
          length <= Int(UInt8.max)
    else {
        throw POSIXError(.ENAMETOOLONG)
    }

    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(length)
    withUnsafeMutablePointer(to: &address.sun_path) { pointer in
        pointer.withMemoryRebound(to: CChar.self, capacity: bytes.count) { destination in
            for index in bytes.indices {
                destination[index] = bytes[index]
            }
        }
    }
    return (address, socklen_t(length))
}
