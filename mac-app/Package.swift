// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpellingLookup",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "SpellingLookup")
    ]
)
