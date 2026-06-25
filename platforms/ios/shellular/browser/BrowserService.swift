import UIKit
import SafariServices
import WebKit

final class BrowserService: BaseService {

    static weak var activeBrowser: BrowserViewController?

    // MARK: - Helper to dispatch events to JavaScript

    private func dispatchEvent(_ eventName: String) {
        DispatchQueue.main.async { [weak self] in
            self?.bridge?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('\(eventName)'))",
                completionHandler: nil
            )
        }
    }

    override func exec(action: String, args: [Any], callback: Callback) {
        switch action {
        case "open":        open(args: args, callback: callback)
        case "openHTML":    openHTML(args: args, callback: callback)
        case "openForAuth": openForAuth(args: args, callback: callback)
        default:            callback.error("Unknown action: \(action)")
        }
    }

    // MARK: - open (devtools browser)

    private func open(args: [Any], callback: Callback) {
        let url = args[safe: 0] as? String
        let theme = (args[safe: 1] as? [String: String]) ?? [:]

        // If browser is already added (and minimized), restore it
        if let browser = Self.activeBrowser, browser.minimized {
            dispatchEvent("browserwillopen")
            DispatchQueue.main.async {
                browser.restoreBrowser(url: url)
            }
            callback.success("restored")
            return
        }

        dispatchEvent("browserwillopen")

        DispatchQueue.main.async { [weak self] in
            guard let parentVC = self?.bridge?.viewController else {
                callback.error("No view controller")
                return
            }
            let browser = BrowserViewController()
            browser.config = BrowserViewController.Config(
                url: url,
                theme: theme,
                mode: "devtools",
                callbackScheme: nil,
                htmlContent: nil
            )
            browser.mainWebView = self?.bridge?.webView

            Self.activeBrowser = browser
            browser.onDismiss = { [weak self] in
                Self.activeBrowser = nil
                self?.dispatchEvent("browserdidclose")
            }

            // Add as child VC
            parentVC.addChild(browser)
            browser.didMove(toParent: parentVC)
            browser.present(animated: true)

            callback.success("ok")
        }
    }

    // MARK: - openHTML (load raw HTML content)

    private func openHTML(args: [Any], callback: Callback) {
        guard let html = args[safe: 0] as? String else {
            callback.error("Missing HTML content")
            return
        }
        let theme = (args[safe: 1] as? [String: String]) ?? [:]

        dispatchEvent("browserwillopen")

        DispatchQueue.main.async { [weak self] in
            guard let parentVC = self?.bridge?.viewController else {
                callback.error("No view controller")
                return
            }
            let browser = BrowserViewController()
            browser.config = BrowserViewController.Config(
                url: nil,
                theme: theme,
                mode: "devtools",
                callbackScheme: nil,
                htmlContent: html
            )
            browser.mainWebView = self?.bridge?.webView

            Self.activeBrowser = browser
            browser.onDismiss = { [weak self] in
                Self.activeBrowser = nil
                self?.dispatchEvent("browserdidclose")
            }

            parentVC.addChild(browser)
            browser.didMove(toParent: parentVC)
            browser.present(animated: true)

            callback.success("ok")
        }
    }

    // MARK: - openForAuth (OAuth flow)

    private func openForAuth(args: [Any], callback: Callback) {
        guard let url = args[safe: 0] as? String else {
            callback.error("Missing URL")
            return
        }
        let callbackScheme = args[safe: 1] as? String
        let useSafari = (args[safe: 2] as? Bool) ?? true

        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.bridge?.viewController else {
                callback.error("No view controller")
                return
            }

            if useSafari {
                self?.openWithSafari(url: url, callbackScheme: callbackScheme, from: vc, callback: callback)
            } else {
                self?.openWithBrowserVC(url: url, callbackScheme: callbackScheme, from: vc, callback: callback)
            }
        }
    }

    private func openWithSafari(url: String, callbackScheme: String?, from vc: UIViewController, callback: Callback) {
        guard let safariURL = URL(string: url) else {
            callback.error("Invalid URL")
            return
        }
        
        // Notify JavaScript that browser is about to open
        dispatchEvent("browserwillopen")
        
        let safari = SFSafariViewController(url: safariURL)
        safari.modalPresentationStyle = .fullScreen
        let previousIntentHandler = AppDelegate.shared?.intentHandler

        // Listen for auth callback via deep link
        AppDelegate.shared?.intentHandler = { [weak safari, weak self] deepURL in
            let scheme = deepURL.scheme ?? ""
            let host = deepURL.host ?? ""

            // Match shellular://auth-callback or custom scheme
            let isAuthCallback = (scheme == "shellular" && host == "auth-callback")
                || (callbackScheme != nil && scheme == callbackScheme)
                || (scheme == "foxbiz" && host == "auth-callback")

            if isAuthCallback {
                safari?.dismiss(animated: true) {
                    // Notify JavaScript that browser closed
                    self?.dispatchEvent("browserdidclose")
                    
                    var params: [String: String] = [:]
                    if let components = URLComponents(url: deepURL, resolvingAgainstBaseURL: false),
                       let items = components.queryItems {
                        for item in items {
                            params[item.name] = item.value ?? ""
                        }
                    }

                    if let json = try? JSONSerialization.data(withJSONObject: [
                        "url": deepURL.absoluteString,
                        "params": params
                    ]),
                       let jsonStr = String(data: json, encoding: .utf8) {
                        callback.success(jsonStr)
                    } else {
                        callback.success(deepURL.absoluteString)
                    }
                }
                AppDelegate.shared?.intentHandler = previousIntentHandler
                return
            }

            previousIntentHandler?(deepURL)
        }

        vc.present(safari, animated: true)
    }

    private func openWithBrowserVC(url: String, callbackScheme: String?, from vc: UIViewController, callback: Callback) {
        // Notify JavaScript that browser is about to open
        dispatchEvent("browserwillopen")
        
        let theme: [String: String] = [:]
        let browser = BrowserViewController()
        browser.config = BrowserViewController.Config(
            url: url,
            theme: theme,
            mode: "auth",
            callbackScheme: callbackScheme,
            htmlContent: nil
        )
        browser.mainWebView = bridge?.webView

        browser.onAuthResult = { resultURL in
            var params: [String: String] = [:]
            if let components = URLComponents(string: resultURL),
               let items = components.queryItems {
                for item in items {
                    params[item.name] = item.value ?? ""
                }
            }

            if let json = try? JSONSerialization.data(withJSONObject: [
                "url": resultURL,
                "params": params
            ]),
               let jsonStr = String(data: json, encoding: .utf8) {
                callback.success(jsonStr)
            } else {
                callback.success(resultURL)
            }
        }

        vc.addChild(browser)
        browser.didMove(toParent: vc)
        browser.present(animated: true)
    }
}
