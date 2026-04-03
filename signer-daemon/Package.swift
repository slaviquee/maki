// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "maki-signer",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "maki-signer",
            path: "Sources/SignerDaemon"
        )
    ]
)
