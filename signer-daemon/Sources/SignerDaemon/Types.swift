import Foundation

// MARK: - IPC Envelope

struct IpcRequest: Codable {
    let id: String
    let method: String
    let params: AnyCodable?
}

struct IpcResponse: Codable {
    let id: String
    let ok: Bool
    var result: AnyCodable?
    var error: IpcError?
}

struct IpcError: Codable {
    let code: String
    let message: String
}

// MARK: - Method Results

struct PingResult: Codable {
    let pong: Bool
    let version: String
}

struct StatusResult: Codable {
    let ready: Bool
    let signerType: String
    let hasKey: Bool
    let publicKey: String?
}

struct GetPublicKeyResult: Codable {
    let publicKey: String
    let address: String
}

struct SignHashParams: Codable {
    let hash: String
    let actionSummary: String
    let actionClass: Int
}

struct SignHashResult: Codable {
    let signature: String
    let approved: Bool
}

struct ApproveActionParams: Codable {
    let summary: String
    let actionClass: Int
    let details: [String: AnyCodable]?
}

struct ApproveActionResult: Codable {
    let approved: Bool
    let reason: String?
}

// MARK: - AnyCodable (simple type-erased wrapper)

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}
