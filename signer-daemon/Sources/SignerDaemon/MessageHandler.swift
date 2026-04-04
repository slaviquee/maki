import Foundation

struct MessageHandler {
    private let backend: SignerBackend
    private let decoder = JSONDecoder()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = .sortedKeys
        return e
    }()

    init(backend: SignerBackend) {
        self.backend = backend
    }

    func handle(line: String) -> String? {
        guard let data = line.data(using: .utf8) else { return nil }

        let request: IpcRequest
        do {
            request = try decoder.decode(IpcRequest.self, from: data)
        } catch {
            return nil
        }

        let response = dispatch(request)

        guard let responseData = try? encoder.encode(response),
              let responseString = String(data: responseData, encoding: .utf8) else {
            return nil
        }

        return responseString
    }

    private func dispatch(_ request: IpcRequest) -> IpcResponse {
        switch request.method {
        case "ping":
            return ok(request.id, ["pong": true, "version": "0.1.0"] as [String: Any])

        case "status":
            let s = backend.status()
            return ok(request.id, [
                "ready": s.ready,
                "signerType": s.signerType,
                "hasKey": s.hasKey,
                "publicKey": s.publicKey as Any,
                "keyStorage": s.keyStorage,
            ] as [String: Any])

        case "get_public_key":
            do {
                let key = try backend.getPublicKey()
                return ok(request.id, [
                    "publicKey": key.publicKey,
                    "address": key.address,
                ] as [String: Any])
            } catch {
                return err(request.id, "KEY_ERROR", error.localizedDescription)
            }

        case "get_public_key_coordinates":
            if let enclaveSigner = backend as? SecureEnclaveSigner {
                do {
                    let coords = try enclaveSigner.getPublicKeyCoordinates()
                    return ok(request.id, [
                        "x": coords.x,
                        "y": coords.y,
                    ] as [String: Any])
                } catch {
                    return err(request.id, "KEY_ERROR", error.localizedDescription)
                }
            } else {
                return err(request.id, "UNSUPPORTED", "get_public_key_coordinates requires secure-enclave backend")
            }

        case "create_key":
            if let enclaveSigner = backend as? SecureEnclaveSigner {
                do {
                    _ = try enclaveSigner.ensureKey()
                    let coords = try enclaveSigner.getPublicKeyCoordinates()
                    let pubKey = try enclaveSigner.getPublicKeyHex()
                    let status = enclaveSigner.status()
                    return ok(request.id, [
                        "publicKey": pubKey,
                        "x": coords.x,
                        "y": coords.y,
                        "created": true,
                        "keyStorage": status.keyStorage,
                    ] as [String: Any])
                } catch {
                    return err(request.id, "KEY_ERROR", error.localizedDescription)
                }
            } else {
                // Mock always has a key
                return ok(request.id, ["created": true] as [String: Any])
            }

        case "sign_hash":
            guard let paramsData = encodeAnyCodable(request.params),
                  let params = try? decoder.decode(SignHashParams.self, from: paramsData) else {
                return err(request.id, "INVALID_PARAMS", "Invalid sign_hash params")
            }
            do {
                let result = try backend.signHash(params)
                return ok(request.id, [
                    "signature": result.signature,
                    "approved": result.approved,
                ] as [String: Any])
            } catch {
                return err(request.id, "SIGN_ERROR", error.localizedDescription)
            }

        case "approve_action":
            guard let paramsData = encodeAnyCodable(request.params),
                  let params = try? decoder.decode(ApproveActionParams.self, from: paramsData) else {
                return err(request.id, "INVALID_PARAMS", "Invalid approve_action params")
            }
            let result = backend.approveAction(params)
            return ok(request.id, ["approved": result.approved] as [String: Any])

        default:
            return err(request.id, "UNKNOWN_METHOD", "Unknown method: \(request.method)")
        }
    }

    // MARK: - Helpers

    private func ok(_ id: String, _ result: [String: Any]) -> IpcResponse {
        IpcResponse(id: id, ok: true, result: AnyCodable(result))
    }

    private func err(_ id: String, _ code: String, _ message: String) -> IpcResponse {
        IpcResponse(id: id, ok: false, error: IpcError(code: code, message: message))
    }

    private func encodeAnyCodable(_ value: AnyCodable?) -> Data? {
        guard let value = value else { return nil }
        return try? encoder.encode(value)
    }
}
