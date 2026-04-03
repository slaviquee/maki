import Foundation

class SocketServer {
    private let socketPath: String
    private let handler = MessageHandler()
    private var serverSocket: Int32 = -1

    init(socketPath: String) {
        self.socketPath = socketPath
    }

    func start() throws {
        // Remove stale socket file
        unlink(socketPath)

        // Create Unix domain socket
        serverSocket = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocket >= 0 else {
            throw ServerError.socketCreationFailed
        }

        // Bind to socket path
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = socketPath.utf8CString
        guard pathBytes.count <= MemoryLayout.size(ofValue: addr.sun_path) else {
            throw ServerError.pathTooLong
        }
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: pathBytes.count) { dest in
                pathBytes.withUnsafeBufferPointer { src in
                    _ = memcpy(dest, src.baseAddress!, src.count)
                }
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                bind(serverSocket, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            throw ServerError.bindFailed(errno: errno)
        }

        // Listen
        guard listen(serverSocket, 5) == 0 else {
            throw ServerError.listenFailed(errno: errno)
        }

        print("maki-signer listening on \(socketPath)")

        // Accept loop
        while true {
            let clientSocket = accept(serverSocket, nil, nil)
            guard clientSocket >= 0 else { continue }
            handleClient(clientSocket)
        }
    }

    private func handleClient(_ clientSocket: Int32) {
        var buffer = ""

        while true {
            var readBuffer = [UInt8](repeating: 0, count: 4096)
            let bytesRead = read(clientSocket, &readBuffer, readBuffer.count)
            guard bytesRead > 0 else { break }

            buffer += String(bytes: readBuffer[0..<bytesRead], encoding: .utf8) ?? ""

            // Process complete lines (NDJSON)
            while let newlineRange = buffer.range(of: "\n") {
                let line = String(buffer[buffer.startIndex..<newlineRange.lowerBound])
                buffer = String(buffer[newlineRange.upperBound...])

                if let response = handler.handle(line: line) {
                    let responseWithNewline = response + "\n"
                    responseWithNewline.withCString { ptr in
                        _ = write(clientSocket, ptr, responseWithNewline.utf8.count)
                    }
                }
            }
        }

        close(clientSocket)
    }

    func stop() {
        if serverSocket >= 0 {
            close(serverSocket)
            unlink(socketPath)
        }
    }

    enum ServerError: Error {
        case socketCreationFailed
        case pathTooLong
        case bindFailed(errno: Int32)
        case listenFailed(errno: Int32)
    }
}
