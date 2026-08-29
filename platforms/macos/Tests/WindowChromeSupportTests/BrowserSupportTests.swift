import Security
import WebKit
import XCTest
@testable import WindowChromeSupport

private final class BrowserAttachmentWidthRecordingView: NSView {
    private(set) var assignedWidths: [CGFloat] = []

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        assignedWidths.append(newSize.width)
    }

    func resetAssignedWidths() {
        assignedWidths.removeAll()
    }
}

private final class BrowserOwnedDocumentNavigationProbe: NSObject, WKNavigationDelegate {
    let finished: XCTestExpectation
    private(set) var shellularMainFrameURLs: [URL] = []
    private(set) var failure: Error?

    init(finished: XCTestExpectation) {
        self.finished = finished
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.targetFrame?.isMainFrame != false,
           let url = navigationAction.request.url,
           url.scheme == "shellular" {
            shellularMainFrameURLs.append(url)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finished.fulfill()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        failure = error
        finished.fulfill()
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        failure = error
        finished.fulfill()
    }
}

private final class BrowserTestAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private(set) var requestedURLs: [URL] = []

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        requestedURLs.append(url)
        let css = Data("#marker { color: rgb(12, 34, 56); }".utf8)
        let response = URLResponse(
            url: url,
            mimeType: "text/css",
            expectedContentLength: css.count,
            textEncodingName: "utf-8"
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(css)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

private final class BrowserInspectMenuTarget: NSObject {
    @objc func inspectElement(_ sender: Any?) {}
}

final class BrowserAddressResolverTests: XCTestCase {
    func testPreservesExplicitHTTPAndHTTPSAddresses() {
        XCTAssertEqual(
            BrowserAddressResolver.resolve("http://example.com:8080/a?q=1#result")?.absoluteString,
            "http://example.com:8080/a?q=1#result"
        )
        XCTAssertEqual(
            BrowserAddressResolver.resolve("https://example.com/path")?.absoluteString,
            "https://example.com/path"
        )
    }

    func testDefaultsDevelopmentAddressesToHTTP() {
        let cases = [
            "localhost:3000/path": "http://localhost:3000/path",
            "app.localhost:5173": "http://app.localhost:5173",
            "127.0.0.1:8080": "http://127.0.0.1:8080",
            "10.1.2.3/app": "http://10.1.2.3/app",
            "172.16.0.1": "http://172.16.0.1",
            "192.168.1.8": "http://192.168.1.8",
            "169.254.1.2": "http://169.254.1.2",
            "[::1]:8443/path?q=1#part": "http://[::1]:8443/path?q=1#part",
            "[fd00::1]/": "http://[fd00::1]/",
            "example.com:3000": "http://example.com:3000",
        ]

        for (input, expected) in cases {
            XCTAssertEqual(
                BrowserAddressResolver.resolve(input)?.absoluteString,
                expected,
                input
            )
        }
    }

    func testDefaultsPublicDomainsToHTTPSAndPhrasesToSearch() {
        XCTAssertEqual(
            BrowserAddressResolver.resolve("example.com/docs?q=swift")?.absoluteString,
            "https://example.com/docs?q=swift"
        )
        XCTAssertEqual(
            BrowserAddressResolver.resolve("browser sidebar design")?.host,
            "www.google.com"
        )
        XCTAssertEqual(
            URLComponents(
                url: BrowserAddressResolver.resolve("browser sidebar design")!,
                resolvingAgainstBaseURL: false
            )?.queryItems?.first?.value,
            "browser sidebar design"
        )
    }

    func testNormalizesUnspecifiedDestinationsToLocalhost() {
        XCTAssertEqual(
            BrowserAddressResolver.resolve("0.0.0.0:3000/path")?.absoluteString,
            "http://localhost:3000/path"
        )
        XCTAssertEqual(
            BrowserAddressResolver.resolve("0.0.0.0")?.absoluteString,
            "http://localhost"
        )
        XCTAssertEqual(
            BrowserAddressResolver.resolve("::")?.absoluteString,
            "http://localhost"
        )
        XCTAssertEqual(
            BrowserAddressResolver.resolve("https://[::]:8443/path")?.absoluteString,
            "https://localhost:8443/path"
        )
    }

    func testRejectsDangerousAndUnsupportedSchemes() {
        for input in [
            "javascript:alert(1)",
            "data:text/html,unsafe",
            "file:///etc/passwd",
            "ftp://example.com",
        ] {
            XCTAssertNil(BrowserAddressResolver.resolve(input), input)
        }
    }

    func testPreservesAndRestoresShellularAddresses() {
        XCTAssertEqual(
            BrowserAddressResolver.resolve("shellular://home")?.absoluteString,
            "shellular://home"
        )
        XCTAssertEqual(
            BrowserAddressResolver.resolve("shellular://ports")?.absoluteString,
            "shellular://ports"
        )
        XCTAssertTrue(BrowserAddressResolver.isRestorable("shellular://home"))
        XCTAssertTrue(BrowserAddressResolver.isRestorable("shellular://future-page"))
        XCTAssertFalse(BrowserAddressResolver.isRestorable("shellular:"))
    }
}

final class BrowserOwnedDocumentTests: XCTestCase {
    func testLogicalAddressIsSeparateFromNeutralWebKitBaseURL() {
        for route in ["home", "ports"] {
            let document = BrowserOwnedDocument(
                displayURL: "shellular://\(route)",
                html: "<main id='marker'>\(route)</main>"
            )
            XCTAssertEqual(document.displayURL, "shellular://\(route)")
            XCTAssertNil(document.baseURL)
        }
        XCTAssertTrue(BrowserOwnedDocument.isPhysicalHTMLNavigation(URL(string: "about:blank")!))
        XCTAssertFalse(BrowserOwnedDocument.isPhysicalHTMLNavigation(URL(string: "shellular://home")!))
    }

    func testHomeAndPortsRenderWithoutShellularMainFrameNavigation() {
        let finished = expectation(description: "owned documents finish")
        finished.expectedFulfillmentCount = 2
        let rendered = expectation(description: "owned document DOM renders")
        rendered.expectedFulfillmentCount = 2
        var webViews: [WKWebView] = []
        var probes: [BrowserOwnedDocumentNavigationProbe] = []
        var assetHandlers: [BrowserTestAssetSchemeHandler] = []

        for route in ["home", "ports"] {
            let assetHandler = BrowserTestAssetSchemeHandler()
            let configuration = WKWebViewConfiguration()
            configuration.setURLSchemeHandler(assetHandler, forURLScheme: "shellular")
            let webView = WKWebView(
                frame: NSRect(x: 0, y: 0, width: 400, height: 500),
                configuration: configuration
            )
            let probe = BrowserOwnedDocumentNavigationProbe(finished: finished)
            webView.navigationDelegate = probe
            let document = BrowserOwnedDocument(
                displayURL: "shellular://\(route)",
                html: """
                <!doctype html><link rel="stylesheet" href="shellular://assets/test.css">
                <main id="marker">\(route)</main>
                """
            )
            document.load(in: webView)
            webViews.append(webView)
            probes.append(probe)
            assetHandlers.append(assetHandler)
        }

        wait(for: [finished], timeout: 5)
        for (index, webView) in webViews.enumerated() {
            webView.evaluateJavaScript(
                "document.getElementById('marker')?.textContent + '|' + getComputedStyle(document.getElementById('marker')).color"
            ) { value, error in
                XCTAssertNil(error)
                let route = index == 0 ? "home" : "ports"
                XCTAssertEqual(value as? String, "\(route)|rgb(12, 34, 56)")
                rendered.fulfill()
            }
        }
        wait(for: [rendered], timeout: 5)

        for probe in probes {
            XCTAssertNil(probe.failure)
            XCTAssertTrue(probe.shellularMainFrameURLs.isEmpty)
        }
        for handler in assetHandlers {
            XCTAssertEqual(handler.requestedURLs.map(\.absoluteString), ["shellular://assets/test.css"])
        }
    }
}

final class BrowserDeveloperToolsScriptTests: XCTestCase {
    private static let stubErudaRuntime = """
    window.__stubErudaInitCount = window.__stubErudaInitCount || 0;
    (function(){
      var listeners = {};
      var panel = document.createElement("div");
      panel.className = "eruda-dev-tools";
      panel.style.cssText = "position:fixed;left:0;bottom:0;width:100%;height:45vh;display:none";
      document.documentElement.appendChild(panel);
      var entryButton = {
        hide: function(){ window.__stubErudaEntryHidden = true; }
      };
      var tools = {
        on: function(name, listener){ listeners[name] = listener; }
      };
      var elements = {
        _detail: {
          hide: function(){
            window.__stubErudaElementHighlighted = false;
            window.__stubErudaHighlightClearCount =
              (window.__stubErudaHighlightClearCount || 0) + 1;
          }
        },
        select: function(element){
          window.__stubErudaSelectedElementId = element && element.id;
          window.__stubErudaElementHighlighted = true;
        }
      };
      window.eruda = {
        _shadowRoot: document,
        init: function(options){
          window.__stubErudaInitCount += 1;
          window.__stubErudaOptions = options;
        },
        get: function(name){
          if (name === "entryBtn") return entryButton;
          if (name === "elements") return elements;
          return tools;
        },
        show: function(toolName){
          if (toolName) {
            window.__stubErudaShownTool = toolName;
            return;
          }
          panel.style.display = "block";
          window.__stubErudaVisible = true;
          window.__stubErudaRevealCount = (window.__stubErudaRevealCount || 0) + 1;
          if (listeners.show) listeners.show();
        },
        hide: function(){
          panel.style.display = "none";
          window.__stubErudaVisible = false;
          if (listeners.hide) listeners.hide();
        }
      };
      window.__shellularInstallDeveloperTools = function(options){
        if (window.__shellularDeveloperTools) return window.__shellularDeveloperTools;
        var visible = false;
        var highlighted = false;
        var contextTarget = null;
        var panelPercent = Math.max(25, Math.min(70, options.panelPercent || 45));
        function spacer(){
          var value = document.getElementById("__shellularDeveloperToolsSpacer");
          if (!value) {
            value = document.createElement("div");
            value.id = "__shellularDeveloperToolsSpacer";
          }
          document.body.appendChild(value);
          value.style.display = visible ? "block" : "none";
          value.style.height = visible ? Math.ceil(panel.getBoundingClientRect().height) + "px" : "0px";
          return value;
        }
        function clearHighlight(){
          elements._detail.hide();
          highlighted = false;
          return true;
        }
        var api = {
          version: 1,
          show: function(tool){
            visible = true;
            if (tool) window.eruda.show(tool);
            window.eruda.show();
            spacer();
            return true;
          },
          hide: function(){
            if (highlighted) clearHighlight();
            visible = false;
            window.eruda.hide();
            spacer();
            return true;
          },
          toggle: function(){ return visible ? api.hide() : api.show(); },
          inspectElement: function(target){
            target = target || contextTarget || document.documentElement;
            highlighted = true;
            api.show("elements");
            elements.select(target);
            return true;
          },
          clearHighlight: clearHighlight,
          setPanelPercent: function(value){
            panelPercent = Math.max(25, Math.min(70, value));
            panel.style.height = panelPercent + "vh";
            window.__stubErudaOptions.defaults.displaySize = panelPercent;
            spacer();
            return panelPercent;
          },
          getState: function(){
            return { version: 1, ready: true, visible: visible, panelPercent: panelPercent, highlighted: highlighted };
          }
        };
        document.addEventListener("contextmenu", function(event){ contextTarget = event.target; }, true);
        window.eruda.init({ autoScale: false, defaults: { displaySize: panelPercent, theme: "System preference" } });
        entryButton.hide();
        window.__shellularDeveloperTools = api;
        window.__shellularSetDeveloperToolsVisible = function(value){ return value ? api.show() : api.hide(); };
        window.__shellularInspectContextElement = function(){ return api.inspectElement(); };
        window.__shellularClearElementHighlight = function(){ return api.clearHighlight(); };
        spacer();
        return api;
      };
    })();
    """

    func testVisibilityStateIsIndependentPerTab() {
        var first = BrowserDeveloperToolsState()
        let second = BrowserDeveloperToolsState()

        XCTAssertTrue(first.toggle())
        XCTAssertTrue(first.isVisible)
        XCTAssertFalse(second.isVisible)
        XCTAssertFalse(first.toggle())
        XCTAssertFalse(first.isVisible)

        first.show()
        XCTAssertTrue(first.isVisible)
        XCTAssertFalse(second.isVisible)

        first.showElementHighlight()
        XCTAssertTrue(first.isVisible)
        XCTAssertTrue(first.isElementHighlighted)
        first.clearElementHighlight()
        XCTAssertTrue(first.isVisible)
        XCTAssertFalse(first.isElementHighlighted)

        first.showElementHighlight()
        first.hide()
        XCTAssertFalse(first.isVisible)
        XCTAssertFalse(first.isElementHighlighted)
        XCTAssertFalse(second.isVisible)
    }

    func testDeveloperToolsShortcutSupportsShiftOrOptionCommandI() throws {
        XCTAssertTrue(BrowserDeveloperToolsShortcut.matches(try keyEvent("i", [.command, .option])))
        XCTAssertTrue(BrowserDeveloperToolsShortcut.matches(try keyEvent("I", [.command, .option])))
        XCTAssertTrue(BrowserDeveloperToolsShortcut.matches(try keyEvent("i", [.command, .shift])))
        XCTAssertTrue(BrowserDeveloperToolsShortcut.matches(try keyEvent("I", [.command, .shift])))
        XCTAssertFalse(BrowserDeveloperToolsShortcut.matches(try keyEvent("i", [.command])))
        XCTAssertFalse(BrowserDeveloperToolsShortcut.matches(try keyEvent("i", [.command, .option, .shift])))
        XCTAssertFalse(BrowserDeveloperToolsShortcut.matches(try keyEvent("i", [.command, .control, .shift])))
        XCTAssertFalse(BrowserDeveloperToolsShortcut.matches(try keyEvent("j", [.command, .option])))
        XCTAssertFalse(BrowserDeveloperToolsShortcut.matches(try keyEvent("j", [.command, .shift])))
    }

    func testCreatesDocumentStartMainFrameOnlyUserScript() {
        let script = BrowserDeveloperToolsScript.makeUserScript(
            erudaSource: Self.stubErudaRuntime
        )

        XCTAssertEqual(script.injectionTime, .atDocumentStart)
        XCTAssertTrue(script.isForMainFrameOnly)
        XCTAssertTrue(script.source.contains("__shellularDeveloperTools"))
        XCTAssertTrue(script.source.contains("__shellularInstallDeveloperTools"))
        XCTAssertTrue(script.source.contains("panelPercent: 45.0"))
        XCTAssertTrue(script.source.contains("shellularDeveloperTools"))
        XCTAssertTrue(script.source.contains("document.readyState === \"loading\""))
        XCTAssertTrue(script.source.contains(Self.stubErudaRuntime))
        XCTAssertFalse(script.source.contains("function createMemoryStorage"))
    }

    func testMissingRuntimeFailsWithoutProducingAUserScript() {
        let missingResources = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent(UUID().uuidString, isDirectory: true)

        XCTAssertNil(BrowserDeveloperToolsScript.loadRuntime(resourceURL: missingResources))
        XCTAssertNil(BrowserDeveloperToolsScript.loadRuntime(resourceURL: nil))
    }

    func testRuntimeLoadsFromBundleInsideResourcesDirectory() throws {
        let resources = try makeTemporaryResourcesDirectory()
        let bundle = resources.appendingPathComponent("bundle", isDirectory: true)
        try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
        try "bundled-runtime".write(
            to: bundle.appendingPathComponent("console.js"),
            atomically: true,
            encoding: .utf8
        )

        XCTAssertEqual(
            BrowserDeveloperToolsScript.loadRuntime(resourceURL: resources),
            "bundled-runtime"
        )
    }

    func testRuntimeSkipsEmptyBundleFileAndFallsBackToResourcesRoot() throws {
        let resources = try makeTemporaryResourcesDirectory()
        let bundle = resources.appendingPathComponent("bundle", isDirectory: true)
        try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
        try "".write(
            to: bundle.appendingPathComponent("console.js"),
            atomically: true,
            encoding: .utf8
        )
        try "root-runtime".write(
            to: resources.appendingPathComponent("console.js"),
            atomically: true,
            encoding: .utf8
        )

        XCTAssertEqual(
            BrowserDeveloperToolsScript.loadRuntime(resourceURL: resources),
            "root-runtime"
        )
    }

    func testInjectedRuntimeInitializesOnceAndFollowsVisibilityCommands() throws {
        let loaded = expectation(description: "document loads with developer tools")
        let initialLayout = expectation(description: "hidden spacer follows parsed page content")
        let shown = expectation(description: "developer tools are shown")
        let hidden = expectation(description: "developer tools are hidden")
        let configuration = WKWebViewConfiguration()
        let userScript = BrowserDeveloperToolsScript.makeUserScript(
            erudaSource: Self.stubErudaRuntime
        )
        configuration.userContentController.addUserScript(userScript)
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )
        let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
        webView.navigationDelegate = probe
        webView.loadHTMLString(
            "<!doctype html><body style='margin:0'><main id='hero'>Document</main></body>",
            baseURL: nil
        )

        wait(for: [loaded], timeout: 5)
        XCTAssertNil(probe.failure)
        var initialHeroTop = 0.0
        webView.evaluateJavaScript(Self.snapshotScript) { value, error in
            XCTAssertNil(error)
            do {
                let snapshot = try Self.decodeSnapshot(value)
                initialHeroTop = try XCTUnwrap(snapshot["heroTop"] as? NSNumber).doubleValue
                XCTAssertEqual(snapshot["firstBodyChildId"] as? String, "hero")
                XCTAssertEqual(snapshot["spacerCount"] as? Int, 1)
                XCTAssertEqual(snapshot["spacerDisplay"] as? String, "none")
                XCTAssertEqual(snapshot["spacerHeight"] as? String, "0px")
                XCTAssertEqual(snapshot["spacerIsLast"] as? Bool, true)
            } catch {
                XCTFail("Could not decode initial developer-tools layout: \(error)")
            }
            initialLayout.fulfill()
        }
        wait(for: [initialLayout], timeout: 5)

        webView.evaluateJavaScript(
            BrowserDeveloperToolsScript.visibilityCommand(isVisible: true)
        ) { accepted, error in
            XCTAssertNil(error)
            XCTAssertEqual(accepted as? Bool, true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                webView.evaluateJavaScript(Self.snapshotScript) { value, error in
                    XCTAssertNil(error)
                    do {
                        let snapshot = try Self.decodeSnapshot(value)
                        XCTAssertEqual(snapshot["initCount"] as? Int, 1)
                        XCTAssertEqual(snapshot["entryHidden"] as? Bool, true)
                        XCTAssertEqual(snapshot["visible"] as? Bool, true)
                        XCTAssertEqual(snapshot["displaySize"] as? Int, 45)
                        XCTAssertEqual(snapshot["theme"] as? String, "System preference")
                        XCTAssertNotEqual(snapshot["spacerHeight"] as? String, "0px")
                        XCTAssertEqual(snapshot["spacerDisplay"] as? String, "block")
                        XCTAssertEqual(snapshot["spacerCount"] as? Int, 1)
                        XCTAssertEqual(snapshot["spacerIsLast"] as? Bool, true)
                        XCTAssertEqual(snapshot["firstBodyChildId"] as? String, "hero")
                        XCTAssertEqual(
                            try XCTUnwrap(snapshot["heroTop"] as? NSNumber).doubleValue,
                            initialHeroTop,
                            accuracy: 0.1
                        )
                    } catch {
                        XCTFail("Could not decode developer-tools snapshot: \(error)")
                    }
                    shown.fulfill()
                }
            }
        }
        wait(for: [shown], timeout: 5)

        webView.evaluateJavaScript(userScript.source) { _, error in
            XCTAssertNil(error)
            webView.evaluateJavaScript(
                BrowserDeveloperToolsScript.visibilityCommand(isVisible: false)
            ) { accepted, error in
                XCTAssertNil(error)
                XCTAssertEqual(accepted as? Bool, true)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    webView.evaluateJavaScript(Self.snapshotScript) { value, error in
                        XCTAssertNil(error)
                        do {
                            let snapshot = try Self.decodeSnapshot(value)
                            XCTAssertEqual(snapshot["initCount"] as? Int, 1)
                            XCTAssertEqual(snapshot["visible"] as? Bool, false)
                            XCTAssertEqual(snapshot["spacerHeight"] as? String, "0px")
                            XCTAssertEqual(snapshot["spacerDisplay"] as? String, "none")
                            XCTAssertEqual(snapshot["spacerCount"] as? Int, 1)
                            XCTAssertEqual(snapshot["spacerIsLast"] as? Bool, true)
                            XCTAssertEqual(snapshot["firstBodyChildId"] as? String, "hero")
                            XCTAssertEqual(
                                try XCTUnwrap(snapshot["heroTop"] as? NSNumber).doubleValue,
                                initialHeroTop,
                                accuracy: 0.1
                            )
                        } catch {
                            XCTFail("Could not decode developer-tools snapshot: \(error)")
                        }
                        hidden.fulfill()
                    }
                }
            }
        }
        wait(for: [hidden], timeout: 5)
    }

    func testVisibleSpacerReattachesAfterBodyContentAndBodyReplacement() throws {
        let loaded = expectation(description: "document loads for spacer replacement")
        let verified = expectation(description: "spacer follows replacement content")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            BrowserDeveloperToolsScript.makeUserScript(erudaSource: Self.stubErudaRuntime)
        )
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )
        let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
        webView.navigationDelegate = probe
        webView.loadHTMLString(
            "<!doctype html><body><main id='hero'>Original</main></body>",
            baseURL: nil
        )

        wait(for: [loaded], timeout: 5)
        XCTAssertNil(probe.failure)
        webView.evaluateJavaScript(
            """
            (function(){
              window.__shellularSetDeveloperToolsVisible(true);
              var lateContent = document.createElement("section");
              lateContent.id = "late-content";
              document.body.appendChild(lateContent);
              window.__shellularSetDeveloperToolsVisible(true);
              var spacer = document.getElementById("__shellularDeveloperToolsSpacer");
              var afterAppend = {
                count: document.querySelectorAll("#__shellularDeveloperToolsSpacer").length,
                isLast: document.body.lastElementChild === spacer,
                lateContentPrecedesSpacer: lateContent.nextElementSibling === spacer
              };

              var replacement = document.createElement("body");
              replacement.innerHTML = '<main id="replacement-hero">Replacement</main>';
              document.body.replaceWith(replacement);
              window.__shellularSetDeveloperToolsVisible(true);
              spacer = document.getElementById("__shellularDeveloperToolsSpacer");
              return JSON.stringify({
                afterAppend: afterAppend,
                afterReplacement: {
                  count: document.querySelectorAll("#__shellularDeveloperToolsSpacer").length,
                  isLast: document.body.lastElementChild === spacer,
                  firstBodyChildId: document.body.firstElementChild.id,
                  display: spacer.style.display
                }
              });
            })();
            """
        ) { value, error in
            XCTAssertNil(error)
            do {
                let result = try Self.decodeSnapshot(value)
                let afterAppend = try XCTUnwrap(result["afterAppend"] as? [String: Any])
                XCTAssertEqual(afterAppend["count"] as? Int, 1)
                XCTAssertEqual(afterAppend["isLast"] as? Bool, true)
                XCTAssertEqual(afterAppend["lateContentPrecedesSpacer"] as? Bool, true)

                let afterReplacement = try XCTUnwrap(
                    result["afterReplacement"] as? [String: Any]
                )
                XCTAssertEqual(afterReplacement["count"] as? Int, 1)
                XCTAssertEqual(afterReplacement["isLast"] as? Bool, true)
                XCTAssertEqual(afterReplacement["firstBodyChildId"] as? String, "replacement-hero")
                XCTAssertEqual(afterReplacement["display"] as? String, "block")
            } catch {
                XCTFail("Could not decode replacement spacer layout: \(error)")
            }
            verified.fulfill()
        }
        wait(for: [verified], timeout: 5)
    }

    func testSpacerIsCreatedOnceAtDocumentEndAcrossNavigations() throws {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            BrowserDeveloperToolsScript.makeUserScript(erudaSource: Self.stubErudaRuntime)
        )
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )

        for pageID in ["first-page", "second-page"] {
            let loaded = expectation(description: "\(pageID) loads")
            let verified = expectation(description: "\(pageID) spacer is verified")
            let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
            webView.navigationDelegate = probe
            webView.loadHTMLString(
                "<!doctype html><body><main id='\(pageID)'>Document</main></body>",
                baseURL: nil
            )

            wait(for: [loaded], timeout: 5)
            XCTAssertNil(probe.failure)
            webView.evaluateJavaScript(
                BrowserDeveloperToolsScript.visibilityCommand(isVisible: true)
            ) { accepted, error in
                XCTAssertNil(error)
                XCTAssertEqual(accepted as? Bool, true)
                webView.evaluateJavaScript(Self.snapshotScript) { value, error in
                    XCTAssertNil(error)
                    do {
                        let snapshot = try Self.decodeSnapshot(value)
                        XCTAssertEqual(snapshot["initCount"] as? Int, 1)
                        XCTAssertEqual(snapshot["spacerCount"] as? Int, 1)
                        XCTAssertEqual(snapshot["spacerIsLast"] as? Bool, true)
                        XCTAssertEqual(snapshot["firstBodyChildId"] as? String, pageID)
                    } catch {
                        XCTFail("Could not decode \(pageID) spacer layout: \(error)")
                    }
                    verified.fulfill()
                }
            }
            wait(for: [verified], timeout: 5)
        }
    }

    func testInspectCommandOpensElementsAndSelectsContextTarget() {
        let loaded = expectation(description: "document loads for element inspection")
        let inspected = expectation(description: "context target is inspected")
        let cleared = expectation(description: "element highlight is cleared")
        let closed = expectation(description: "closing tools clears the element highlight")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            BrowserDeveloperToolsScript.makeUserScript(erudaSource: Self.stubErudaRuntime)
        )
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )
        let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
        webView.navigationDelegate = probe
        webView.loadHTMLString(
            "<!doctype html><body><button id='inspect-me'>Inspect me</button></body>",
            baseURL: nil
        )

        wait(for: [loaded], timeout: 5)
        XCTAssertNil(probe.failure)
        webView.evaluateJavaScript(
            "document.getElementById('inspect-me').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));"
        ) { _, error in
            XCTAssertNil(error)
            webView.evaluateJavaScript(
                BrowserDeveloperToolsScript.inspectElementCommand()
            ) { accepted, error in
                XCTAssertNil(error)
                XCTAssertEqual(accepted as? Bool, true)
                webView.evaluateJavaScript(Self.snapshotScript) { value, error in
                    XCTAssertNil(error)
                    do {
                        let snapshot = try Self.decodeSnapshot(value)
                        XCTAssertEqual(snapshot["initCount"] as? Int, 1)
                        XCTAssertEqual(snapshot["visible"] as? Bool, true)
                        XCTAssertEqual(snapshot["shownTool"] as? String, "elements")
                        XCTAssertEqual(snapshot["revealCount"] as? Int, 1)
                        XCTAssertEqual(snapshot["selectedElementId"] as? String, "inspect-me")
                        XCTAssertEqual(snapshot["elementHighlighted"] as? Bool, true)
                    } catch {
                        XCTFail("Could not decode inspection snapshot: \(error)")
                    }
                    inspected.fulfill()
                }
            }
        }
        wait(for: [inspected], timeout: 5)

        webView.evaluateJavaScript(
            BrowserDeveloperToolsScript.clearElementHighlightCommand()
        ) { accepted, error in
            XCTAssertNil(error)
            XCTAssertEqual(accepted as? Bool, true)
            webView.evaluateJavaScript(Self.snapshotScript) { value, error in
                XCTAssertNil(error)
                do {
                    let snapshot = try Self.decodeSnapshot(value)
                    XCTAssertEqual(snapshot["visible"] as? Bool, true)
                    XCTAssertEqual(snapshot["elementHighlighted"] as? Bool, false)
                    XCTAssertEqual(snapshot["highlightClearCount"] as? Int, 1)
                } catch {
                    XCTFail("Could not decode cleared inspection snapshot: \(error)")
                }
                cleared.fulfill()
            }
        }
        wait(for: [cleared], timeout: 5)

        webView.evaluateJavaScript(
            BrowserDeveloperToolsScript.inspectElementCommand()
        ) { accepted, error in
            XCTAssertNil(error)
            XCTAssertEqual(accepted as? Bool, true)
            webView.evaluateJavaScript(
                BrowserDeveloperToolsScript.visibilityCommand(isVisible: false)
            ) { accepted, error in
                XCTAssertNil(error)
                XCTAssertEqual(accepted as? Bool, true)
                webView.evaluateJavaScript(Self.snapshotScript) { value, error in
                    XCTAssertNil(error)
                    do {
                        let snapshot = try Self.decodeSnapshot(value)
                        XCTAssertEqual(snapshot["visible"] as? Bool, false)
                        XCTAssertEqual(snapshot["elementHighlighted"] as? Bool, false)
                        XCTAssertEqual(snapshot["highlightClearCount"] as? Int, 2)
                    } catch {
                        XCTFail("Could not decode closed inspection snapshot: \(error)")
                    }
                    closed.fulfill()
                }
            }
        }
        wait(for: [closed], timeout: 5)
    }

    func testBundledErudaRuntimeBootsInDocumentPage() throws {
        let testFile = URL(fileURLWithPath: #filePath)
        let macOSDirectory = testFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let runtime = try XCTUnwrap(
            BrowserDeveloperToolsScript.loadRuntime(
                resourceURL: macOSDirectory.appendingPathComponent("shellular", isDirectory: true)
            )
        )
        let loaded = expectation(description: "document loads with bundled Eruda")
        let inspected = expectation(description: "bundled Eruda initializes")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            BrowserDeveloperToolsScript.makeUserScript(erudaSource: runtime)
        )
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )
        let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
        webView.navigationDelegate = probe
        webView.loadHTMLString("<!doctype html><body><main>Document</main></body>", baseURL: nil)

        wait(for: [loaded], timeout: 5)
        XCTAssertNil(probe.failure)
        let stateScript = """
        JSON.stringify({
          ready: window.__shellularDeveloperTools?.getState().ready === true,
          version: window.eruda?.version || "",
          selectType: typeof window.eruda?.get("elements")?.select,
          detailHideType: typeof window.eruda?.get("elements")?._detail?.hide,
          clearHighlightType: typeof window.__shellularClearElementHighlight
        })
        """
        func inspectRuntime(remainingAttempts: Int) {
            webView.evaluateJavaScript(stateScript) { value, error in
                do {
                    XCTAssertNil(error)
                    let result = try Self.decodeSnapshot(value)
                    if result["ready"] as? Bool != true, remainingAttempts > 0 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            inspectRuntime(remainingAttempts: remainingAttempts - 1)
                        }
                        return
                    }
                    if result["ready"] as? Bool != true {
                        webView.evaluateJavaScript(runtime) { _, runtimeError in
                            XCTFail(
                                "Bundled console.js did not install its adapter: \(String(describing: runtimeError))"
                            )
                            inspected.fulfill()
                        }
                        return
                    }
                    XCTAssertEqual(result["ready"] as? Bool, true, String(describing: result))
                    XCTAssertFalse((result["version"] as? String ?? "").isEmpty)
                    XCTAssertEqual(result["selectType"] as? String, "function")
                    XCTAssertEqual(result["detailHideType"] as? String, "function")
                    XCTAssertEqual(result["clearHighlightType"] as? String, "function")
                } catch {
                    XCTFail("Could not decode bundled developer-tools state: \(error)")
                }
                inspected.fulfill()
            }
        }
        inspectRuntime(remainingAttempts: 20)
        wait(for: [inspected], timeout: 5)
    }

    func testBundledErudaInspectShowsVisibleElementsPanel() throws {
        let testFile = URL(fileURLWithPath: #filePath)
        let macOSDirectory = testFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let runtime = try XCTUnwrap(
            BrowserDeveloperToolsScript.loadRuntime(
                resourceURL: macOSDirectory.appendingPathComponent("shellular", isDirectory: true)
            )
        )
        let loaded = expectation(description: "document loads with bundled Eruda")
        let panelShown = expectation(description: "bundled Eruda Elements panel becomes visible")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(
            BrowserDeveloperToolsScript.makeUserScript(erudaSource: runtime)
        )
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )
        let hostWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 500),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        hostWindow.contentView = webView
        hostWindow.makeKeyAndOrderFront(nil)
        defer { hostWindow.orderOut(nil) }
        let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
        webView.navigationDelegate = probe
        webView.loadHTMLString(
            "<!doctype html><body><button id='inspect-me'>Inspect me</button></body>",
            baseURL: nil
        )

        wait(for: [loaded], timeout: 5)
        XCTAssertNil(probe.failure)

        func showPanel(remainingAttempts: Int) {
            webView.evaluateJavaScript(
                "window.__shellularDeveloperTools?.getState().ready === true"
            ) { ready, error in
                XCTAssertNil(error)
                if ready as? Bool != true, remainingAttempts > 0 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        showPanel(remainingAttempts: remainingAttempts - 1)
                    }
                    return
                }
                XCTAssertEqual(ready as? Bool, true)
                let inspectScript = """
                document.getElementById("inspect-me")
                  .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
                \(BrowserDeveloperToolsScript.inspectElementCommand())
                """
                webView.evaluateJavaScript(inspectScript) { accepted, error in
                    XCTAssertNil(error)
                    XCTAssertEqual(accepted as? Bool, true)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        let visibilityScript = """
                        (function(){
                          var panel = window.eruda?._shadowRoot?.querySelector(".eruda-dev-tools");
                          var style = panel && window.getComputedStyle(panel);
                          return JSON.stringify({
                            visible: window.__shellularDeveloperTools?.getState().visible === true,
                            highlighted: window.__shellularDeveloperTools?.getState().highlighted === true,
                            internalVisible: window.eruda?._devTools?._isShow === true,
                            currentTool: window.eruda?._devTools?._curTool || "",
                            selectedElementId: window.eruda?.get("elements")?._curNode?.id || "",
                            panelFound: !!panel,
                            display: style?.display || "",
                            visibility: style?.visibility || "",
                            inlineOpacity: Number(panel?.style.opacity || 0),
                            height: panel?.getBoundingClientRect().height || 0
                          });
                        })();
                        """
                        webView.evaluateJavaScript(visibilityScript) { value, error in
                            XCTAssertNil(error)
                            do {
                                let result = try Self.decodeSnapshot(value)
                                XCTAssertEqual(result["visible"] as? Bool, true, String(describing: result))
                                XCTAssertEqual(result["highlighted"] as? Bool, true, String(describing: result))
                                XCTAssertEqual(result["internalVisible"] as? Bool, true, String(describing: result))
                                XCTAssertEqual(result["currentTool"] as? String, "elements", String(describing: result))
                                XCTAssertEqual(result["selectedElementId"] as? String, "inspect-me", String(describing: result))
                                XCTAssertEqual(result["panelFound"] as? Bool, true, String(describing: result))
                                XCTAssertNotEqual(result["display"] as? String, "none", String(describing: result))
                                XCTAssertNotEqual(result["visibility"] as? String, "hidden", String(describing: result))
                                XCTAssertGreaterThan(
                                    (result["inlineOpacity"] as? NSNumber)?.doubleValue ?? 0,
                                    0,
                                    String(describing: result)
                                )
                                XCTAssertGreaterThan(
                                    (result["height"] as? NSNumber)?.doubleValue ?? 0,
                                    0,
                                    String(describing: result)
                                )
                            } catch {
                                XCTFail("Could not inspect bundled developer-tools panel: \(error)")
                            }
                            panelShown.fulfill()
                        }
                    }
                }
            }
        }
        showPanel(remainingAttempts: 20)
        wait(for: [panelShown], timeout: 5)
    }

    func testBundledErudaReadinessMessagePassesNativeValidation() throws {
        let testFile = URL(fileURLWithPath: #filePath)
        let macOSDirectory = testFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let runtime = try XCTUnwrap(
            BrowserDeveloperToolsScript.loadRuntime(
                resourceURL: macOSDirectory.appendingPathComponent("shellular", isDirectory: true)
            )
        )
        let readyMessage = expectation(description: "native receives validated readiness message")
        let configuration = WKWebViewConfiguration()
        let sink = BrowserScriptMessageSink()
        sink.onMessage = { message in
            guard let snapshot = BrowserDeveloperToolsSnapshot(payload: message.body),
                  snapshot.ready else { return }
            XCTAssertFalse(snapshot.isVisible)
            XCTAssertEqual(snapshot.panelPercent, 45)
            readyMessage.fulfill()
        }
        configuration.userContentController.add(
            sink,
            name: BrowserDeveloperToolsScript.messageHandlerName
        )
        configuration.userContentController.addUserScript(
            BrowserDeveloperToolsScript.makeUserScript(erudaSource: runtime)
        )
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 500),
            configuration: configuration
        )
        webView.loadHTMLString("<!doctype html><body><main>Document</main></body>", baseURL: nil)

        wait(for: [readyMessage], timeout: 5)
        withExtendedLifetime(webView) {}
    }

    private static let snapshotScript = """
    JSON.stringify({
      initCount: window.__stubErudaInitCount,
      entryHidden: window.__stubErudaEntryHidden === true,
      visible: window.__stubErudaVisible === true,
      displaySize: window.__stubErudaOptions.defaults.displaySize,
      theme: window.__stubErudaOptions.defaults.theme,
      shownTool: window.__stubErudaShownTool,
      revealCount: window.__stubErudaRevealCount || 0,
      selectedElementId: window.__stubErudaSelectedElementId,
      elementHighlighted: window.__stubErudaElementHighlighted === true,
      highlightClearCount: window.__stubErudaHighlightClearCount || 0,
      spacerHeight: document.getElementById("__shellularDeveloperToolsSpacer").style.height,
      spacerDisplay: document.getElementById("__shellularDeveloperToolsSpacer").style.display,
      spacerCount: document.querySelectorAll("#__shellularDeveloperToolsSpacer").length,
      spacerIsLast: document.body.lastElementChild === document.getElementById("__shellularDeveloperToolsSpacer"),
      firstBodyChildId: document.body.firstElementChild && document.body.firstElementChild.id,
      heroTop: document.getElementById("hero") && document.getElementById("hero").getBoundingClientRect().top
    });
    """

    private static func decodeSnapshot(_ value: Any?) throws -> [String: Any] {
        let json = try XCTUnwrap(value as? String)
        let data = try XCTUnwrap(json.data(using: .utf8))
        return try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
    }

    private func makeTemporaryResourcesDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        addTeardownBlock {
            try? FileManager.default.removeItem(at: directory)
        }
        return directory
    }

    private func keyEvent(
        _ characters: String,
        _ modifiers: NSEvent.ModifierFlags
    ) throws -> NSEvent {
        try XCTUnwrap(
            NSEvent.keyEvent(
                with: .keyDown,
                location: .zero,
                modifierFlags: modifiers,
                timestamp: 0,
                windowNumber: 0,
                context: nil,
                characters: characters,
                charactersIgnoringModifiers: characters,
                isARepeat: false,
                keyCode: 0
            )
        )
    }
}

private final class BrowserScriptMessageSink: NSObject, WKScriptMessageHandler {
    var onMessage: ((WKScriptMessage) -> Void)?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        onMessage?(message)
    }
}

final class BrowserDeveloperToolsStateTests: XCTestCase {
    func testSnapshotValidationAcceptsOnlyTheVersionedNarrowPayload() throws {
        let snapshot = try XCTUnwrap(BrowserDeveloperToolsSnapshot(payload: [
            "version": 1,
            "ready": true,
            "visible": true,
            "panelPercent": 62.5,
            "highlighted": true,
        ]))

        XCTAssertTrue(snapshot.ready)
        XCTAssertTrue(snapshot.isVisible)
        XCTAssertEqual(snapshot.panelPercent, 62.5)
        XCTAssertTrue(snapshot.isElementHighlighted)
        XCTAssertNil(BrowserDeveloperToolsSnapshot(payload: [
            "version": 2,
            "ready": true,
            "visible": false,
            "panelPercent": 45,
            "highlighted": false,
        ]))
        XCTAssertNil(BrowserDeveloperToolsSnapshot(payload: [
            "version": 1,
            "ready": true,
            "visible": false,
            "panelPercent": "45",
            "highlighted": false,
        ]))
        XCTAssertNil(BrowserDeveloperToolsSnapshot(payload: [
            "version": 1,
            "ready": true,
            "visible": false,
            "panelPercent": 45,
            "highlighted": false,
            "command": "navigate",
        ]))
    }

    func testSnapshotAndStateClampPanelSizeAndPreserveFirstLoadPreferences() throws {
        let snapshot = try XCTUnwrap(BrowserDeveloperToolsSnapshot(payload: [
            "version": 1,
            "ready": true,
            "visible": false,
            "panelPercent": 100,
            "highlighted": false,
        ]))
        XCTAssertEqual(snapshot.panelPercent, 70)

        var state = BrowserDeveloperToolsState(panelPercent: 55)
        state.show()
        state.apply(
            snapshot,
            preserveVisibility: true,
            preservePanelPercent: true
        )
        XCTAssertTrue(state.isReady)
        XCTAssertTrue(state.isVisible)
        XCTAssertEqual(state.panelPercent, 55)

        state.apply(snapshot)
        XCTAssertFalse(state.isVisible)
        XCTAssertEqual(state.panelPercent, 70)
        state.setPanelPercent(10)
        XCTAssertEqual(state.panelPercent, 25)
        state.setPanelPercent(.infinity)
        XCTAssertEqual(state.panelPercent, 45)
    }

    func testVisibilityCanBeRequestedWhileRuntimeLoadsButNotAfterFailure() throws {
        var state = BrowserDeveloperToolsState()
        XCTAssertTrue(
            BrowserDeveloperToolsAvailability.canRequestVisibility(
                hasRuntime: true,
                state: state
            )
        )
        XCTAssertFalse(
            BrowserDeveloperToolsAvailability.canRequestVisibility(
                hasRuntime: false,
                state: state
            )
        )

        let failed = try XCTUnwrap(BrowserDeveloperToolsSnapshot(payload: [
            "version": 1,
            "ready": false,
            "visible": false,
            "panelPercent": 45,
            "highlighted": false,
        ]))
        state.apply(failed)
        XCTAssertFalse(
            BrowserDeveloperToolsAvailability.canRequestVisibility(
                hasRuntime: true,
                state: state
            )
        )
    }

    func testPanelPreferencePersistsGloballyWithDefaultAndClamping() throws {
        let suiteName = "BrowserDeveloperToolsStateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = BrowserDeveloperToolsPanelSizeStore(
            defaults: defaults,
            key: "panel"
        )

        XCTAssertEqual(store.load(), 45)
        store.save(63)
        XCTAssertEqual(store.load(), 63)
        store.save(90)
        XCTAssertEqual(store.load(), 70)
        store.save(5)
        XCTAssertEqual(store.load(), 25)
    }

    func testMessageProxyDoesNotRetainItsDelegate() {
        let proxy = BrowserWeakScriptMessageHandler()
        weak var releasedDelegate: BrowserScriptMessageSink?
        autoreleasepool {
            let delegate = BrowserScriptMessageSink()
            releasedDelegate = delegate
            proxy.delegate = delegate
            XCTAssertNotNil(releasedDelegate)
        }
        XCTAssertNil(releasedDelegate)
        XCTAssertNil(proxy.delegate)
    }
}

final class BrowserViewportTests: XCTestCase {
    func testFitUsesTheEntireAvailableViewport() {
        let layout = BrowserViewportMetrics.layout(
            in: CGSize(width: 1_120, height: 680),
            mode: .fit
        )
        XCTAssertEqual(layout.documentSize, CGSize(width: 1_120, height: 680))
        XCTAssertEqual(layout.pageFrame, CGRect(x: 0, y: 0, width: 1_120, height: 680))
        XCTAssertFalse(layout.allowsHorizontalScrolling)
    }

    func testFixedPhoneAndRestoredWindowViewportsAreCenteredWithoutScaling() {
        let phone = BrowserViewportMetrics.layout(
            in: CGSize(width: 1_120, height: 680),
            mode: .phone
        )
        XCTAssertEqual(phone.pageFrame, CGRect(x: 365, y: 0, width: 390, height: 680))
        XCTAssertFalse(phone.allowsHorizontalScrolling)

        let tablet = BrowserViewportMetrics.layout(
            in: CGSize(width: 1_120, height: 680),
            mode: .tablet
        )
        XCTAssertEqual(tablet.pageFrame, CGRect(x: 176, y: 0, width: 768, height: 680))
        XCTAssertFalse(tablet.allowsHorizontalScrolling)
    }

    func testConstrainedSidebarKeepsTrueCSSWidthAndScrollsHorizontally() {
        let layout = BrowserViewportMetrics.layout(
            in: CGSize(width: 360, height: 720),
            mode: .tablet
        )
        XCTAssertEqual(layout.documentSize, CGSize(width: 768, height: 720))
        XCTAssertEqual(layout.pageFrame, CGRect(x: 0, y: 0, width: 768, height: 720))
        XCTAssertTrue(layout.allowsHorizontalScrolling)
    }

    func testCustomViewportWidthsAreNormalizedToSupportedRange() {
        XCTAssertEqual(BrowserViewportMode.fixed(200).normalized, .fixed(320))
        XCTAssertEqual(BrowserViewportMode.fixed(2_500).normalized, .fixed(1_920))
        XCTAssertEqual(BrowserViewportMode.fixed(.nan).normalized, .fit)
    }
}

final class BrowserScreenshotTests: XCTestCase {
    func testSnapshotGeometryExcludesOnlyTheVisibleDiagnosticsPanel() {
        let bounds = CGRect(x: 0, y: 0, width: 390, height: 800)
        XCTAssertEqual(
            BrowserScreenshotMetrics.visiblePageRect(
                in: bounds,
                developerToolsVisible: false,
                panelPercent: 70
            ),
            bounds
        )
        let diagnosticsExcluded = BrowserScreenshotMetrics.visiblePageRect(
            in: bounds,
            developerToolsVisible: true,
            panelPercent: 45
        )
        XCTAssertEqual(diagnosticsExcluded.width, 390, accuracy: 0.001)
        XCTAssertEqual(diagnosticsExcluded.height, 440, accuracy: 0.001)
        XCTAssertEqual(
            BrowserScreenshotMetrics.visiblePageRect(
                in: bounds,
                developerToolsVisible: true,
                panelPercent: 90
            ).height,
            240,
            accuracy: 0.001
        )
    }

    func testPNGEncodingPreservesPixelDimensionsAndReportsFailure() throws {
        let bitmap = try XCTUnwrap(NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: 120,
            pixelsHigh: 80,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bitmapFormat: [],
            bytesPerRow: 0,
            bitsPerPixel: 0
        ))
        let image = NSImage(size: NSSize(width: 120, height: 80))
        image.addRepresentation(bitmap)
        let data = try XCTUnwrap(BrowserScreenshotEncoder.pngData(from: image))
        let encoded = try XCTUnwrap(NSBitmapImageRep(data: data))
        XCTAssertEqual(encoded.pixelsWide, 120)
        XCTAssertEqual(encoded.pixelsHigh, 80)
        XCTAssertNil(BrowserScreenshotEncoder.pngData(from: NSImage(size: .zero)))
    }

    func testSnapshotDimensionsMatchTheDiagnosticsExcludedVisibleArea() throws {
        let loaded = expectation(description: "screenshot page loads")
        let captured = expectation(description: "visible page area is captured")
        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 390, height: 800),
            configuration: WKWebViewConfiguration()
        )
        let probe = BrowserOwnedDocumentNavigationProbe(finished: loaded)
        webView.navigationDelegate = probe
        webView.loadHTMLString(
            "<!doctype html><style>html,body{margin:0;background:#369}</style>",
            baseURL: nil
        )
        wait(for: [loaded], timeout: 5)
        XCTAssertNil(probe.failure)

        let configuration = WKSnapshotConfiguration()
        configuration.rect = BrowserScreenshotMetrics.visiblePageRect(
            in: webView.bounds,
            developerToolsVisible: true,
            panelPercent: 45
        )
        webView.takeSnapshot(with: configuration) { image, error in
            XCTAssertNil(error)
            XCTAssertEqual(image?.size.width ?? 0, 390, accuracy: 0.001)
            XCTAssertEqual(image?.size.height ?? 0, 440, accuracy: 0.001)
            XCTAssertNotNil(image.flatMap { BrowserScreenshotEncoder.pngData(from: $0) })
            captured.fulfill()
        }
        wait(for: [captured], timeout: 5)
    }

    func testSavePanelCancellationDoesNotProduceADestination() {
        let url = URL(fileURLWithPath: "/tmp/screenshot.png")
        XCTAssertNil(BrowserScreenshotSaveDecision.destination(
            for: .cancel,
            selectedURL: url
        ))
        XCTAssertNil(BrowserScreenshotSaveDecision.destination(
            for: .OK,
            selectedURL: nil
        ))
        XCTAssertEqual(
            BrowserScreenshotSaveDecision.destination(for: .OK, selectedURL: url),
            url
        )
    }
}

final class BrowserDeveloperToolsContextMenuTests: XCTestCase {
    func testWebViewUsesOneDynamicMenuItemForInspectAndCloseActions() throws {
        let webView = BrowserInspectableWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 400),
            configuration: WKWebViewConfiguration()
        )
        webView.embeddedDeveloperToolsAvailable = true
        var isVisible = false
        var isElementHighlighted = false
        var inspectCount = 0
        var clearCount = 0
        var closeCount = 0
        webView.developerToolsVisibility = { isVisible }
        webView.elementHighlightVisibility = { isElementHighlighted }
        webView.onInspectElement = {
            inspectCount += 1
            isVisible = true
            isElementHighlighted = true
        }
        webView.onClearElementHighlight = {
            clearCount += 1
            isElementHighlighted = false
        }
        webView.onCloseDeveloperTools = {
            closeCount += 1
            isVisible = false
        }
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Reload", action: nil, keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Go Back", action: nil, keyEquivalent: ""))
        let event = try rightMouseEvent()

        webView.willOpenMenu(menu, with: event)
        webView.willOpenMenu(menu, with: event)

        XCTAssertEqual(menu.items.prefix(2).map(\.title), ["Reload", "Go Back"])
        let developerToolsItems = menu.items.filter {
            $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
        }
        let item = try XCTUnwrap(developerToolsItems.first)
        XCTAssertEqual(developerToolsItems.count, 1)
        XCTAssertEqual(item.title, BrowserDeveloperToolsContextMenu.inspectElementTitle)
        XCTAssertTrue(item.isEnabled)
        let action = try XCTUnwrap(item.action)
        XCTAssertTrue(NSApplication.shared.sendAction(
            action,
            to: item.target,
            from: item
        ))
        XCTAssertEqual(inspectCount, 1)
        XCTAssertEqual(closeCount, 0)

        webView.willOpenMenu(menu, with: event)

        XCTAssertEqual(
            menu.items.filter {
                $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
            }.count,
            1
        )
        XCTAssertTrue(menu.items.first {
            $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
        } === item)
        XCTAssertEqual(item.title, BrowserDeveloperToolsContextMenu.closeDeveloperToolsTitle)
        let clearItem = try XCTUnwrap(menu.items.first {
            $0.identifier == BrowserDeveloperToolsContextMenu.clearElementHighlightIdentifier
        })
        XCTAssertEqual(clearItem.title, BrowserDeveloperToolsContextMenu.clearElementHighlightTitle)
        XCTAssertTrue(NSApplication.shared.sendAction(
            try XCTUnwrap(clearItem.action),
            to: clearItem.target,
            from: clearItem
        ))
        XCTAssertEqual(clearCount, 1)

        webView.willOpenMenu(menu, with: event)

        XCTAssertFalse(menu.items.contains {
            $0.identifier == BrowserDeveloperToolsContextMenu.clearElementHighlightIdentifier
        })
        XCTAssertTrue(NSApplication.shared.sendAction(
            action,
            to: item.target,
            from: item
        ))
        XCTAssertEqual(inspectCount, 1)
        XCTAssertEqual(closeCount, 1)

        webView.willOpenMenu(menu, with: event)

        XCTAssertEqual(item.title, BrowserDeveloperToolsContextMenu.inspectElementTitle)
    }

    func testWebViewMenuForEventFallbackAddsOneInspectItem() throws {
        let webView = BrowserInspectableWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 400),
            configuration: WKWebViewConfiguration()
        )
        webView.embeddedDeveloperToolsAvailable = true

        let menu = try XCTUnwrap(webView.menu(for: try rightMouseEvent()))

        XCTAssertEqual(
            menu.items.filter {
                $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
            }.count,
            1
        )
        XCTAssertEqual(
            menu.items.first {
                $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
            }?.title,
            BrowserDeveloperToolsContextMenu.inspectElementTitle
        )
    }

    func testAddsOneDynamicItemWithoutRemovingExistingMenuActions() {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Reload", action: nil, keyEquivalent: ""))
        let target = BrowserInspectMenuTarget()

        let item = BrowserDeveloperToolsContextMenu.addDeveloperToolsItems(
            to: menu,
            target: target,
            developerToolsAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            clearHighlightAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            isEnabled: true,
            isVisible: false,
            isElementHighlighted: false
        )
        BrowserDeveloperToolsContextMenu.addDeveloperToolsItems(
            to: menu,
            target: target,
            developerToolsAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            clearHighlightAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            isEnabled: true,
            isVisible: true,
            isElementHighlighted: true
        )

        XCTAssertEqual(menu.items.first?.title, "Reload")
        XCTAssertEqual(
            menu.items.filter {
                $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
            }.count,
            1
        )
        XCTAssertEqual(item.title, BrowserDeveloperToolsContextMenu.closeDeveloperToolsTitle)
        XCTAssertEqual(
            menu.items.filter {
                $0.identifier == BrowserDeveloperToolsContextMenu.clearElementHighlightIdentifier
            }.count,
            1
        )
        XCTAssertTrue(menu.items.contains(where: \.isSeparatorItem))
        XCTAssertTrue(item.target === target)
        XCTAssertEqual(item.action, #selector(BrowserInspectMenuTarget.inspectElement(_:)))
        XCTAssertTrue(item.isEnabled)
        XCTAssertNil(item.toolTip)

        BrowserDeveloperToolsContextMenu.addDeveloperToolsItems(
            to: menu,
            target: target,
            developerToolsAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            clearHighlightAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            isEnabled: true,
            isVisible: true,
            isElementHighlighted: false
        )
        XCTAssertFalse(menu.items.contains {
            $0.identifier == BrowserDeveloperToolsContextMenu.clearElementHighlightIdentifier
        })
    }

    func testReusesAndDisablesAnExistingInspectElementItemWhenRuntimeIsMissing() {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(
            title: BrowserDeveloperToolsContextMenu.inspectElementTitle,
            action: nil,
            keyEquivalent: ""
        ))
        let target = BrowserInspectMenuTarget()

        let item = BrowserDeveloperToolsContextMenu.addDeveloperToolsItems(
            to: menu,
            target: target,
            developerToolsAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            clearHighlightAction: #selector(BrowserInspectMenuTarget.inspectElement(_:)),
            isEnabled: false,
            isVisible: false,
            isElementHighlighted: false
        )

        XCTAssertEqual(menu.items.count, 1)
        XCTAssertFalse(item.isEnabled)
        XCTAssertNil(item.target)
        XCTAssertNil(item.action)
        XCTAssertEqual(item.toolTip, BrowserDeveloperToolsContextMenu.unavailableToolTip)
        XCTAssertEqual(item.identifier, BrowserDeveloperToolsContextMenu.developerToolsIdentifier)
    }

    func testDifferentWebViewsUseTheirIndependentVisibilityState() throws {
        let closedWebView = makeWebView(isVisible: false, isElementHighlighted: false)
        let openWebView = makeWebView(isVisible: true, isElementHighlighted: true)
        let event = try rightMouseEvent()
        let closedMenu = NSMenu()
        let openMenu = NSMenu()

        closedWebView.willOpenMenu(closedMenu, with: event)
        openWebView.willOpenMenu(openMenu, with: event)

        XCTAssertEqual(
            closedMenu.items.first {
                $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
            }?.title,
            BrowserDeveloperToolsContextMenu.inspectElementTitle
        )
        XCTAssertEqual(
            openMenu.items.first {
                $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
            }?.title,
            BrowserDeveloperToolsContextMenu.closeDeveloperToolsTitle
        )
        XCTAssertFalse(closedMenu.items.contains {
            $0.identifier == BrowserDeveloperToolsContextMenu.clearElementHighlightIdentifier
        })
        XCTAssertTrue(openMenu.items.contains {
            $0.identifier == BrowserDeveloperToolsContextMenu.clearElementHighlightIdentifier
        })
    }

    func testMenuActionRechecksLiveVisibilityBeforeDispatch() throws {
        let webView = BrowserInspectableWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 400),
            configuration: WKWebViewConfiguration()
        )
        webView.embeddedDeveloperToolsAvailable = true
        var isVisible = false
        var inspectCount = 0
        var closeCount = 0
        webView.developerToolsVisibility = { isVisible }
        webView.onInspectElement = { inspectCount += 1 }
        webView.onCloseDeveloperTools = { closeCount += 1 }
        let menu = NSMenu()
        webView.willOpenMenu(menu, with: try rightMouseEvent())
        let item = try XCTUnwrap(menu.items.first {
            $0.identifier == BrowserDeveloperToolsContextMenu.developerToolsIdentifier
        })

        isVisible = true
        XCTAssertTrue(NSApplication.shared.sendAction(
            try XCTUnwrap(item.action),
            to: item.target,
            from: item
        ))

        XCTAssertEqual(inspectCount, 0)
        XCTAssertEqual(closeCount, 1)
    }

    private func makeWebView(
        isVisible: Bool,
        isElementHighlighted: Bool
    ) -> BrowserInspectableWebView {
        let webView = BrowserInspectableWebView(
            frame: NSRect(x: 0, y: 0, width: 500, height: 400),
            configuration: WKWebViewConfiguration()
        )
        webView.embeddedDeveloperToolsAvailable = true
        webView.developerToolsVisibility = { isVisible }
        webView.elementHighlightVisibility = { isElementHighlighted }
        return webView
    }

    private func rightMouseEvent() throws -> NSEvent {
        try XCTUnwrap(NSEvent.mouseEvent(
            with: .rightMouseDown,
            location: NSPoint(x: 100, y: 100),
            modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: 0,
            context: nil,
            eventNumber: 1,
            clickCount: 1,
            pressure: 1
        ))
    }
}

final class BrowserChromeThemeTests: XCTestCase {
    func testPaletteUsesShellularTokensAndSeparatorFallbacks() {
        let palette = BrowserChromePalette([
            "primary": "#102030",
            "surfaceSoft": "#20304080",
            "primaryText": "#f0f1f2",
            "secondaryText": "#a0a1a2",
            "lineSoft": "#33445566",
            "accent": "#4488ff",
            "danger": "#dd3344",
        ])

        assertColor(palette.primary, red: 0x10, green: 0x20, blue: 0x30, alpha: 0xff)
        assertColor(palette.surfaceSoft, red: 0x20, green: 0x30, blue: 0x40, alpha: 0x80)
        assertColor(palette.separator, red: 0x33, green: 0x44, blue: 0x55, alpha: 0x66)

        let cardFallback = BrowserChromePalette(["cardBorder": "#556677"])
        assertColor(cardFallback.separator, red: 0x55, green: 0x66, blue: 0x77, alpha: 0xff)
    }

    func testPaletteChromeBackgroundMatchesWorkbenchCSSMix() throws {
        let palette = BrowserChromePalette([
            "primary": "#000000",
            "secondary": "#ffffff",
        ])
        let chrome = try XCTUnwrap(palette.chromeBackground.usingColorSpace(.sRGB))
        XCTAssertEqual(chrome.redComponent, 0.94, accuracy: 0.002)
        XCTAssertEqual(chrome.greenComponent, 0.94, accuracy: 0.002)
        XCTAssertEqual(chrome.blueComponent, 0.94, accuracy: 0.002)

        let fallback = BrowserChromePalette([
            "primary": "#000000",
            "surfaceSoft": "#ffffff",
        ])
        let fallbackChrome = try XCTUnwrap(fallback.chromeBackground.usingColorSpace(.sRGB))
        XCTAssertEqual(fallbackChrome.redComponent, 0.94, accuracy: 0.002)
    }

    func testThemeScriptProducesSafeKebabCaseCSSVariables() throws {
        let injection = #"";window.shellularThemeEscape=true;//"#
        let variables = BrowserThemeScript.variables(from: [
            "primaryText": "#ffffff",
            "surfaceSoft": "rgba(1, 2, 3, 0.5)",
            "untrusted": injection,
            "ignored": 42,
        ])

        XCTAssertEqual(variables["--primary-text"], "#ffffff")
        XCTAssertEqual(variables["--surface-soft"], "rgba(1, 2, 3, 0.5)")
        XCTAssertEqual(variables["--untrusted"], injection)
        XCTAssertNil(variables["--ignored"])

        let script = try XCTUnwrap(BrowserThemeScript.make(from: ["untrusted": injection]))
        XCTAssertTrue(script.contains("root.style.setProperty"))
        XCTAssertFalse(script.contains(#""--untrusted":"";window"#))
    }

    func testAddressBarUsesFocusAndValidationThemeStates() {
        let palette = BrowserChromePalette([
            "primary": "#111111",
            "surfaceSoft": "#222222",
            "primaryText": "#eeeeee",
            "secondaryText": "#aaaaaa",
            "lineSoft": "#333333",
            "accent": "#4488ff",
            "danger": "#dd3344",
        ])
        let addressBar = BrowserAddressBar(frame: NSRect(x: 0, y: 0, width: 320, height: 36))
        addressBar.applyPalette(palette)
        addressBar.layoutSubtreeIfNeeded()

        XCTAssertFalse(addressBar.isFocused)
        XCTAssertFalse(addressBar.hasValidationError)
        XCTAssertFalse(addressBar.hasAmbiguousLayout)
        XCTAssertGreaterThan(addressBar.textField.frame.width, 0)

        addressBar.setFocused(true)
        XCTAssertTrue(addressBar.isFocused)
        addressBar.setValidationError(true)
        XCTAssertTrue(addressBar.hasValidationError)
        XCTAssertEqual(addressBar.textField.textColor, palette.danger)
        addressBar.setValidationError(false)
        XCTAssertEqual(addressBar.textField.textColor, palette.primaryText)
    }

    func testUnifiedTabHeaderFitsSidebarAndWindowPresentations() {
        for width: CGFloat in [280, 400, 720] {
            for presentation: BrowserPresentation in [.sidebar, .window] {
                let header = BrowserTabHeaderView(
                    frame: NSRect(x: 0, y: 0, width: width, height: 40)
                )
                for tabWidth: CGFloat in [90, 160, 220] {
                    let tab = NSView()
                    tab.translatesAutoresizingMaskIntoConstraints = false
                    tab.widthAnchor.constraint(equalToConstant: tabWidth).isActive = true
                    tab.heightAnchor.constraint(equalToConstant: 29).isActive = true
                    header.tabStack.addArrangedSubview(tab)
                }
                header.applyPresentation(presentation)
                header.layoutSubtreeIfNeeded()

                XCTAssertFalse(header.hasAmbiguousLayout, "\(presentation), width: \(width)")
                XCTAssertFalse(header.tabStack.hasAmbiguousLayout, "\(presentation), width: \(width)")
                XCTAssertGreaterThan(header.tabStack.frame.width, 0)
                XCTAssertEqual(header.closeButton.isHidden, presentation == .window)
                for button in [
                    header.addButton,
                    header.tabListButton,
                    header.presentationButton,
                ] {
                    XCTAssertEqual(button.frame.width, 30, accuracy: 0.001)
                    XCTAssertLessThanOrEqual(button.frame.maxX, width)
                }
            }
        }
    }

    func testTabItemsRemainStableAcrossStateUpdatesAndDispatchActionsOnce() throws {
        let header = BrowserTabHeaderView(frame: NSRect(x: 0, y: 0, width: 400, height: 40))
        let palette = BrowserChromePalette([
            "primary": "#101010",
            "secondary": "#202020",
            "surfaceSoft": "#303030",
            "primaryText": "#ffffff",
            "secondaryText": "#aaaaaa",
        ])
        header.applyPalette(palette)
        var selected: [String] = []
        var closed: [String] = []
        let select: (String) -> Void = { selected.append($0) }
        let close: (String) -> Void = { closed.append($0) }
        header.reconcileTabs([
            BrowserTabItemState(id: "first", title: "First", isSelected: true, statusColor: .systemGreen),
            BrowserTabItemState(id: "second", title: "Second", isSelected: false, statusColor: .systemOrange),
        ], onSelect: select, onClose: close)
        header.layoutSubtreeIfNeeded()

        let first = try XCTUnwrap(header.tabItem(withID: "first"))
        let second = try XCTUnwrap(header.tabItem(withID: "second"))
        XCTAssertTrue(second.accessibilityPerformPress())
        second.closeButton.performClick(nil)
        XCTAssertEqual(selected, ["second"])
        XCTAssertEqual(closed, ["second"])

        header.reconcileTabs([
            BrowserTabItemState(id: "first", title: "Renamed", isSelected: false, statusColor: .systemOrange),
            BrowserTabItemState(id: "second", title: "Second", isSelected: true, statusColor: .systemGreen),
        ], onSelect: select, onClose: close)
        header.layoutSubtreeIfNeeded()

        XCTAssertTrue(header.tabItem(withID: "first") === first)
        XCTAssertTrue(header.tabItem(withID: "second") === second)
        XCTAssertFalse(first.isSelected)
        XCTAssertTrue(second.isSelected)
        XCTAssertEqual(first.displayedTitle, "Renamed")
        XCTAssertTrue(second.accessibilityPerformPress())
        XCTAssertEqual(selected, ["second", "second"])
    }

    func testTabReconciliationPreservesUnaffectedItemsAndOrdering() throws {
        let header = BrowserTabHeaderView(frame: NSRect(x: 0, y: 0, width: 400, height: 40))
        let noAction: (String) -> Void = { _ in }
        let state: (String) -> BrowserTabItemState = {
            BrowserTabItemState(id: $0, title: $0, isSelected: $0 == "a", statusColor: .systemGreen)
        }
        header.reconcileTabs([state("a"), state("b"), state("c")], onSelect: noAction, onClose: noAction)
        let a = try XCTUnwrap(header.tabItem(withID: "a"))
        let c = try XCTUnwrap(header.tabItem(withID: "c"))

        header.reconcileTabs([state("c"), state("a"), state("d")], onSelect: noAction, onClose: noAction)
        XCTAssertTrue(header.tabItem(withID: "a") === a)
        XCTAssertTrue(header.tabItem(withID: "c") === c)
        XCTAssertNil(header.tabItem(withID: "b"))
        XCTAssertEqual(
            header.tabStack.arrangedSubviews.compactMap { ($0 as? BrowserTabItemView)?.id },
            ["c", "a", "d"]
        )
    }

    func testTabHoverRemainsActiveAcrossTitleAndCloseButton() throws {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 80),
            styleMask: [.titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 80))
        let header = BrowserTabHeaderView(frame: .zero)
        container.addSubview(header)
        NSLayoutConstraint.activate([
            header.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            header.topAnchor.constraint(equalTo: container.topAnchor),
        ])
        window.contentView = container
        window.makeKeyAndOrderFront(nil)
        defer { window.orderOut(nil) }

        let palette = BrowserChromePalette([
            "primary": "#101114",
            "surfaceSoft": "#24262c",
            "primaryText": "#fefefe",
            "secondaryText": "#777980",
        ])
        header.applyPalette(palette)
        header.reconcileTabs([
            BrowserTabItemState(id: "tab", title: "Readable", isSelected: false, statusColor: .systemGreen),
        ], onSelect: { _ in }, onClose: { _ in })
        container.layoutSubtreeIfNeeded()
        header.layoutSubtreeIfNeeded()

        let item = try XCTUnwrap(header.tabItem(withID: "tab"))
        let edge = item.selectionButton.convert(
            NSPoint(x: 2, y: item.selectionButton.bounds.midY),
            to: nil
        )
        let event = try XCTUnwrap(NSEvent.mouseEvent(
            with: .mouseMoved,
            location: edge,
            modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: window.windowNumber,
            context: nil,
            eventNumber: 1,
            clickCount: 0,
            pressure: 0
        ))
        item.selectionButton.mouseEntered(with: event)

        XCTAssertTrue(item.isHoverHighlighted)
        let titlePoint = item.convert(
            NSPoint(x: item.titleFrame.midX, y: item.titleFrame.midY),
            to: header
        )
        let headerPoint = header.superview.map { header.convert(titlePoint, to: $0) } ?? titlePoint
        XCTAssertTrue(header.hitTest(headerPoint) === item.selectionButton)
        XCTAssertTrue(item.isHoverHighlighted)
        assertColor(item.displayedTextColor, red: 254, green: 254, blue: 254, alpha: 255)

        item.selectionButton.mouseExited(with: event)
        XCTAssertFalse(item.isHoverHighlighted)
        item.closeButton.mouseEntered(with: event)
        XCTAssertTrue(item.isHoverHighlighted)
        assertColor(item.displayedTextColor, red: 254, green: 254, blue: 254, alpha: 255)
        item.closeButton.mouseExited(with: event)
        XCTAssertFalse(item.isHoverHighlighted)
    }

    func testTabStateColorsAreOpaqueAndReadableInLightAndDarkPalettes() {
        let palettes = [
            BrowserChromePalette([
                "primary": "#0d0d0f",
                "secondary": "#1b1b1f",
                "primaryText": "#f5f1e8",
                "secondaryText": "rgba(222, 214, 200, 0.66)",
                "surfaceSoft": "rgba(245, 241, 232, 0.05)",
                "accent": "#d6c2a1",
            ]),
            BrowserChromePalette([
                "primary": "#f2f2f7",
                "secondary": "#ffffff",
                "primaryText": "#000000",
                "secondaryText": "#3c3c43",
                "surfaceSoft": "rgba(60, 60, 67, 0.06)",
                "accent": "#5856d6",
            ]),
        ]

        for palette in palettes {
            for background in [
                palette.tabHoverBackground,
                palette.tabSelectedBackground,
                palette.tabPressedBackground,
            ] {
                XCTAssertEqual(
                    background.usingColorSpace(.sRGB)?.alphaComponent ?? -1,
                    1,
                    accuracy: 0.001
                )
                XCTAssertGreaterThanOrEqual(
                    contrastRatio(palette.primaryText, background),
                    4.5
                )
            }
        }
    }

    func testTabControlsOwnClicksInsteadOfMovingWindow() throws {
        let header = BrowserTabHeaderView(frame: NSRect(x: 0, y: 0, width: 400, height: 40))
        header.reconcileTabs([
            BrowserTabItemState(id: "tab", title: "Tab", isSelected: true, statusColor: .systemGreen),
        ], onSelect: { _ in }, onClose: { _ in })
        header.layoutSubtreeIfNeeded()
        let item = try XCTUnwrap(header.tabItem(withID: "tab"))
        let point = item.convert(NSPoint(x: item.bounds.midX, y: item.bounds.midY), to: header)
        let closePoint = item.closeButton.convert(
            NSPoint(x: item.closeButton.bounds.midX, y: item.closeButton.bounds.midY),
            to: header
        )
        let titlePoint = item.convert(
            NSPoint(x: item.titleFrame.midX, y: item.titleFrame.midY),
            to: header
        )
        let statusPoint = item.convert(
            NSPoint(x: item.statusFrame.midX, y: item.statusFrame.midY),
            to: header
        )
        let edgePoint = item.convert(
            NSPoint(x: 2, y: item.bounds.midY),
            to: header
        )

        XCTAssertTrue(header.hitTest(point) === item.selectionButton)
        XCTAssertTrue(header.hitTest(titlePoint) === item.selectionButton)
        XCTAssertTrue(header.hitTest(statusPoint) === item.selectionButton)
        XCTAssertTrue(header.hitTest(edgePoint) === item.selectionButton)
        XCTAssertTrue(header.hitTest(closePoint) === item.closeButton)
        XCTAssertFalse(header.mouseDownCanMoveWindow)
        XCTAssertFalse(item.mouseDownCanMoveWindow)
        XCTAssertFalse(item.selectionButton.mouseDownCanMoveWindow)
        XCTAssertFalse(item.closeButton.mouseDownCanMoveWindow)
    }

    func testRealWindowHitTestingRoutesTabsInBothPresentations() throws {
        for presentation: BrowserPresentation in [.sidebar, .window] {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 500, height: 80),
                styleMask: [.titled, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            window.isMovableByWindowBackground = false
            let container = NSView(frame: NSRect(x: 0, y: 0, width: 500, height: 80))
            let header = BrowserTabHeaderView(frame: .zero)
            container.addSubview(header)
            NSLayoutConstraint.activate([
                header.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                header.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                header.topAnchor.constraint(equalTo: container.topAnchor),
            ])
            window.contentView = container
            window.makeKeyAndOrderFront(nil)
            defer { window.orderOut(nil) }
            header.applyPresentation(presentation)
            var selections: [String] = []
            var closes: [String] = []
            header.reconcileTabs([
                BrowserTabItemState(id: "first", title: "First", isSelected: true, statusColor: .systemGreen),
                BrowserTabItemState(id: "second", title: "Second", isSelected: false, statusColor: .systemGreen),
            ], onSelect: { selections.append($0) }, onClose: { closes.append($0) })
            container.layoutSubtreeIfNeeded()
            header.layoutSubtreeIfNeeded()
            let second = try XCTUnwrap(header.tabItem(withID: "second"))
            routeClick(to: second.selectionButton, through: header, in: window)
            XCTAssertEqual(selections, ["second"], "presentation: \(presentation)")
            routeClick(to: second.closeButton, through: header, in: window)
            XCTAssertEqual(closes, ["second"], "presentation: \(presentation)")
        }
    }

    private func assertColor(
        _ color: NSColor,
        red: Int,
        green: Int,
        blue: Int,
        alpha: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard let rgb = color.usingColorSpace(.sRGB) else {
            XCTFail("Expected an sRGB-compatible color", file: file, line: line)
            return
        }
        XCTAssertEqual(rgb.redComponent, CGFloat(red) / 255, accuracy: 0.002, file: file, line: line)
        XCTAssertEqual(rgb.greenComponent, CGFloat(green) / 255, accuracy: 0.002, file: file, line: line)
        XCTAssertEqual(rgb.blueComponent, CGFloat(blue) / 255, accuracy: 0.002, file: file, line: line)
        XCTAssertEqual(rgb.alphaComponent, CGFloat(alpha) / 255, accuracy: 0.002, file: file, line: line)
    }

    private func contrastRatio(_ first: NSColor, _ second: NSColor) -> CGFloat {
        let firstLuminance = relativeLuminance(first)
        let secondLuminance = relativeLuminance(second)
        let lighter = max(firstLuminance, secondLuminance)
        let darker = min(firstLuminance, secondLuminance)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private func relativeLuminance(_ color: NSColor) -> CGFloat {
        guard let rgb = color.usingColorSpace(.sRGB) else { return 0 }
        func linearize(_ channel: CGFloat) -> CGFloat {
            channel <= 0.04045
                ? channel / 12.92
                : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linearize(rgb.redComponent)
            + 0.7152 * linearize(rgb.greenComponent)
            + 0.0722 * linearize(rgb.blueComponent)
    }

    private func routeClick(to view: NSView, through header: NSView, in window: NSWindow) {
        let headerPoint = view.convert(
            NSPoint(x: view.bounds.midX, y: view.bounds.midY),
            to: header
        )
        let location = header.convert(headerPoint, to: nil)
        let hitTestPoint = header.superview.map { header.convert(headerPoint, to: $0) } ?? headerPoint
        let hitView = header.hitTest(hitTestPoint)
        let contentPoint = window.contentView?.convert(location, from: nil) ?? .zero
        let windowHitView = window.contentView?.hitTest(contentPoint)
        XCTAssertTrue(
            hitView === view,
            "hit=\(String(describing: hitView)), header=\(header.frame), item=\(view.frame), point=\(headerPoint)"
        )
        XCTAssertTrue(
            windowHitView === view,
            "windowHit=\(String(describing: windowHitView)), contentPoint=\(contentPoint)"
        )
        (windowHitView as? NSButton)?.performClick(nil)
    }
}

final class BrowserSidebarMetricsTests: XCTestCase {
    func testWebKitWindowLiveResizePolicyUsesAppKitContentPreservation() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 300),
            styleMask: [.titled, .resizable],
            backing: .buffered,
            defer: false
        )
        let host = NSView(frame: window.contentView?.bounds ?? .zero)
        window.preservesContentDuringLiveResize = false
        BrowserLiveResizePolicy.apply(to: window, views: [host])

        XCTAssertTrue(window.preservesContentDuringLiveResize)
        XCTAssertEqual(host.layerContentsRedrawPolicy, .duringViewResize)
    }

    func testResizeUnderlayCoversContentAndChromeWithoutInterceptingClicks() throws {
        let underlay = BrowserResizeUnderlayView(
            frame: NSRect(x: 0, y: 0, width: 400, height: 760)
        )
        let palette = BrowserChromePalette([
            "primary": "#102030",
            "secondary": "#405060",
        ])
        underlay.apply(content: palette.primary, chrome: palette.chromeBackground)
        underlay.layoutSubtreeIfNeeded()

        XCTAssertEqual(underlay.contentFillFrame, underlay.bounds)
        XCTAssertEqual(underlay.chromeFillFrame, NSRect(x: 0, y: 720, width: 400, height: 40))
        XCTAssertEqual(underlay.contentColor, palette.primary)
        XCTAssertEqual(underlay.chromeColor, palette.chromeBackground)
        XCTAssertNil(underlay.hitTest(NSPoint(x: 10, y: 10)))
    }

    func testResizeUnderlayRemainsContiguousAcrossSupportedWidths() {
        let underlay = BrowserResizeUnderlayView(frame: .zero)
        for width in stride(from: CGFloat(280), through: 720, by: 4) {
            underlay.frame = NSRect(x: 0, y: 0, width: width, height: 760)
            underlay.layoutSubtreeIfNeeded()
            XCTAssertEqual(underlay.contentFillFrame, underlay.bounds)
            XCTAssertEqual(underlay.chromeFillFrame.minX, underlay.bounds.minX)
            XCTAssertEqual(underlay.chromeFillFrame.maxX, underlay.bounds.maxX)
            XCTAssertEqual(underlay.chromeFillFrame.maxY, underlay.bounds.maxY)
        }
    }

    func testTitlebarDragRegionIsReadyAtInitialAndMinimumWorkbenchWidths() {
        for width: CGFloat in [360, 700, 1_100] {
            let frame = TitlebarDragRegion.frame(
                in: NSRect(x: 0, y: 0, width: width, height: 760),
                trafficLightTrailingEdge: 82
            )
            XCTAssertGreaterThan(frame.width, 0)
            XCTAssertEqual(frame.height, 40)
            XCTAssertEqual(frame.maxY, 760)
            XCTAssertLessThanOrEqual(frame.maxX, width)
        }
    }

    func testAttachesBrowserDirectlyBetweenNonzeroSidebarAndWindowHosts() {
        let windowHost = NSView(frame: NSRect(x: 0, y: 0, width: 1_120, height: 760))
        let browserView = BrowserAttachmentWidthRecordingView(frame: windowHost.bounds)
        windowHost.addSubview(browserView)
        browserView.resetAssignedWidths()

        for width: CGFloat in [280, 400, 720] {
            let sidebarHost = NSView(frame: NSRect(x: 0, y: 0, width: width, height: 760))

            XCTAssertTrue(BrowserViewAttachment.attach(browserView, to: sidebarHost))
            XCTAssertTrue(browserView.superview === sidebarHost)
            XCTAssertEqual(browserView.frame, sidebarHost.bounds)

            XCTAssertTrue(BrowserViewAttachment.attach(browserView, to: windowHost))
            XCTAssertTrue(browserView.superview === windowHost)
            XCTAssertEqual(browserView.frame, windowHost.bounds)
        }

        XCTAssertFalse(browserView.assignedWidths.contains(0))
    }

    func testDefersAttachmentWhenDestinationHasNoWidth() {
        let sourceHost = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 760))
        let hiddenHost = NSView(frame: NSRect(x: 0, y: 0, width: 0, height: 760))
        let browserView = NSView(frame: sourceHost.bounds)
        sourceHost.addSubview(browserView)

        XCTAssertFalse(BrowserViewAttachment.attach(browserView, to: hiddenHost))
        XCTAssertTrue(browserView.superview === sourceHost)
        XCTAssertEqual(browserView.frame.width, 400)
    }

    func testCompletesDeferredAttachmentAfterHostReceivesItsFirstWidth() {
        let sourceHost = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 760))
        let startupHost = NSView(frame: NSRect(x: 0, y: 0, width: 0, height: 760))
        let browserView = BrowserAttachmentWidthRecordingView(frame: sourceHost.bounds)
        sourceHost.addSubview(browserView)
        browserView.resetAssignedWidths()

        XCTAssertFalse(BrowserViewAttachment.attach(browserView, to: startupHost))
        XCTAssertTrue(browserView.superview === sourceHost)

        startupHost.frame.size.width = 920
        XCTAssertTrue(BrowserViewAttachment.attach(browserView, to: startupHost))
        XCTAssertTrue(browserView.superview === startupHost)
        XCTAssertEqual(browserView.frame, startupHost.bounds)
        XCTAssertFalse(browserView.assignedWidths.contains(0))
    }

    func testSynchronizesHostedContentThroughoutContinuousResize() {
        let workbenchHost = NSView(frame: NSRect(x: 0, y: 0, width: 920, height: 760))
        let sidebarHost = NSView(frame: NSRect(x: 920, y: 0, width: 280, height: 760))
        let workbenchContent = BrowserAttachmentWidthRecordingView(frame: workbenchHost.bounds)
        let sidebarContent = BrowserAttachmentWidthRecordingView(frame: sidebarHost.bounds)
        XCTAssertTrue(BrowserViewAttachment.attach(workbenchContent, to: workbenchHost))
        XCTAssertTrue(BrowserViewAttachment.attach(sidebarContent, to: sidebarHost))
        workbenchContent.resetAssignedWidths()
        sidebarContent.resetAssignedWidths()

        for sidebarWidth in stride(from: CGFloat(280), through: 840, by: 4) {
            workbenchHost.frame = NSRect(
                x: 0,
                y: 0,
                width: 1_200 - sidebarWidth,
                height: 760
            )
            sidebarHost.frame = NSRect(
                x: 1_200 - sidebarWidth,
                y: 0,
                width: sidebarWidth,
                height: 760
            )
            BrowserViewAttachment.synchronize(workbenchContent, with: workbenchHost)
            BrowserViewAttachment.synchronize(sidebarContent, with: sidebarHost)
            XCTAssertEqual(workbenchContent.frame, workbenchHost.bounds)
            XCTAssertEqual(sidebarContent.frame, sidebarHost.bounds)
        }

        XCTAssertFalse(workbenchContent.assignedWidths.contains(0))
        XCTAssertFalse(sidebarContent.assignedWidths.contains(0))
    }

    func testDividerCursorOwnsOnlyItsEightPointBounds() {
        let bounds = NSRect(x: 0, y: 0, width: 8, height: 760)
        XCTAssertEqual(BrowserDividerCursorRegion.rect(in: bounds), bounds)
    }

    func testResizeLifecycleEmitsOneStartAndEndAcrossSources() {
        var lifecycle = BrowserResizeLifecycle()
        XCTAssertTrue(lifecycle.begin(.sidebar))
        XCTAssertFalse(lifecycle.begin(.sidebar))
        XCTAssertFalse(lifecycle.begin(.window))
        XCTAssertFalse(lifecycle.end(.sidebar))
        XCTAssertFalse(lifecycle.end(.sidebar))
        XCTAssertTrue(lifecycle.end(.window))
        XCTAssertFalse(lifecycle.end(.window))
        XCTAssertTrue(lifecycle.activeSources.isEmpty)
    }

    func testHiddenSidebarRetainsItsWidthWithoutOccupyingWorkbenchSpace() {
        let bounds = NSRect(x: 0, y: 0, width: 1_120, height: 760)
        let hidden = BrowserSidebarMetrics.layout(
            in: bounds,
            preferredWidth: 400,
            isVisible: false
        )

        XCTAssertEqual(hidden.workbenchFrame, bounds)
        XCTAssertEqual(hidden.sidebarFrame, NSRect(x: 1_120, y: 0, width: 400, height: 760))

        let visible = BrowserSidebarMetrics.layout(
            in: bounds,
            preferredWidth: hidden.sidebarFrame.width,
            isVisible: true
        )
        XCTAssertEqual(visible.workbenchFrame.width, 720)
        XCTAssertEqual(visible.sidebarFrame, NSRect(x: 720, y: 0, width: 400, height: 760))
    }

    func testBrowserToolbarFitsEverySupportedSidebarWidth() {
        for width: CGFloat in [280, 400, 720] {
            let toolbar = NSStackView(frame: NSRect(x: 0, y: 0, width: width, height: 46))
            toolbar.orientation = .horizontal
            toolbar.alignment = .centerY
            toolbar.distribution = .fill
            toolbar.spacing = 3
            toolbar.edgeInsets = NSEdgeInsets(top: 5, left: 8, bottom: 5, right: 8)

            let leadingButtons = (0..<4).map { _ in NSButton() }
            let trailingButton = NSButton()
            let buttons = leadingButtons + [trailingButton]
            for button in buttons {
                button.translatesAutoresizingMaskIntoConstraints = false
                button.widthAnchor.constraint(equalToConstant: 30).isActive = true
                button.heightAnchor.constraint(equalToConstant: 30).isActive = true
            }
            for button in leadingButtons {
                toolbar.addArrangedSubview(button)
            }

            let addressBar = BrowserAddressBar()
            toolbar.addArrangedSubview(addressBar)
            toolbar.addArrangedSubview(trailingButton)
            toolbar.layoutSubtreeIfNeeded()

            XCTAssertFalse(toolbar.hasAmbiguousLayout, "toolbar width: \(width)")
            XCTAssertGreaterThan(addressBar.frame.width, 0, "toolbar width: \(width)")
            XCTAssertLessThan(
                addressBar.frame.maxX,
                trailingButton.frame.minX,
                "toolbar width: \(width)"
            )
            XCTAssertLessThanOrEqual(trailingButton.frame.maxX, width - 8, "toolbar width: \(width)")
            XCTAssertGreaterThan(addressBar.textField.frame.width, 0, "toolbar width: \(width)")
            for button in buttons {
                XCTAssertEqual(button.frame.width, 30, accuracy: 0.001, "toolbar width: \(width)")
                XCTAssertFalse(button.hasAmbiguousLayout, "toolbar width: \(width)")
            }
        }
    }

    func testBrowserRootKeepsActiveContentVisibleAtSupportedWidths() {
        for width: CGFloat in [280, 400, 720] {
            let root = NSView(frame: NSRect(x: 0, y: 0, width: width, height: 760))
            let stack = NSStackView()
            let content = NSView()
            BrowserRootLayout.configure(stack: stack, content: content)
            stack.translatesAutoresizingMaskIntoConstraints = false
            root.addSubview(stack)
            NSLayoutConstraint.activate([
                stack.leadingAnchor.constraint(equalTo: root.leadingAnchor),
                stack.trailingAnchor.constraint(equalTo: root.trailingAnchor),
                stack.topAnchor.constraint(equalTo: root.topAnchor),
                stack.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            ])

            for height: CGFloat in [40, 46] {
                let chrome = NSView()
                chrome.translatesAutoresizingMaskIntoConstraints = false
                chrome.heightAnchor.constraint(equalToConstant: height).isActive = true
                stack.addArrangedSubview(chrome)
            }
            content.translatesAutoresizingMaskIntoConstraints = false
            stack.addArrangedSubview(content)
            content.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
            let activePage = NSView()
            activePage.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(activePage)
            NSLayoutConstraint.activate([
                activePage.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                activePage.trailingAnchor.constraint(equalTo: content.trailingAnchor),
                activePage.topAnchor.constraint(equalTo: content.topAnchor),
                activePage.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            ])

            root.layoutSubtreeIfNeeded()
            XCTAssertFalse(stack.hasAmbiguousLayout, "width: \(width)")
            XCTAssertFalse(content.hasAmbiguousLayout, "width: \(width)")
            XCTAssertGreaterThan(content.frame.width, 0, "width: \(width)")
            XCTAssertGreaterThan(content.frame.height, 0, "width: \(width)")
            XCTAssertEqual(activePage.frame, content.bounds, "width: \(width)")
        }
    }

    func testClampsWidthAgainstAdaptiveWindowLimits() {
        XCTAssertEqual(
            BrowserSidebarMetrics.clampedWidth(100, containerWidth: 1_200),
            280
        )
        XCTAssertEqual(
            BrowserSidebarMetrics.clampedWidth(900, containerWidth: 1_200),
            840
        )
        XCTAssertEqual(
            BrowserSidebarMetrics.clampedWidth(700, containerWidth: 900),
            540
        )
        XCTAssertEqual(
            BrowserSidebarMetrics.clampedWidth(400, containerWidth: 600),
            280
        )
        XCTAssertEqual(
            BrowserSidebarMetrics.clampedWidth(2_000, containerWidth: 2_400),
            1_680
        )
    }

    func testPresentationTransitionsBetweenSidebarAndWindow() {
        var state = BrowserPresentationState()
        XCTAssertEqual(state.value, .sidebar)

        state.moveToWindow()
        XCTAssertEqual(state.value, .window)

        state.moveToSidebar()
        XCTAssertEqual(state.value, .sidebar)
    }

    func testPersistsAndLoadsSidebarWidth() {
        let suiteName = "BrowserSidebarWidthStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = BrowserSidebarWidthStore(defaults: defaults, key: "width")

        XCTAssertEqual(store.load(), BrowserSidebarMetrics.defaultWidth)
        store.save(1_400)
        XCTAssertEqual(store.load(), 1_400)
    }
}

final class BrowserTrustStateTests: XCTestCase {
    func testTrustEvaluationStartsOnItsRequiredQueue() {
        let queue = DispatchQueue(label: "BrowserTrustStateTests.evaluation")
        let queueKey = DispatchSpecificKey<String>()
        queue.setSpecific(key: queueKey, value: "evaluation")
        let scheduled = expectation(description: "trust evaluation scheduled")

        BrowserTrustEvaluationScheduler.schedule(on: queue) { suppliedQueue in
            XCTAssertTrue(suppliedQueue === queue)
            XCTAssertEqual(DispatchQueue.getSpecific(key: queueKey), "evaluation")
            dispatchPrecondition(condition: .onQueue(suppliedQueue))
            scheduled.fulfill()
        }

        wait(for: [scheduled], timeout: 1)
    }

    func testSecTrustAsyncEvaluationHonorsTheScheduledQueueContract() throws {
        var anchorValues: CFArray?
        XCTAssertEqual(SecTrustCopyAnchorCertificates(&anchorValues), errSecSuccess)
        let certificate = try XCTUnwrap((anchorValues as? [SecCertificate])?.first)
        var trustValue: SecTrust?
        XCTAssertEqual(
            SecTrustCreateWithCertificates(
                certificate,
                SecPolicyCreateBasicX509(),
                &trustValue
            ),
            errSecSuccess
        )
        let trust = try XCTUnwrap(trustValue)
        let queue = DispatchQueue(label: "BrowserTrustStateTests.security-evaluation")
        let evaluated = expectation(description: "Security trust callback")

        BrowserTrustEvaluationScheduler.schedule(on: queue) { suppliedQueue in
            let status = SecTrustEvaluateAsyncWithError(trust, suppliedQueue) {
                _, _, _ in
                dispatchPrecondition(condition: .onQueue(suppliedQueue))
                evaluated.fulfill()
            }
            XCTAssertEqual(status, errSecSuccess)
        }

        wait(for: [evaluated], timeout: 3)
    }

    func testCertificateExceptionRequiresExactHostPortAndFingerprint() {
        let store = BrowserTrustExceptionStore()
        let approved = BrowserTrustException(
            host: "localhost",
            port: 8443,
            certificateFingerprint: "AA:BB"
        )
        store.approve(approved)

        XCTAssertTrue(store.contains(approved))
        XCTAssertFalse(store.contains(.init(
            host: "localhost",
            port: 9443,
            certificateFingerprint: "AA:BB"
        )))
        XCTAssertFalse(store.contains(.init(
            host: "localhost",
            port: 8443,
            certificateFingerprint: "CC:DD"
        )))

        store.removeAll()
        XCTAssertFalse(store.contains(approved))
    }

    func testWarningTokenCanOnlyBeConsumedOnce() {
        let store = BrowserOneTimeTokenStore()
        let token = store.issue()

        XCTAssertTrue(store.consume(token))
        XCTAssertFalse(store.consume(token))
        XCTAssertFalse(store.consume("unknown"))
    }
}
