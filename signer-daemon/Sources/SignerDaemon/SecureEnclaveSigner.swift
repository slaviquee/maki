import CryptoKit
import Foundation
import LocalAuthentication
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
    private var signingKeyData: Data?

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
        signingKeyData = created.dataRepresentation
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

    private func loadKeyFromKeychainData(account: String) throws -> Data {
        if account == signingAccount, let signingKeyData {
            return signingKeyData
        }

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

        if account == signingAccount {
            signingKeyData = data
        }
        return data
    }

    private func loadKeyFromKeychain(account: String) throws -> SecureEnclave.P256.Signing.PrivateKey {
        let data = try loadKeyFromKeychainData(account: account)

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
            if account == signingAccount {
                signingKeyData = data
            }
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
        if account == signingAccount {
            signingKeyData = data
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
        signingKeyData = nil
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
    func sign(hash: Data, reason: String? = nil) throws -> Data {
        let key: SecureEnclave.P256.Signing.PrivateKey
        if let reason {
            let context = try authorizeContext(reason: reason)
            let keyData = try loadKeyFromKeychainData(account: signingAccount)
            key = try SecureEnclave.P256.Signing.PrivateKey(
                dataRepresentation: keyData,
                authenticationContext: context
            )
        } else {
            key = try ensureKey()
        }

        do {
            let signature: P256.Signing.ECDSASignature
            if hash.count == 32 {
                var digest = SHA256.hash(data: Data())
                withUnsafeMutableBytes(of: &digest) { digestBytes in
                    _ = hash.copyBytes(to: digestBytes)
                }
                signature = try key.signature(for: digest)
            } else {
                signature = try key.signature(for: hash)
            }
            return signature.rawRepresentation
        } catch {
            let message = error.localizedDescription
            if message.localizedCaseInsensitiveContains("cancel") {
                throw SignerError.userCancelled
            }
            throw SignerError.signFailed(message)
        }
    }

    func authorize(reason: String) throws {
        _ = try authorizeContext(reason: reason)
    }

    private func authorizeContext(reason: String) throws -> LAContext {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        context.touchIDAuthenticationAllowableReuseDuration = 10

        var canEvaluateError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &canEvaluateError) else {
            throw SignerError.signFailed(canEvaluateError?.localizedDescription ?? "Biometric authentication unavailable")
        }

        let semaphore = DispatchSemaphore(value: 0)
        var authSuccess = false
        var authError: Error?
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: compactReason(reason)) {
            success,
            error in
            authSuccess = success
            authError = error
            semaphore.signal()
        }
        semaphore.wait()

        guard authSuccess else {
            if let laError = authError as? LAError {
                switch laError.code {
                case .userCancel, .systemCancel, .appCancel, .authenticationFailed:
                    throw SignerError.userCancelled
                default:
                    break
                }
            }

            let message = authError?.localizedDescription ?? "Authentication failed"
            if message.localizedCaseInsensitiveContains("cancel") {
                throw SignerError.userCancelled
            }
            throw SignerError.signFailed(message)
        }

        return context
    }

    private func compactReason(_ summary: String) -> String {
        let interestingLines = summary
            .split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter {
                !$0.isEmpty &&
                    !$0.hasPrefix("---") &&
                    !$0.hasPrefix("Risk class:") &&
                    !$0.hasPrefix("Steps:")
            }

        let compact = interestingLines.prefix(4).joined(separator: " • ")
        if compact.isEmpty {
            return "Approve on-chain action"
        }

        let prefix = "Approve: "
        let maxLength = 140
        if prefix.count + compact.count <= maxLength {
            return prefix + compact
        }

        let available = maxLength - prefix.count - 1
        return prefix + compact.prefix(max(available, 0)) + "…"
    }

    // MARK: - Status

    func hasKey() -> Bool {
        if signingKey != nil || signingKeyData != nil {
            return true
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: signingAccount,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    func status() -> StatusResult {
        let hasKey = self.hasKey()
        let pubKey = (signingKey != nil || signingKeyData != nil) ? (try? getPublicKeyHex()) : nil
        return StatusResult(
            ready: true,
            signerType: "secure-enclave",
            hasKey: hasKey,
            publicKey: pubKey,
            keyStorage: hasKey ? "persistent" : "none"
        )
    }
}
