import Foundation

struct MessageHandler {
    private let signer = MockSigner()
    private let decoder = JSONDecoder()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = .sortedKeys
        return e
    }()

    func handle(line: String) -> String? {
        guard let data = line.data(using: .utf8) else { return nil }

        let request: IpcRequest
        do {
            request = try decoder.decode(IpcRequest.self, from: data)
        } catch {
            // Cannot decode — skip
            return nil
        }

        let response: IpcResponse

        switch request.method {
        case "ping":
            let result = PingResult(pong: true, version: "0.1.0")
            response = IpcResponse(
                id: request.id,
                ok: true,
                result: AnyCodable(["pong": true, "version": "0.1.0"] as [String: Any])
            )
            _ = result // suppress warning

        case "status":
            let status = signer.status()
            response = IpcResponse(
                id: request.id,
                ok: true,
                result: AnyCodable([
                    "ready": status.ready,
                    "signerType": status.signerType,
                    "hasKey": status.hasKey,
                    "publicKey": status.publicKey as Any
                ] as [String: Any])
            )

        case "get_public_key":
            let key = signer.getPublicKey()
            response = IpcResponse(
                id: request.id,
                ok: true,
                result: AnyCodable([
                    "publicKey": key.publicKey,
                    "address": key.address
                ] as [String: Any])
            )

        case "sign_hash":
            if let paramsData = encodeAnyCodable(request.params),
               let params = try? decoder.decode(SignHashParams.self, from: paramsData) {
                let result = signer.signHash(params)
                response = IpcResponse(
                    id: request.id,
                    ok: true,
                    result: AnyCodable([
                        "signature": result.signature,
                        "approved": result.approved
                    ] as [String: Any])
                )
            } else {
                response = IpcResponse(
                    id: request.id,
                    ok: false,
                    error: IpcError(code: "INVALID_PARAMS", message: "Invalid sign_hash params")
                )
            }

        case "approve_action":
            if let paramsData = encodeAnyCodable(request.params),
               let params = try? decoder.decode(ApproveActionParams.self, from: paramsData) {
                let result = signer.approveAction(params)
                response = IpcResponse(
                    id: request.id,
                    ok: true,
                    result: AnyCodable([
                        "approved": result.approved,
                    ] as [String: Any])
                )
            } else {
                response = IpcResponse(
                    id: request.id,
                    ok: false,
                    error: IpcError(code: "INVALID_PARAMS", message: "Invalid approve_action params")
                )
            }

        default:
            response = IpcResponse(
                id: request.id,
                ok: false,
                error: IpcError(code: "UNKNOWN_METHOD", message: "Unknown method: \(request.method)")
            )
        }

        guard let responseData = try? encoder.encode(response),
              let responseString = String(data: responseData, encoding: .utf8) else {
            return nil
        }

        return responseString
    }

    private func encodeAnyCodable(_ value: AnyCodable?) -> Data? {
        guard let value = value else { return nil }
        return try? encoder.encode(value)
    }
}
