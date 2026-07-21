// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "ShellularMacOS",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "WindowChromeSupport", targets: ["WindowChromeSupport"]),
    ],
    targets: [
        .target(
            name: "WindowChromeSupport",
            path: "shellular",
            exclude: [
                ".DS_Store",
                "App.swift",
                "Assets.xcassets",
                "Bridge.swift",
                "BrowserService.swift",
                "EmbeddedProxyServer.swift",
                "EmbeddedProxyService.swift",
                "Info.plist",
                "LocalCLIService.swift",
                "ScannerService.swift",
                "Services.swift",
                "ShellularWindow.swift",
                "Shellular.icon",
                "SocketService.swift",
                "WebView.swift",
                "bundle",
                "shellular.direct.entitlements",
                "shellular.entitlements",
            ],
            sources: ["ContextMenuSupport.swift", "NativeThemeColor.swift"]
        ),
        .testTarget(
            name: "WindowChromeSupportTests",
            dependencies: ["WindowChromeSupport"],
            path: "Tests/WindowChromeSupportTests"
        ),
    ]
)
