@testable import WindowChromeSupport
import AppKit
import XCTest

final class DesktopShortcutSupportTests: XCTestCase {
    func testUsesVSCodeTerminalAndNavigationBindings() {
        XCTAssertEqual(DesktopShortcutCatalog.toggleTerminal.key, "`")
        XCTAssertEqual(
            DesktopShortcutCatalog.toggleTerminal.modifiers,
            [.control]
        )
        XCTAssertEqual(DesktopShortcutCatalog.newTerminal.key, "`")
        XCTAssertEqual(
            DesktopShortcutCatalog.newTerminal.modifiers,
            [.control, .shift]
        )
        XCTAssertEqual(
            DesktopShortcutCatalog.showExplorer.modifiers,
            [.command, .shift]
        )
        XCTAssertEqual(
            DesktopShortcutCatalog.showSourceControl.modifiers,
            [.control, .shift]
        )
        XCTAssertEqual(DesktopShortcutCatalog.openFile.key, "o")
        XCTAssertEqual(DesktopShortcutCatalog.save.key, "s")
        XCTAssertEqual(DesktopShortcutCatalog.closeTab.key, "w")
        XCTAssertEqual(DesktopShortcutCatalog.toggleSidebar.key, "b")
        XCTAssertEqual(DesktopShortcutCatalog.settings.key, ",")
    }

    func testParsesResolvedSingleStrokePayload() {
        let resolved = DesktopShortcutCatalog.resolved(payload: [
            "settings": [
                "key": "F6",
                "modifiers": ["ctrl", "shift"],
            ],
            "open-folder": NSNull(),
        ])
        XCTAssertEqual(resolved["settings"]?.key, "f6")
        XCTAssertEqual(
            resolved["settings"]?.modifiers,
            [.control, .shift]
        )
        XCTAssertNil(resolved["open-folder"])
        XCTAssertNil(resolved["toggle-sidebar"])
    }

    func testContextualNewUsesTheActiveCommandAndPreservesDirectBindings() {
        let shortcuts: [String: DesktopNativeShortcut] = [
            "contextual-new": DesktopNativeShortcut(
                command: "contextual-new",
                key: "n",
                modifiers: [.command]
            ),
            "new-file": DesktopNativeShortcut(
                command: "new-file",
                key: "f",
                modifiers: [.control]
            ),
            "new-chat": DesktopNativeShortcut(
                command: "new-chat",
                key: "c",
                modifiers: [.control]
            ),
        ]
        XCTAssertEqual(
            DesktopShortcutCatalog.contextualShortcut(
                for: "new-file",
                contextualCommand: nil,
                shortcuts: shortcuts
            )?.command,
            "contextual-new"
        )
        XCTAssertEqual(
            DesktopShortcutCatalog.contextualShortcut(
                for: "new-chat",
                contextualCommand: nil,
                shortcuts: shortcuts
            )?.key,
            "c"
        )
        XCTAssertEqual(
            DesktopShortcutCatalog.contextualShortcut(
                for: "new-chat",
                contextualCommand: "new-chat",
                shortcuts: shortcuts
            )?.command,
            "contextual-new"
        )
    }
}
