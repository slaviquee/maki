import Foundation

/// Protocol for pluggable signer backends (Secure Enclave, Mock, future: Ledger).
protocol SignerBackend {
    func status() -> StatusResult
    func getPublicKey() throws -> GetPublicKeyResult
    func signHash(_ params: SignHashParams) throws -> SignHashResult
    func approveAction(_ params: ApproveActionParams) -> ApproveActionResult
}

// MARK: - SecureEnclaveSigner conformance

extension SecureEnclaveSigner: SignerBackend {
    func getPublicKey() throws -> GetPublicKeyResult {
        let pubKeyHex = try getPublicKeyHex()
        let coords = try getPublicKeyCoordinates()
        return GetPublicKeyResult(
            publicKey: pubKeyHex,
            address: coords.x
        )
    }

    func signHash(_ params: SignHashParams) throws -> SignHashResult {
        let hashHex = params.hash.hasPrefix("0x") ? String(params.hash.dropFirst(2)) : params.hash
        guard let hashData = Data(hexString: hashHex) else {
            throw SecureEnclaveSigner.SignerError.signFailed("Invalid hash hex")
        }

        do {
            let derSignature = try sign(hash: hashData, reason: params.actionSummary)
            let (r, s) = try SecureEnclaveSigner.parseDERSignature(derSignature)
            let sigHex = "0x" + (r + s).map { String(format: "%02x", $0) }.joined()
            return SignHashResult(signature: sigHex, approved: true)
        } catch SecureEnclaveSigner.SignerError.userCancelled {
            return SignHashResult(signature: "0x", approved: false)
        }
    }

    func approveAction(_ params: ApproveActionParams) -> ApproveActionResult {
        // For Secure Enclave, approveAction uses the same Touch ID gate as signHash.
        // We sign a hash of the summary to force biometric authentication.
        let summaryData = params.summary.data(using: .utf8) ?? Data()
        do {
            _ = try sign(hash: summaryData, reason: params.summary)
            return ApproveActionResult(approved: true, reason: nil)
        } catch SecureEnclaveSigner.SignerError.userCancelled {
            return ApproveActionResult(approved: false, reason: "User cancelled")
        } catch {
            return ApproveActionResult(approved: false, reason: error.localizedDescription)
        }
    }
}

// MARK: - Data hex helper

extension Data {
    init?(hexString: String) {
        let hex = hexString.hasPrefix("0x") ? String(hexString.dropFirst(2)) : hexString
        guard hex.count % 2 == 0 else { return nil }

        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }
}
