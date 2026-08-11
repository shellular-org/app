import CryptoKit
import Darwin
import Foundation

enum PrivateFileStoreError: LocalizedError {
    case invalidStoredValue
    case temporaryFileCreationFailed

    var errorDescription: String? {
        switch self {
        case .invalidStoredValue:
            return "The stored value is not valid UTF-8."
        case .temporaryFileCreationFailed:
            return "The private storage temporary file could not be created."
        }
    }
}

final class PrivateFileStore {
    private static let directoryPermissions = 0o700
    private static let filePermissions = 0o600

    private let fileManager: FileManager
    private let rootDirectory: URL
    private let namespaceDirectory: URL
    private let queue: DispatchQueue

    convenience init(namespace: String) {
        self.init(
            namespace: namespace,
            rootDirectory: Self.defaultRootDirectory()
        )
    }

    init(
        namespace: String,
        rootDirectory: URL,
        fileManager: FileManager = .default
    ) {
        precondition(Self.isValidNamespace(namespace), "Invalid private storage namespace")
        self.fileManager = fileManager
        self.rootDirectory = rootDirectory
        namespaceDirectory = rootDirectory.appendingPathComponent(
            namespace,
            isDirectory: true
        )
        queue = DispatchQueue(
            label: "io.foxbiz.shellular.private-file-store.\(namespace)"
        )
    }

    func get(_ key: String) throws -> String? {
        try queue.sync {
            guard try prepareExistingDirectory() else { return nil }
            let url = valueURL(for: key)
            var isDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
                return nil
            }
            guard !isDirectory.boolValue else {
                throw CocoaError(.fileReadCorruptFile)
            }
            try setPermissions(Self.filePermissions, at: url)
            let data = try Data(contentsOf: url)
            guard let value = String(data: data, encoding: .utf8) else {
                throw PrivateFileStoreError.invalidStoredValue
            }
            return value
        }
    }

    func set(_ value: String, forKey key: String) throws {
        try queue.sync {
            try ensureDirectory()
            let destination = valueURL(for: key)
            let temporary = namespaceDirectory.appendingPathComponent(
                ".\(UUID().uuidString).tmp",
                isDirectory: false
            )
            defer { try? fileManager.removeItem(at: temporary) }

            guard fileManager.createFile(
                atPath: temporary.path,
                contents: nil,
                attributes: [.posixPermissions: Self.filePermissions]
            ) else {
                throw PrivateFileStoreError.temporaryFileCreationFailed
            }

            try setPermissions(Self.filePermissions, at: temporary)
            let handle = try FileHandle(forWritingTo: temporary)
            do {
                try handle.write(contentsOf: Data(value.utf8))
                try handle.synchronize()
                try handle.close()
            } catch {
                try? handle.close()
                throw error
            }

            guard rename(temporary.path, destination.path) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            try setPermissions(Self.filePermissions, at: destination)
        }
    }

    func remove(_ key: String) throws {
        try queue.sync {
            guard try prepareExistingDirectory() else { return }
            let url = valueURL(for: key)
            guard fileManager.fileExists(atPath: url.path) else { return }
            try fileManager.removeItem(at: url)
        }
    }

    private static func defaultRootDirectory() -> URL {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        .appendingPathComponent("Shellular", isDirectory: true)
        .appendingPathComponent("PrivateStore", isDirectory: true)
    }

    private static func isValidNamespace(_ namespace: String) -> Bool {
        !namespace.isEmpty && namespace.utf8.allSatisfy { character in
            (character >= 48 && character <= 57) ||
                (character >= 65 && character <= 90) ||
                (character >= 97 && character <= 122) ||
                character == 45 ||
                character == 95
        }
    }

    private func valueURL(for key: String) -> URL {
        let digest = SHA256.hash(data: Data(key.utf8))
        let filename = digest.map { String(format: "%02x", $0) }.joined()
        return namespaceDirectory.appendingPathComponent(
            "\(filename).value",
            isDirectory: false
        )
    }

    private func prepareExistingDirectory() throws -> Bool {
        var rootIsDirectory: ObjCBool = false
        guard fileManager.fileExists(
            atPath: rootDirectory.path,
            isDirectory: &rootIsDirectory
        ) else {
            return false
        }
        guard rootIsDirectory.boolValue else {
            throw CocoaError(.fileReadCorruptFile)
        }
        try setPermissions(Self.directoryPermissions, at: rootDirectory)

        var namespaceIsDirectory: ObjCBool = false
        guard fileManager.fileExists(
            atPath: namespaceDirectory.path,
            isDirectory: &namespaceIsDirectory
        ) else {
            return false
        }
        guard namespaceIsDirectory.boolValue else {
            throw CocoaError(.fileReadCorruptFile)
        }
        try setPermissions(Self.directoryPermissions, at: namespaceDirectory)
        return true
    }

    private func ensureDirectory() throws {
        try ensureDirectory(
            at: rootDirectory,
            withIntermediateDirectories: true
        )
        try ensureDirectory(
            at: namespaceDirectory,
            withIntermediateDirectories: false
        )
    }

    private func ensureDirectory(
        at url: URL,
        withIntermediateDirectories: Bool
    ) throws {
        var isDirectory: ObjCBool = false
        if fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) {
            guard isDirectory.boolValue else {
                throw CocoaError(.fileWriteFileExists)
            }
            try setPermissions(Self.directoryPermissions, at: url)
            return
        }

        do {
            try fileManager.createDirectory(
                at: url,
                withIntermediateDirectories: withIntermediateDirectories,
                attributes: [.posixPermissions: Self.directoryPermissions]
            )
        } catch {
            var wasCreatedByAnotherWriter: ObjCBool = false
            guard fileManager.fileExists(
                atPath: url.path,
                isDirectory: &wasCreatedByAnotherWriter
            ), wasCreatedByAnotherWriter.boolValue else {
                throw error
            }
        }
        try setPermissions(Self.directoryPermissions, at: url)
    }

    private func setPermissions(_ permissions: Int, at url: URL) throws {
        try fileManager.setAttributes(
            [.posixPermissions: permissions],
            ofItemAtPath: url.path
        )
    }
}
