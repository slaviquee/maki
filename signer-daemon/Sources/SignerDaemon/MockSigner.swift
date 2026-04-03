import Foundation

/// Mock signer backend for development and testing.
/// Auto-approves everything. Returns deterministic test keys.
struct MockSigner: SignerBackend {
    static let publicKey = "0x04" + String(repeating: "ab", count: 32) + String(repeating: "cd", count: 32)
    static let address = "0x" + String(repeating: "ee", count: 20)
    static let mockSignature = "0x" + String(repeating: "ff", count: 64)

    func status() -> StatusResult {
        StatusResult(
            ready: true,
            signerType: "mock",
            hasKey: true,
            publicKey: MockSigner.publicKey
        )
    }

    func getPublicKey() throws -> GetPublicKeyResult {
        GetPublicKeyResult(
            publicKey: MockSigner.publicKey,
            address: MockSigner.address
        )
    }

    func signHash(_ params: SignHashParams) throws -> SignHashResult {
        SignHashResult(
            signature: MockSigner.mockSignature,
            approved: true
        )
    }

    func approveAction(_ params: ApproveActionParams) -> ApproveActionResult {
        ApproveActionResult(approved: true, reason: nil)
    }
}
