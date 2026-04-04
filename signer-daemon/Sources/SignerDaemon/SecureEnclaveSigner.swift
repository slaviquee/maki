import CryptoKit
import Foundation
import Security

/// Real Secure Enclave P-256 signer.
///
/// Important: the Secure Enclave key itself is not persisted as a permanent
/// `SecKey` item. Instead, we create a Secure Enclave-backed CryptoKit key and
/// store its wrapped `dataRepresentation` in the login keychain as a generic
/// password item. On later runs, that wrapped blob is used to rehydrate the
/// same hardware-bound key on this device.
final class SecureEnclaveSigner {
    private let keychainService = "com.maki.secureenclave.keys"
    private let signingAccount = "signing"

    private var signingKey: SecureEnclave.P256.Signing.PrivateKey?

    enum SignerError: Error, LocalizedError {
        case secureEnclaveNotAvailable
        case accessControlCreationFailed
        case keyCreationFailed(String)
        case keyNotFound
        case keychainStoreFailed(OSStatus)
        case keychainLoadFailed(OSStatus)
        case publicKeyExportFailed
        case signFailed(String)
        case userCancelled

        var errorDescription: String? {
            switch self {
            case .secureEnclaveNotAvailable:
                return "Secure Enclave is not available on this Mac"
            case .accessControlCreationFailed:
                return "Failed to create Secure Enclave access control"
            case .keyCreationFailed(let message):
                return "Key creation failed: \(message)"
            case .keyNotFound:
                return "No Secure Enclave signing key found"
            case .keychainStoreFailed(let status):
                return "Failed to store key reference in keychain (\(status))"
            case .keychainLoadFailed(let status):
                return "Failed to load key reference from keychain (\(status))"
            case .publicKeyExportFailed:
                return "Public key export failed"
            case .signFailed(let message):
                return "Signing failed: \(message)"
            case .userCancelled:
                return "User cancelled authentication"
            }
        }
    }

    // MARK: - Key lifecycle

    func ensureKey() throws -> SecureEnclave.P256.Signing.PrivateKey {
        if let signingKey {
            return signingKey
        }

        guard SecureEnclave.isAvailable else {
            throw SignerError.secureEnclaveNotAvailable
        }

        if let existing = try? loadKeyFromKeychain(account: signingAccount) {
            signingKey = existing
            return existing
        }

        let created = try createSigningKey()
        try storeKeyInKeychain(created, account: signingAccount)
        signingKey = created
        return created
    }

    private func createSigningKey() throws -> SecureEnclave.P256.Signing.PrivateKey {
        guard let accessControl = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            nil
        ) else {
            throw SignerError.accessControlCreationFailed
        }

        do {
            return try SecureEnclave.P256.Signing.PrivateKey(accessControl: accessControl)
        } catch {
            throw SignerError.keyCreationFailed(error.localizedDescription)
        }
    }

    private func loadKeyFromKeychain(account: String) throws -> SecureEnclave.P256.Signing.PrivateKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                throw SignerError.keyNotFound
            }
            throw SignerError.keychainLoadFailed(status)
        }

        guard let data = item as? Data else {
            throw SignerError.keyNotFound
        }

        do {
            return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: data)
        } catch {
            throw SignerError.keyNotFound
        }
    }

    private func storeKeyInKeychain(_ key: SecureEnclave.P256.Signing.PrivateKey, account: String) throws {
        let data = key.dataRepresentation

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: data,
        ]

        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus == errSecSuccess {
            return
        }
        if addStatus != errSecDuplicateItem {
            throw SignerError.keychainStoreFailed(addStatus)
        }

        let updateQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        let updates: [String: Any] = [
            kSecValueData as String: data,
        ]
        let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updates as CFDictionary)
        guard updateStatus == errSecSuccess else {
            throw SignerError.keychainStoreFailed(updateStatus)
        }
    }

    func deleteKey() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: signingAccount,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SignerError.keychainStoreFailed(status)
        }
        signingKey = nil
    }

    // MARK: - Public key export

    /// Returns the uncompressed P-256 public key as hex (0x04 || x || y).
    func getPublicKeyHex() throws -> String {
        let key = try ensureKey()
        let raw = key.publicKey.rawRepresentation
        return "0x04" + raw.map { String(format: "%02x", $0) }.joined()
    }

    /// Returns the x and y coordinates separately as 32-byte hex strings.
    func getPublicKeyCoordinates() throws -> (x: String, y: String) {
        let key = try ensureKey()
        let raw = key.publicKey.rawRepresentation

        guard raw.count == 64 else {
            throw SignerError.publicKeyExportFailed
        }

        let x = raw.prefix(32)
        let y = raw.suffix(32)
        return (
            x: "0x" + x.map { String(format: "%02x", $0) }.joined(),
            y: "0x" + y.map { String(format: "%02x", $0) }.joined()
        )
    }

    // MARK: - Signing

    /// Sign a hash with Touch ID authorization.
    /// Returns the raw P-256 signature format expected by the wallet layer: r || s.
    func sign(hash: Data) throws -> Data {
        let key = try ensureKey()

        do {
            let signature = try key.signature(for: hash)
            return signature.rawRepresentation
        } catch {
            let message = error.localizedDescription
            if message.localizedCaseInsensitiveContains("cancel") {
                throw SignerError.userCancelled
            }
            throw SignerError.signFailed(message)
        }
    }

    // MARK: - Status

    func hasKey() -> Bool {
        return signingKey != nil || (try? loadKeyFromKeychain(account: signingAccount)) != nil
    }

    func status() -> StatusResult {
        let hasKey = self.hasKey()
        let pubKey = hasKey ? (try? getPublicKeyHex()) : nil
        return StatusResult(
            ready: true,
            signerType: "secure-enclave",
            hasKey: hasKey,
            publicKey: pubKey,
            keyStorage: hasKey ? "persistent" : "none"
        )
    }
}
