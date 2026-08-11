import AppKit

struct DesktopNativeShortcut: Equatable {
    let command: String
    let key: String
    let modifiers: NSEvent.ModifierFlags

    init(command: String, key: String, modifiers: NSEvent.ModifierFlags) {
        self.command = command
        self.key = key
        self.modifiers = modifiers
    }

    init?(command: String, payload: Any) {
        guard let raw = payload as? [String: Any],
              let key = raw["key"] as? String,
              !key.isEmpty else { return nil }
        let names = raw["modifiers"] as? [String] ?? []
        var modifiers: NSEvent.ModifierFlags = []
        for name in names {
            switch name {
            case "meta": modifiers.insert(.command)
            case "ctrl": modifiers.insert(.control)
            case "alt": modifiers.insert(.option)
            case "shift": modifiers.insert(.shift)
            default: continue
            }
        }
        self.init(command: command, key: key.lowercased(), modifiers: modifiers)
    }
}

enum DesktopShortcutCatalog {
    static let contextualNew = shortcut("contextual-new", "n", [.command])
    static let newFile = shortcut("new-file", "", [])
    static let newChat = shortcut("new-chat", "", [])
    static let toggleTerminal = shortcut("toggle-terminal", "`", [.control])
    static let newTerminal = shortcut("new-terminal", "`", [.control, .shift])
    static let openFile = shortcut("open-file", "o", [.command])
    static let save = shortcut("save", "s", [.command])
    static let closeTab = shortcut("close-tab", "w", [.command])
    static let undo = shortcut("undo", "z", [.command])
    static let redo = shortcut("redo", "z", [.command, .shift])
    static let cut = shortcut("cut", "x", [.command])
    static let copy = shortcut("copy", "c", [.command])
    static let paste = shortcut("paste", "v", [.command])
    static let selectAll = shortcut("select-all", "a", [.command])
    static let toggleSidebar = shortcut("toggle-sidebar", "b", [.command])
    static let showExplorer = shortcut("show-explorer", "e", [.command, .shift])
    static let projectSearch = shortcut("project-search", "f", [.command, .shift])
    static let showSourceControl = shortcut("show-source-control", "g", [.control, .shift])
    static let settings = shortcut("settings", ",", [.command])

    static let defaults: [String: DesktopNativeShortcut] = [
        contextualNew.command: contextualNew,
        newFile.command: newFile,
        newChat.command: newChat,
        toggleTerminal.command: toggleTerminal,
        newTerminal.command: newTerminal,
        openFile.command: openFile,
        save.command: save,
        closeTab.command: closeTab,
        undo.command: undo,
        redo.command: redo,
        cut.command: cut,
        copy.command: copy,
        paste.command: paste,
        selectAll.command: selectAll,
        toggleSidebar.command: toggleSidebar,
        showExplorer.command: showExplorer,
        projectSearch.command: projectSearch,
        showSourceControl.command: showSourceControl,
        settings.command: settings,
    ]

    static func resolved(
        payload: [String: Any]?
    ) -> [String: DesktopNativeShortcut] {
        guard let payload else { return defaults }
        return payload.reduce(into: [:]) { result, entry in
            if let shortcut = DesktopNativeShortcut(
                command: entry.key,
                payload: entry.value
            ) {
                result[entry.key] = shortcut
            }
        }
    }

    static func contextualShortcut(
        for itemCommand: String,
        contextualCommand: String?,
        shortcuts: [String: DesktopNativeShortcut]
    ) -> DesktopNativeShortcut? {
        guard itemCommand == (contextualCommand == "new-chat" ? "new-chat" : "new-file")
        else { return shortcuts[itemCommand] }
        return shortcuts["contextual-new"] ?? shortcuts[itemCommand]
    }

    private static func shortcut(
        _ command: String,
        _ key: String,
        _ modifiers: NSEvent.ModifierFlags
    ) -> DesktopNativeShortcut {
        DesktopNativeShortcut(command: command, key: key, modifiers: modifiers)
    }
}
