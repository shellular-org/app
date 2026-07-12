import AppKit
import AuthenticationServices
import WebKit

final class BrowserService: BaseService, ASWebAuthenticationPresentationContextProviding {
    private var authSession: ASWebAuthenticationSession?
    private var browserWindows: [BrowserWindowController] = []
    override func exec(action:String,args:[Any],callback:Callback){switch action{case"open":open(args,html:false,callback);case"openHTML":open(args,html:true,callback);case"openForAuth":auth(args,callback);default:callback.error("Unknown action: \(action)")}}
    private func open(_ args:[Any],html:Bool,_ callback:Callback){DispatchQueue.main.async{let controller=BrowserWindowController();if html{controller.loadHTML(args.first as? String ?? "")}else if let s=args.first as? String,let u=URL(string:s){controller.load(u)}else{return callback.error("Invalid URL")};controller.onClose = { [weak self, weak controller] in if let controller { self?.browserWindows.removeAll { $0 === controller } } };self.browserWindows.append(controller);controller.showWindow(nil);NSApp.activate(ignoringOtherApps:true);callback.success()}}
    private func auth(_ args:[Any],_ callback:Callback){
        guard let s=args.first as? String,let url=URL(string:s)else{return callback.error("Invalid URL")}
        let scheme=args[safe:1] as? String ?? "shellular"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('browserwillopen'))")
            self.authSession?.cancel()
            self.authSession=ASWebAuthenticationSession(url:url,callbackURLScheme:scheme){url,error in
                DispatchQueue.main.async {
                    self.authSession=nil
                    self.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('browserdidclose'))")
                    guard let url else { return callback.error(error?.localizedDescription ?? "Authentication cancelled") }
                    guard url.scheme == scheme, url.host == "auth-callback" else { return callback.error("Authentication returned an invalid callback URL") }
                    var params:[String:String]=[:]
                    URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.forEach { params[$0.name]=$0.value ?? "" }
                    guard let data=try? JSONSerialization.data(withJSONObject:["url":url.absoluteString,"params":params]),let json=String(data:data,encoding:.utf8) else { return callback.error("Could not decode authentication callback") }
                    callback.success(json)
                }
            }
            self.authSession?.presentationContextProvider=self
            self.authSession?.prefersEphemeralWebBrowserSession=false
            if self.authSession?.start() != true { self.authSession=nil; callback.error("Unable to start authentication session") }
        }
    }
    func presentationAnchor(for session:ASWebAuthenticationSession)->ASPresentationAnchor{viewController?.view.window ?? NSApp.keyWindow!}
}

final class BrowserWindowController:NSWindowController,WKNavigationDelegate,NSWindowDelegate{
    private let web=WKWebView()
    var onClose:(()->Void)?
    init(){let w=NSWindow(contentRect:NSRect(x:0,y:0,width:1000,height:700),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false);super.init(window:w);w.title="Shellular Browser";w.contentView=web;w.center();w.delegate=self;web.navigationDelegate=self}
    required init?(coder:NSCoder){fatalError()}
    func load(_ url:URL){web.load(URLRequest(url:url))}
    func loadHTML(_ html:String){web.loadHTMLString(html,baseURL:nil)}
    func windowWillClose(_ notification:Notification){onClose?()}
}
