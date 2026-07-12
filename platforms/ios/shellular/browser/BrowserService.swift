import AuthenticationServices
import UIKit
import WebKit

final class BrowserService: BaseService, ASWebAuthenticationPresentationContextProviding {

    static weak var activeBrowser: BrowserViewController?
    private var authSession: ASWebAuthenticationSession?

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

        DispatchQueue.main.async { [weak self] in
            self?.openWithAuthenticationSession(url: url, callbackScheme: callbackScheme, callback: callback)
        }
    }

    private func openWithAuthenticationSession(url: String, callbackScheme: String?, callback: Callback) {
        guard let authURL = URL(string: url) else {
            callback.error("Invalid URL")
            return
        }

        dispatchEvent("browserwillopen")

        authSession?.cancel()
        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: callbackScheme ?? "shellular"
        ) { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.authSession = nil
                self.dispatchEvent("browserdidclose")

                if let callbackURL {
                    guard self.isAuthCallbackURL(callbackURL, callbackScheme: callbackScheme) else {
                        callback.error("Authentication returned an invalid callback URL")
                        return
                    }
                    self.completeAuthCallback(callback: callback, deepURL: callbackURL)
                    return
                }

                if let authError = error as? ASWebAuthenticationSessionError,
                   authError.code == .canceledLogin {
                    callback.error("Authentication was cancelled.")
                } else {
                    callback.error(error?.localizedDescription ?? "Authentication failed.")
                }
            }
        }

        session.presentationContextProvider = self
        authSession = session
        if !session.start() {
            authSession = nil
            dispatchEvent("browserdidclose")
            callback.error("Unable to start authentication session")
        }
    }

    private func isAuthCallbackURL(_ url: URL, callbackScheme: String?) -> Bool {
        let scheme = url.scheme ?? ""
        let host = url.host ?? ""
        return host == "auth-callback"
            && (scheme == "shellular"
                || scheme == "foxbiz"
                || (callbackScheme != nil && scheme == callbackScheme))
    }

    private func completeAuthCallback(callback: Callback, deepURL: URL) {
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

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }

        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
