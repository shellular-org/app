import Foundation
import Security

final class SecureStoreService: BaseService {
    private let service = "io.foxbiz.shellular.secure-store"

    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "get": get(args: args, callback: callback)
        case "set": set(args: args, callback: callback)
        case "remove": remove(args: args, callback: callback)
        default: callback.error("Unknown action: \(action)")
        }
    }

    private func get(args: [Any], callback: Callback) {
        guard let key = args[safe: 0] as? String else {
            callback.error("Missing key")
            return
        }

        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            callback.success(nil)
            return
        }
        guard status == errSecSuccess, let data = item as? Data else {
            callback.error("Keychain read failed")
            return
        }
        callback.success(String(data: data, encoding: .utf8))
    }

    private func set(args: [Any], callback: Callback) {
        guard let key = args[safe: 0] as? String,
              let value = args[safe: 1] as? String,
              let data = value.data(using: .utf8) else {
            callback.error("Missing key or value")
            return
        }

        var query = baseQuery(key)
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            let update = [kSecValueData as String: data]
            let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
            updateStatus == errSecSuccess ? callback.success(nil) : callback.error("Keychain update failed")
            return
        }

        query[kSecValueData as String] = data
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        addStatus == errSecSuccess ? callback.success(nil) : callback.error("Keychain write failed")
    }

    private func remove(args: [Any], callback: Callback) {
        guard let key = args[safe: 0] as? String else {
            callback.error("Missing key")
            return
        }
        SecItemDelete(baseQuery(key) as CFDictionary)
        callback.success(nil)
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
    }
}
