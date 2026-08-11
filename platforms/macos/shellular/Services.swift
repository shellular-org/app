import AppKit
import AVFoundation
import CryptoKit
import Photos
import UserNotifications
import WebKit

final class ContextMenuService: BaseService {
    private struct Request {
        let id: Int
        let trigger: String
        let anchor: [String: Any]
        let viewport: ContextMenuViewportMetrics
        let items: [[String: Any]]
        let callback: Callback
    }

    private final class MenuCommandReference: NSObject {
        let requestID: Int
        let commandID: String

        init(requestID: Int, commandID: String) {
            self.requestID = requestID
            self.commandID = commandID
        }
    }

    private var coordinator = ContextMenuRequestCoordinator()
    private var requests: [Int: Request] = [:]
    private var activeMenu: NSMenu?
    private var selectedCommands: [Int: String] = [:]

    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "show": show(args, callback)
        case "cancel":
            DispatchQueue.main.async {
                self.apply(self.coordinator.cancelAll(), deferPresentation: true)
                callback.success()
            }
        default: callback.error("Unknown action: \(action)")
        }
    }

    private func show(_ args: [Any], _ callback: Callback) {
        guard let request = args.first as? [String: Any],
              let id = integer(request["id"]),
              let trigger = request["trigger"] as? String,
              ["context", "button", "keyboard"].contains(trigger),
              let rawItems = request["items"] as? [[String: Any]],
              let anchor = request["anchor"] as? [String: Any],
              let rawViewport = request["viewport"] as? [String: Any],
              let viewport = viewport(rawViewport) else {
            return callback.error("Invalid context menu request")
        }
        DispatchQueue.main.async {
            guard self.webView != nil else { return callback.error("No workbench view") }
            guard id > 0,
                  self.requests[id] == nil,
                  self.coordinator.activeID != id,
                  self.coordinator.pendingID != id else {
                return callback.error("Duplicate context menu request")
            }
            guard rawItems.contains(where: { ($0["type"] as? String) != "separator" }) else {
                return callback.success(nil)
            }
            self.requests[id] = Request(
                id: id,
                trigger: trigger,
                anchor: anchor,
                viewport: viewport,
                items: rawItems,
                callback: callback
            )
            self.apply(self.coordinator.submit(id), deferPresentation: false)
        }
    }

    private func present(_ id: Int) {
        guard coordinator.canPresent(id),
              let request = requests[id],
              let webView else {
            apply(coordinator.trackingEnded(id, selection: nil), deferPresentation: true)
            return
        }
        let menu = makeMenu(request.items, requestID: id)
        guard menu.items.contains(where: { !$0.isSeparatorItem }) else {
            apply(coordinator.trackingEnded(id, selection: nil), deferPresentation: true)
            return
        }
        activeMenu = menu
        let point = anchorPoint(for: request, in: webView)
        if request.trigger == "context",
           let event = (webView as? RecentPointerEventProviding)?.recentContextEvent(near: point) {
            NSMenu.popUpContextMenu(menu, with: event, for: webView)
        } else {
            _ = menu.popUp(positioning: nil, at: point, in: webView)
        }
        if activeMenu === menu { activeMenu = nil }
        let selection = selectedCommands.removeValue(forKey: id)
        apply(coordinator.trackingEnded(id, selection: selection), deferPresentation: true)
    }

    private func apply(_ actions: [ContextMenuCoordinatorAction], deferPresentation: Bool) {
        for action in actions {
            switch action {
            case .present(let id):
                if deferPresentation {
                    DispatchQueue.main.async { [weak self] in self?.present(id) }
                } else {
                    present(id)
                }
            case .cancelTracking:
                activeMenu?.cancelTracking()
            case .complete(let id, let command):
                selectedCommands[id] = nil
                requests.removeValue(forKey: id)?.callback.success(command)
            }
        }
    }

    private func anchorPoint(for request: Request, in webView: WKWebView) -> CGPoint {
        let isRectangle = request.anchor["kind"] as? String == "rect"
        let x: CGFloat
        let y: CGFloat
        if isRectangle && request.trigger == "keyboard" {
            x = number(request.anchor["right"])
            y = number(request.anchor["top"])
        } else if isRectangle {
            x = number(request.anchor["left"])
            y = number(request.anchor["bottom"])
        } else {
            x = number(request.anchor["x"])
            y = number(request.anchor["y"])
        }
        return ContextMenuCoordinateConverter.convert(
            CGPoint(x: x, y: y),
            viewport: request.viewport,
            viewBounds: webView.bounds,
            isFlipped: webView.isFlipped
        )
    }

    private func makeMenu(_ rawItems: [[String: Any]], requestID: Int) -> NSMenu {
        let menu = NSMenu(title: "")
        menu.autoenablesItems = false
        menu.showsStateColumn = true
        for raw in rawItems {
            switch raw["type"] as? String {
            case "separator": menu.addItem(.separator())
            case "submenu":
                guard let title = raw["label"] as? String,
                      let children = raw["items"] as? [[String: Any]] else { continue }
                let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
                item.submenu = makeMenu(children, requestID: requestID)
                applyImage(raw["macSymbol"] as? String, to: item)
                menu.addItem(item)
            case "command":
                guard let command = raw["command"] as? String,
                      let title = raw["label"] as? String else { continue }
                let item = NSMenuItem(title: title, action: #selector(selectCommand(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = MenuCommandReference(requestID: requestID, commandID: command)
                item.isEnabled = !(raw["disabled"] as? Bool ?? false)
                if raw["checked"] as? Bool == true { item.state = .on }
                if raw["danger"] as? Bool == true {
                    item.attributedTitle = NSAttributedString(
                        string: title,
                        attributes: [.foregroundColor: NSColor.systemRed]
                    )
                }
                applyImage(raw["macSymbol"] as? String, to: item)
                applyShortcut(raw["shortcut"] as? [String: Any], to: item)
                menu.addItem(item)
            default: continue
            }
        }
        return menu
    }

    private func applyImage(_ symbol: String?, to item: NSMenuItem) {
        guard let symbol, !symbol.isEmpty else { return }
        item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
    }

    private func applyShortcut(_ raw: [String: Any]?, to item: NSMenuItem) {
        guard let key = raw?["key"] as? String else { return }
        item.keyEquivalent = keyEquivalent(key)
        let modifiers = raw?["modifiers"] as? [String] ?? []
        item.keyEquivalentModifierMask = modifiers.reduce(into: NSEvent.ModifierFlags()) { result, value in
            switch value {
            case "meta": result.insert(.command)
            case "ctrl": result.insert(.control)
            case "alt": result.insert(.option)
            case "shift": result.insert(.shift)
            default: break
            }
        }
    }

    private func keyEquivalent(_ key: String) -> String {
        switch key.uppercased() {
        case "F2": return String(Character(UnicodeScalar(NSF2FunctionKey)!))
        case "F12": return String(Character(UnicodeScalar(NSF12FunctionKey)!))
        default: return key.lowercased()
        }
    }

    private func number(_ value: Any?) -> CGFloat {
        if let number = value as? NSNumber { return CGFloat(number.doubleValue) }
        return 0
    }

    private func integer(_ value: Any?) -> Int? {
        (value as? NSNumber)?.intValue
    }

    private func viewport(_ raw: [String: Any]) -> ContextMenuViewportMetrics? {
        let required = [
            "layoutWidth", "layoutHeight", "visualWidth", "visualHeight",
            "visualOffsetLeft", "visualOffsetTop", "visualScale", "deviceScaleFactor"
        ]
        guard required.allSatisfy({ raw[$0] is NSNumber }) else { return nil }
        return ContextMenuViewportMetrics(
            layoutWidth: number(raw["layoutWidth"]),
            layoutHeight: number(raw["layoutHeight"]),
            visualWidth: number(raw["visualWidth"]),
            visualHeight: number(raw["visualHeight"]),
            visualOffsetLeft: number(raw["visualOffsetLeft"]),
            visualOffsetTop: number(raw["visualOffsetTop"]),
            visualScale: number(raw["visualScale"]),
            deviceScaleFactor: number(raw["deviceScaleFactor"])
        )
    }

    @objc private func selectCommand(_ sender: NSMenuItem) {
        guard let reference = sender.representedObject as? MenuCommandReference,
              coordinator.canSelect(reference.requestID) else { return }
        selectedCommands[reference.requestID] = reference.commandID
    }
}

final class NativeService: BaseService {
    private struct DesktopCommandHandler {
        let id: String
        let callback: Callback
    }
    private static var desktopCommandHandler: DesktopCommandHandler?
    private lazy var socket = SocketService(bridge: bridge!)
    static func sendDesktopCommand(_ command: String) {
        DispatchQueue.main.async {
            desktopCommandHandler?.callback.success(command, keep: true)
        }
    }
    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "shareFile": share(items: args.compactMap { ($0 as? String).map { URL(fileURLWithPath: $0) } }, callback)
        case "shareText": share(items: [args[safe: 0] as? String ?? ""], callback)
        case "getAppInfo": callback.success(["label": Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Shellular", "packageName": Bundle.main.bundleIdentifier ?? "", "versionName": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "", "versionCode": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0", "platform":"macos"])
        case "getDeviceInfo": callback.success(["manufacturer":"Apple", "model": Host.current().localizedName ?? "Mac", "product": ProcessInfo.processInfo.operatingSystemVersionString, "isEmulator":false])
        case "openInBrowser": open(args, callback)
        case "setIntentHandler": AppDelegate.shared?.deepLinkHandler = { callback.success($0.absoluteString, keep: true) }; callback.success(nil, keep: true)
        case "setDesktopCommandHandler":
            guard let id = args.first as? String, !id.isEmpty else {
                callback.error("Desktop command registration ID is required")
                return
            }
            Self.desktopCommandHandler?.callback.success()
            Self.desktopCommandHandler = DesktopCommandHandler(id: id, callback: callback)
        case "clearDesktopCommandHandler":
            if let id = args.first as? String, Self.desktopCommandHandler?.id == id {
                Self.desktopCommandHandler?.callback.success()
                Self.desktopCommandHandler = nil
            }
            callback.success()
        case "getDesktopCapabilities": callback.success(["localWorkspace": true, "canPickLocalFiles": true, "canRevealLocalPath": true, "canOpenSystemTerminal": false])
        case "pickLocalFiles": pickLocalFiles(args, callback)
        case "pickLocalDirectory": pickLocalDirectory(args, callback)
        case "revealLocalPath": revealLocalPath(args, callback)
        case "openSystemTerminal": callback.error("System terminal is unavailable")
        case "setWindowTitle":
            let rawTitle = args.first as? String ?? "Shellular"
            DispatchQueue.main.async { self.viewController?.setWindowTitle(rawTitle); callback.success() }
        case "setDesktopShortcutContext":
            let context = args.first as? [String: Any]
            let contextualNew = context?["contextualNew"] as? String
            let shortcuts = context?["shortcuts"] as? [String: Any]
            DispatchQueue.main.async {
                AppDelegate.shared?.updateDesktopShortcutContext(
                    contextualNew,
                    shortcuts: shortcuts
                )
                callback.success()
            }
        case "loadBundledAsset":
            guard let name = args.first as? String,
                  ["monaco/editor.worker.js", "monaco/json.worker.js", "monaco/css.worker.js", "monaco/html.worker.js", "monaco/ts.worker.js"].contains(name),
                  let root = Bundle.main.resourceURL,
                  let source = try? String(contentsOf: root.appendingPathComponent("bundle").appendingPathComponent(name), encoding: .utf8)
            else { return callback.error("Bundled editor worker is unavailable") }
            callback.success(source)
        case "readClipboardText":
            DispatchQueue.main.async {
                callback.success(NSPasteboard.general.string(forType: .string) ?? "")
            }
        case "writeClipboardText":
            let text = args.first as? String ?? ""
            DispatchQueue.main.async {
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                pasteboard.setString(text, forType: .string)
                callback.success()
            }
        case "setTheme":
            guard let value = args.first as? [String: Any] else {
                return callback.error("Theme data is required")
            }
            NSApp.appearance = NSAppearance(
                named: value["type"] as? String == "light" ? .aqua : .darkAqua
            )
            viewController?.setTheme(value)
            callback.success()
        case "requestPermission": permission(args, request: true, callback)
        case "requestPermissions": requestMany(args, callback)
        case "hasPermission": permission(args, request: false, callback)
        case "captureFromCamera": callback.error("Use the Scanner service for camera capture on macOS")
        case "getIpAddresses": callback.success(ipAddresses())
        case "exitApp": DispatchQueue.main.async { NSApp.terminate(nil) }; callback.success()
        case "restartApp": callback.success(); DispatchQueue.main.async { let url = Bundle.main.bundleURL; NSWorkspace.shared.openApplication(at: url, configuration: .init()) { _,_ in NSApp.terminate(nil) } }
        case "getVersionSdkInt": callback.success(0)
        case "setSystemBarColor", "hideSplashScreen", "haptic", "requestIgnoreBatteryOptimization", "setKeyboardSuggestionsEnabled": callback.success()
        case "getConfiguration": callback.success(["keyboard":false, "orientation":"landscape", "locale":Locale.current.identifier.replacingOccurrences(of: "_", with: "-"), "fontScale":1])
        case "startSocketService", "stopSocketService", "isSocketServiceRunning", "postMessageToSocketService", "setAppPaused", "setSocketServiceOnMessageListener", "setSocketServiceOnConnectListener", "setSocketServiceOnDisconnectListener", "setSocketServiceOnErrorListener", "setNewOrderNotificationTitleTemplate", "setNewOrderNotificationMessageTemplate": socket.exec(action: action, args: args, callback: callback)
        default: callback.error("Unknown action: \(action)")
        }
    }
    private func share(items: [Any], _ callback: Callback) { DispatchQueue.main.async { guard let view = self.viewController?.view else { return callback.error("No window") }; NSSharingServicePicker(items: items).show(relativeTo: view.bounds, of: view, preferredEdge: .minY); callback.success() } }
    private func open(_ args: [Any], _ callback: Callback) { guard let s = args.first as? String, let u = URL(string:s) else { return callback.error("Invalid URL") }; NSWorkspace.shared.open(u); callback.success() }
    private func pickLocalFiles(_ args: [Any], _ callback: Callback) {
        DispatchQueue.main.async {
            guard let window = self.viewController?.view.window else { return callback.error("No window") }
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = true
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            if let rootPath = args.first as? String, !rootPath.isEmpty {
                panel.directoryURL = URL(fileURLWithPath: rootPath, isDirectory: true)
            }
            panel.beginSheetModal(for: window) { response in
                guard response == .OK else { return callback.success([]) }
                callback.success(panel.urls.map(\.path))
            }
        }
    }
    private func pickLocalDirectory(_ args: [Any], _ callback: Callback) {
        guard let rootPath = args.first as? String, rootPath.hasPrefix("/") else {
            return callback.error("A local workspace root is required")
        }
        let rootURL = URL(fileURLWithPath: rootPath, isDirectory: true)
            .standardizedFileURL.resolvingSymlinksInPath()
        DispatchQueue.main.async {
            guard let window = self.viewController?.view.window else { return callback.error("No window") }
            let panel = NSOpenPanel()
            panel.title = "Open Folder"
            panel.prompt = "Open"
            panel.allowsMultipleSelection = false
            panel.canChooseFiles = false
            panel.canChooseDirectories = true
            panel.canCreateDirectories = true
            panel.resolvesAliases = true
            panel.directoryURL = rootURL
            panel.beginSheetModal(for: window) { response in
                guard response == .OK else { return callback.success(nil) }
                guard let selected = panel.url?.standardizedFileURL.resolvingSymlinksInPath() else {
                    return callback.success(nil)
                }
                let root = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
                guard selected.path != rootURL.path, selected.path.hasPrefix(root) else {
                    return callback.error("Choose a folder inside the connected workspace root")
                }
                callback.success(selected.path)
            }
        }
    }
    private func revealLocalPath(_ args: [Any], _ callback: Callback) {
        guard let rawPath = args.first as? String, rawPath.hasPrefix("/") else { return callback.error("Absolute path required") }
        let url = URL(fileURLWithPath: rawPath).standardizedFileURL
        guard FileManager.default.fileExists(atPath: url.path) else { return callback.error("Path does not exist") }
        DispatchQueue.main.async {
            NSWorkspace.shared.activateFileViewerSelecting([url])
            callback.success()
        }
    }
    private func permission(_ args: [Any], request: Bool, _ callback: Callback) {
        let p = (args.first as? String ?? "").lowercased()
        if p.contains("camera") {
            if request { AVCaptureDevice.requestAccess(for: .video) { callback.success($0 ? 1 : 0) } }
            else { callback.success(AVCaptureDevice.authorizationStatus(for: .video) == .authorized ? 1 : 0) }
        } else if p.contains("microphone") {
            if request { AVCaptureDevice.requestAccess(for: .audio) { callback.success($0 ? 1 : 0) } }
            else { callback.success(AVCaptureDevice.authorizationStatus(for: .audio) == .authorized ? 1 : 0) }
        } else if p.contains("notification") {
            if request { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in callback.success(granted ? 1 : 0) } }
            else { UNUserNotificationCenter.current().getNotificationSettings { callback.success($0.authorizationStatus == .authorized ? 1 : 0) } }
        } else { callback.success(1) }
    }
    private func requestMany(_ args: [Any], _ callback: Callback) {
        guard let values = args.first as? [String] else { return callback.error("Permissions required") }
        // Mobile-only permission names are granted no-ops on macOS. Camera and
        // microphone are requested by their consuming services before use.
        callback.success(values.map { _ in 1 })
    }
    private func ipAddresses() -> [String] { var out:[String]=[]; var ptr:UnsafeMutablePointer<ifaddrs>?; guard getifaddrs(&ptr)==0 else{return out}; defer{freeifaddrs(ptr)}; var p=ptr; while let x=p { defer{p=x.pointee.ifa_next}; let family=x.pointee.ifa_addr.pointee.sa_family; if family==UInt8(AF_INET)||family==UInt8(AF_INET6){ var h=[CChar](repeating:0,count:Int(NI_MAXHOST)); getnameinfo(x.pointee.ifa_addr,socklen_t(x.pointee.ifa_addr.pointee.sa_len),&h,socklen_t(NI_MAXHOST),nil,0,NI_NUMERICHOST); let s=String(cString:h); if s != "127.0.0.1" && s != "::1" { out.append(s) } } }; return out }
}

final class DeviceService: BaseService { override func exec(action:String,args:[Any],callback:Callback) { guard action=="id" else{return callback.error("Unknown action")}; let id = UserDefaults.standard.string(forKey:"device-id") ?? UUID().uuidString; UserDefaults.standard.set(id,forKey:"device-id"); callback.success("Apple_Mac_\(id)") } }

final class DialogService: BaseService {
    override func exec(action:String,args:[Any],callback:Callback) { DispatchQueue.main.async { let alert=NSAlert(); alert.messageText=args[safe:0] as? String ?? "Shellular"; alert.informativeText=args[safe:1] as? String ?? ""; if action == "prompt" { let field=NSTextField(string:args[safe:2] as? String ?? ""); field.frame.size.width=280; alert.accessoryView=field; alert.addButton(withTitle:"OK"); alert.addButton(withTitle:"Cancel"); callback.success(alert.runModal() == .alertFirstButtonReturn ? field.stringValue:nil) } else { alert.addButton(withTitle:"OK"); if action == "confirm"{alert.addButton(withTitle:"Cancel")}; callback.success(action == "confirm" ? alert.runModal() == .alertFirstButtonReturn : { alert.runModal(); return true }()) } } }
}

final class EncryptionService: BaseService { override func exec(action:String,args:[Any],callback:Callback) { guard let text=args[safe:0] as? String, let password=args[safe:1] as? String, !password.isEmpty else{return callback.error("message and password required")}; let key=Array(password.utf8); if action=="encrypt" { callback.success(Data(Array(text.utf8).enumerated().map{$0.element ^ key[$0.offset % key.count]}).base64EncodedString()) } else if action=="decrypt", let data=Data(base64Encoded:text), let value=String(bytes:data.enumerated().map{$0.element ^ key[$0.offset % key.count]},encoding:.utf8){callback.success(value)} else {callback.error("Invalid encrypted data")} } }

final class SecureStoreService: BaseService {
    private let store = PrivateFileStore(namespace: "secure-store")

    override func exec(action: String, args: [Any], callback: Callback) {
        guard let key = args.first as? String else {
            return callback.error("key required")
        }

        do {
            switch action {
            case "get":
                if let value = try store.get(key) {
                    callback.success(value)
                } else {
                    callback.success(nil)
                }
            case "set":
                guard let value = args[safe: 1] as? String else {
                    return callback.error("value required")
                }
                try store.set(value, forKey: key)
                callback.success()
            case "remove":
                try store.remove(key)
                callback.success()
            default:
                callback.error("Unknown action: \(action)")
            }
        } catch {
            callback.error("Private storage \(action) failed")
        }
    }
}

final class NotificationService: BaseService {
    static let shared = NotificationService(); private var entries:[Int:UNMutableNotificationContent]=[:]; private var listeners:[Int:Callback]=[:]; private var next=1
    private init(){super.init(bridge:Bridge())}; required init(bridge:Bridge){super.init(bridge:bridge)}
    static func sharedInstance(bridge:Bridge)->NotificationService { shared.bridge=bridge; return shared }
    override func exec(action:String,args:[Any],callback:Callback){switch action{case"create":let c=UNMutableNotificationContent();c.title=args[safe:0] as? String ?? "";c.body=args[safe:1] as? String ?? "";c.sound = .default;let id=next;next+=1;entries[id]=c;callback.success(id);case"show":guard let id=args.first as? Int,let c=entries[id]else{return callback.error("Invalid id")};UNUserNotificationCenter.current().add(.init(identifier:String(id),content:c,trigger:nil)){ $0 == nil ? callback.success():callback.error($0!.localizedDescription)};case"hide":if let id=args.first as? Int{UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers:[String(id)])};callback.success();case"delete":if let id=args.first as? Int{entries[id]=nil;listeners[id]=nil;UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers:[String(id)])};callback.success();case"addListener":if let id=args.first as? Int{listeners[id]=callback};callback.success(nil,keep:true);default:callback.error("Unknown action")}}
    func handleTap(_ identifier:String){if let id=Int(identifier){listeners[id]?.success(id,keep:true)}}
}

final class FileHandlerService: BaseService {
    private var root:URL{FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Shellular",isDirectory:true)}
    /// Bridge paths are virtual app-storage paths. A leading slash means the
    /// root of Shellular's private storage, not the root of the startup disk.
    private func url(_ path:String)->URL {
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return root.appendingPathComponent(relative)
    }
    override func exec(action:String,args:[Any],callback:Callback){let fm=FileManager.default;let path=args.first as? String ?? "";let u=url(path);do{try fm.createDirectory(at:root,withIntermediateDirectories:true);switch action{case"read":let d=try Data(contentsOf:u);callback.successBinary(d);case"write":guard let s=args[safe:1] as? String else{throw CocoaError(.fileWriteUnknown)};let data=Data(base64Encoded:s) ?? Data(s.utf8);try data.write(to:u);callback.success();case"delete":try fm.removeItem(at:u);callback.success();case"move":try fm.moveItem(at:u,to:url(args[safe:1] as? String ?? ""));callback.success();case"copy":try fm.copyItem(at:u,to:url(args[safe:1] as? String ?? ""));callback.success();case"list":callback.success(try fm.contentsOfDirectory(atPath:u.path));case"exists":callback.success(fm.fileExists(atPath:u.path) ? 1:0);case"isDirectory":var d:ObjCBool=false;let e=fm.fileExists(atPath:u.path,isDirectory:&d);callback.success(e && d.boolValue ? 1:0);case"isFile":var d:ObjCBool=false;let e=fm.fileExists(atPath:u.path,isDirectory:&d);callback.success(e && !d.boolValue ? 1:0);case"createDirectory":try fm.createDirectory(at:u,withIntermediateDirectories:true);callback.success();case"createFile":fm.createFile(atPath:u.path,contents:nil);callback.success();case"getMetadata":let a=try fm.attributesOfItem(atPath:u.path);callback.success(["size":a[.size] as? Int ?? 0,"modified":(a[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0]);case"resolve":callback.success(u.path);case"toUrl":callback.success(u.absoluteString);case"reveal":NSWorkspace.shared.activateFileViewerSelecting([u]);callback.success(u.path);case"saveToDevice":save(u,callback);case"print":NSWorkspace.shared.open(u);callback.success();case"download":guard let s=args[safe:1] as? String,let remote=URL(string:s)else{return callback.error("URL required")};URLSession.shared.downloadTask(with:remote){temp,_,error in guard let temp else{return callback.error(error?.localizedDescription ?? "Download failed")};do{try? fm.removeItem(at:u);try fm.moveItem(at:temp,to:u);callback.success(u.path)}catch{callback.error(error.localizedDescription)}}.resume();default:callback.error("Unknown action: \(action)")}}catch{callback.error(error.localizedDescription)}}
    private func save(_ source:URL,_ callback:Callback){DispatchQueue.main.async{let p=NSSavePanel();p.nameFieldStringValue=source.lastPathComponent;p.begin{guard $0 == .OK,let dst=p.url else{return callback.error("Cancelled")};do{try? FileManager.default.removeItem(at:dst);try FileManager.default.copyItem(at:source,to:dst);callback.success(dst.path)}catch{callback.error(error.localizedDescription)}}}}
}
