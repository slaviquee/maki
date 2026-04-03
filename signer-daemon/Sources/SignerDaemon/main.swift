import Foundation

let defaultSocketPath = NSHomeDirectory() + "/.maki/signer.sock"
let socketPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : defaultSocketPath

// Ensure parent directory exists
let parentDir = (socketPath as NSString).deletingLastPathComponent
try? FileManager.default.createDirectory(atPath: parentDir, withIntermediateDirectories: true)

// Handle SIGINT/SIGTERM for cleanup
let server = SocketServer(socketPath: socketPath)

signal(SIGINT) { _ in
    server.stop()
    exit(0)
}

signal(SIGTERM) { _ in
    server.stop()
    exit(0)
}

do {
    try server.start()
} catch {
    fputs("Error starting signer daemon: \(error)\n", stderr)
    exit(1)
}
