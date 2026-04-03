import Foundation

let defaultSocketPath = NSHomeDirectory() + "/.maki/signer.sock"

// Parse args: maki-signer [--mock] [socket-path]
var useMock = false
var socketPath = defaultSocketPath

for arg in CommandLine.arguments.dropFirst() {
    if arg == "--mock" {
        useMock = true
    } else {
        socketPath = arg
    }
}

// Choose backend
let backend: SignerBackend = useMock ? MockSigner() : SecureEnclaveSigner()
let backendName = useMock ? "mock" : "secure-enclave"

// Ensure parent directory exists
let parentDir = (socketPath as NSString).deletingLastPathComponent
try? FileManager.default.createDirectory(atPath: parentDir, withIntermediateDirectories: true)

// Start server
let handler = MessageHandler(backend: backend)
let server = SocketServer(socketPath: socketPath, handler: handler)

signal(SIGINT) { _ in
    server.stop()
    exit(0)
}

signal(SIGTERM) { _ in
    server.stop()
    exit(0)
}

print("maki-signer starting (\(backendName) backend)")

do {
    try server.start()
} catch {
    fputs("Error starting signer daemon: \(error)\n", stderr)
    exit(1)
}
