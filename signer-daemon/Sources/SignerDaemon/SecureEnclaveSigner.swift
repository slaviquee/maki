import Foundation
import Security
import LocalAuthentication
import CryptoKit

/// Real Secure Enclave P-256 signer.
/// Creates keys in the Secure Enclave, signs with Touch ID authorization.
final class SecureEnclaveSigner {
    private static let keyTag = "com.maki.signer.p256"
    private static let keyLabel = "Maki Signer Key"

    private var cachedPublicKey: SecKey?

    // MARK: - Key Management

    /// Creates a new P-256 key in the Secure Enclave, or retrieves existing one.
    func ensureKey() throws -> SecKey {
        if let existing = try? getExistingKey() {
            cachedPublicKey = SecKeyCopyPublicKey(existing)
            return existing
        }
        return try createKey()
    }

    private func getExistingKey() throws -> SecKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: SecureEnclaveSigner.keyTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status == errSecSuccess else { return nil }
        return (item as! SecKey)
    }

    private func createKey() throws -> SecKey {
        let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            nil
        )!

        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: SecureEnclaveSigner.keyTag,
                kSecAttrLabel as String: SecureEnclaveSigner.keyLabel,
                kSecAttrAccessControl as String: access,
            ] as [String: Any],
        ]

        var error: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw SignerError.keyCreationFailed(error?.takeRetainedValue().localizedDescription ?? "unknown")
        }

        cachedPublicKey = SecKeyCopyPublicKey(privateKey)
        return privateKey
    }

    /// Deletes the stored key from the Secure Enclave.
    func deleteKey() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: SecureEnclaveSigner.keyTag,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SignerError.keyDeletionFailed
        }
        cachedPublicKey = nil
    }

    // MARK: - Public Key Export

    /// Returns the uncompressed P-256 public key as hex (0x04 || x || y).
    func getPublicKeyHex() throws -> String {
        let key = try ensureKey()
        guard let pubKey = SecKeyCopyPublicKey(key) else {
            throw SignerError.publicKeyExportFailed
        }

        var error: Unmanaged<CFError>?
        guard let pubKeyData = SecKeyCopyExternalRepresentation(pubKey, &error) as Data? else {
            throw SignerError.publicKeyExportFailed
        }

        // SecKey P-256 public key is in uncompressed form: 04 || x(32) || y(32)
        return "0x" + pubKeyData.map { String(format: "%02x", $0) }.joined()
    }

    /// Returns the x and y coordinates separately as 32-byte hex strings.
    func getPublicKeyCoordinates() throws -> (x: String, y: String) {
        let key = try ensureKey()
        guard let pubKey = SecKeyCopyPublicKey(key) else {
            throw SignerError.publicKeyExportFailed
        }

        var error: Unmanaged<CFError>?
        guard let pubKeyData = SecKeyCopyExternalRepresentation(pubKey, &error) as Data? else {
            throw SignerError.publicKeyExportFailed
        }

        // Skip the 0x04 prefix byte
        let x = pubKeyData[1...32]
        let y = pubKeyData[33...64]

        return (
            x: "0x" + x.map { String(format: "%02x", $0) }.joined(),
            y: "0x" + y.map { String(format: "%02x", $0) }.joined()
        )
    }

    // MARK: - Signing

    /// Sign a hash with Touch ID authorization. Returns DER-encoded P-256 signature.
    func sign(hash: Data, reason: String) throws -> Data {
        let privateKey = try ensureKey()

        let context = LAContext()
        context.localizedReason = reason

        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            hash as CFData,
            &error
        ) as Data? else {
            let errDesc = error?.takeRetainedValue().localizedDescription ?? "unknown"
            if errDesc.contains("cancel") || errDesc.contains("Cancel") {
                throw SignerError.userCancelled
            }
            throw SignerError.signFailed(errDesc)
        }

        return signature
    }

    /// Parse DER-encoded P-256 signature into raw (r, s) components.
    /// Each component is exactly 32 bytes, zero-padded.
    static func parseDERSignature(_ der: Data) throws -> (r: Data, s: Data) {
        // DER format: 30 [len] 02 [r-len] [r] 02 [s-len] [s]
        var offset = 0

        guard der.count > 6, der[offset] == 0x30 else {
            throw SignerError.invalidDERSignature
        }
        offset += 1

        // Skip sequence length
        if der[offset] & 0x80 != 0 {
            offset += Int(der[offset] & 0x7F) + 1
        } else {
            offset += 1
        }

        // Parse r
        guard der[offset] == 0x02 else { throw SignerError.invalidDERSignature }
        offset += 1
        let rLen = Int(der[offset])
        offset += 1
        var rData = der[offset..<(offset + rLen)]
        offset += rLen

        // Parse s
        guard der[offset] == 0x02 else { throw SignerError.invalidDERSignature }
        offset += 1
        let sLen = Int(der[offset])
        offset += 1
        var sData = der[offset..<(offset + sLen)]

        // Strip leading zero bytes (ASN.1 integer encoding may add a 0x00 prefix)
        while rData.count > 32 && rData.first == 0x00 { rData = rData.dropFirst() }
        while sData.count > 32 && sData.first == 0x00 { sData = sData.dropFirst() }

        // Pad to 32 bytes
        let r = Data(repeating: 0, count: max(0, 32 - rData.count)) + rData
        let s = Data(repeating: 0, count: max(0, 32 - sData.count)) + sData

        return (r: r, s: s)
    }

    // MARK: - Status

    func hasKey() -> Bool {
        return (try? getExistingKey()) != nil
    }

    func status() -> StatusResult {
        let hasKey = self.hasKey()
        var pubKey: String?
        if hasKey {
            pubKey = try? getPublicKeyHex()
        }
        return StatusResult(
            ready: true,
            signerType: "secure-enclave",
            hasKey: hasKey,
            publicKey: pubKey
        )
    }

    // MARK: - Errors

    enum SignerError: Error, LocalizedError {
        case keyCreationFailed(String)
        case keyDeletionFailed
        case publicKeyExportFailed
        case signFailed(String)
        case userCancelled
        case invalidDERSignature

        var errorDescription: String? {
            switch self {
            case .keyCreationFailed(let msg): return "Key creation failed: \(msg)"
            case .keyDeletionFailed: return "Key deletion failed"
            case .publicKeyExportFailed: return "Public key export failed"
            case .signFailed(let msg): return "Signing failed: \(msg)"
            case .userCancelled: return "User cancelled authentication"
            case .invalidDERSignature: return "Invalid DER signature format"
            }
        }
    }
}
