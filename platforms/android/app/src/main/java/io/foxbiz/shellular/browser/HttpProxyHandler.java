package io.foxbiz.shellular.browser;

import android.webkit.WebView;

public class HttpProxyHandler {
    private static HttpProxyHandler instance;

    private WebView mainWebView;

    public static synchronized HttpProxyHandler getInstance() {
        if (instance == null) {
            instance = new HttpProxyHandler();
        }
        return instance;
    }

    private HttpProxyHandler() {}

    public void setMainWebView(WebView webView) {
        this.mainWebView = webView;
    }

    public WebView getMainWebView() {
        return this.mainWebView;
    }

    public void cancelAll() {}
}
