@testable import WindowChromeSupport
import Foundation
import XCTest

final class PrivateFileStoreTests: XCTestCase {
    private var temporaryDirectory: URL!
    private var rootDirectory: URL!

    override func setUpWithError() throws {
        temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "shellular-private-store-tests-\(UUID().uuidString)",
                isDirectory: true
            )
        rootDirectory = temporaryDirectory.appendingPathComponent(
            "PrivateStore",
            isDirectory: true
        )
        try FileManager.default.createDirectory(
            at: temporaryDirectory,
            withIntermediateDirectories: true
        )
    }

    override func tearDownWithError() throws {
        if let temporaryDirectory {
            try? FileManager.default.removeItem(at: temporaryDirectory)
        }
    }

    func testMissingValueReturnsNilWithoutCreatingStorage() throws {
        let store = makeStore()

        XCTAssertNil(try store.get("missing"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: rootDirectory.path))
        XCTAssertNoThrow(try store.remove("missing"))
    }

    func testRoundTripsOverwritesAndRemovesValues() throws {
        let store = makeStore()

        try store.set("first", forKey: "auth-refresh-token")
        XCTAssertEqual(try store.get("auth-refresh-token"), "first")

        try store.set("second", forKey: "auth-refresh-token")
        XCTAssertEqual(try store.get("auth-refresh-token"), "second")

        try store.remove("auth-refresh-token")
        XCTAssertNil(try store.get("auth-refresh-token"))
        XCTAssertNoThrow(try store.remove("auth-refresh-token"))
    }

    func testNamespacesAndKeysAreIsolated() throws {
        let authStore = makeStore(namespace: "secure-store")
        let cliStore = makeStore(namespace: "local-cli")

        try authStore.set("auth", forKey: "shared")
        try authStore.set("other", forKey: "other")
        try cliStore.set("cli", forKey: "shared")

        XCTAssertEqual(try authStore.get("shared"), "auth")
        XCTAssertEqual(try authStore.get("other"), "other")
        XCTAssertEqual(try cliStore.get("shared"), "cli")
    }

    func testHashesUnicodeAndPathLikeKeysIntoSafeFilenames() throws {
        let store = makeStore()
        let key = "../../Library/Keychains/🔐"

        try store.set("value", forKey: key)

        XCTAssertEqual(try store.get(key), "value")
        let file = try XCTUnwrap(valueFiles(in: "secure-store").first)
        XCTAssertEqual(file.pathExtension, "value")
        XCTAssertFalse(file.lastPathComponent.contains(".."))
        XCTAssertFalse(file.lastPathComponent.contains("Keychains"))
        XCTAssertEqual(file.deletingPathExtension().lastPathComponent.count, 64)
    }

    func testUsesPrivateDirectoryAndFilePermissions() throws {
        let store = makeStore()
        try store.set("value", forKey: "key")

        XCTAssertEqual(try permissions(at: rootDirectory), 0o700)
        XCTAssertEqual(
            try permissions(
                at: rootDirectory.appendingPathComponent(
                    "secure-store",
                    isDirectory: true
                )
            ),
            0o700
        )
        XCTAssertEqual(
            try permissions(
                at: XCTUnwrap(valueFiles(in: "secure-store").first)
            ),
            0o600
        )
    }

    func testAtomicOverwriteLeavesNoTemporaryFiles() throws {
        let store = makeStore()

        for index in 0..<20 {
            try store.set("value-\(index)", forKey: "key")
        }

        XCTAssertEqual(try store.get("key"), "value-19")
        let contents = try FileManager.default.contentsOfDirectory(
            at: rootDirectory.appendingPathComponent(
                "secure-store",
                isDirectory: true
            ),
            includingPropertiesForKeys: nil
        )
        XCTAssertEqual(contents.filter { $0.pathExtension == "value" }.count, 1)
        XCTAssertFalse(contents.contains { $0.pathExtension == "tmp" })
    }

    func testConcurrentOperationsRemainConsistent() throws {
        let store = makeStore()
        let errors = ErrorCollector()

        DispatchQueue.concurrentPerform(iterations: 40) { index in
            do {
                try store.set("value-\(index)", forKey: "key-\(index)")
                XCTAssertEqual(
                    try store.get("key-\(index)"),
                    "value-\(index)"
                )
            } catch {
                errors.append(error)
            }
        }

        XCTAssertTrue(errors.values.isEmpty, "\(errors.values)")
        for index in 0..<40 {
            XCTAssertEqual(
                try store.get("key-\(index)"),
                "value-\(index)"
            )
        }
    }

    func testMalformedValueFailsClosed() throws {
        let store = makeStore()
        try store.set("valid", forKey: "key")
        let file = try XCTUnwrap(valueFiles(in: "secure-store").first)
        try Data([0xFF, 0xFE]).write(to: file)

        XCTAssertThrowsError(try store.get("key")) { error in
            XCTAssertTrue(error is PrivateFileStoreError)
        }
    }

    private func makeStore(
        namespace: String = "secure-store"
    ) -> PrivateFileStore {
        PrivateFileStore(
            namespace: namespace,
            rootDirectory: rootDirectory
        )
    }

    private func valueFiles(in namespace: String) throws -> [URL] {
        try FileManager.default.contentsOfDirectory(
            at: rootDirectory.appendingPathComponent(
                namespace,
                isDirectory: true
            ),
            includingPropertiesForKeys: nil
        )
        .filter { $0.pathExtension == "value" }
    }

    private func permissions(at url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(
            atPath: url.path
        )
        return try XCTUnwrap(
            attributes[.posixPermissions] as? NSNumber
        ).intValue
    }
}

private final class ErrorCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var storedValues: [Error] = []

    var values: [Error] {
        lock.lock()
        defer { lock.unlock() }
        return storedValues
    }

    func append(_ error: Error) {
        lock.lock()
        storedValues.append(error)
        lock.unlock()
    }
}
