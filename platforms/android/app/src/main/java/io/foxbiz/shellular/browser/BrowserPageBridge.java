package io.foxbiz.shellular.browser;

import android.webkit.JavascriptInterface;

import java.lang.ref.WeakReference;

/**
 * Singleton JavascriptInterface registered on the main WebView BEFORE the first page load so
 * that window.__shellularPageBridge is available immediately in JavaScript.
 *
 * Android's addJavascriptInterface() only exposes injected objects to JavaScript after the
 * *next* page load — registering dynamically inside loadShellularPage() is therefore too late.
 * This singleton is registered once in MainActivity.createWebView() before webview.loadUrl(),
 * mirroring how HttpProxyHandler is handled.
 *
 * BrowserView calls setCurrentView() when it wants to load a shellular:// page, and the
 * onResult() JavascriptInterface callback delegates to that view's receivePageResult().
 */
public class BrowserPageBridge {

    private static BrowserPageBridge instance;

    public static synchronized BrowserPageBridge getInstance() {
        if (instance == null) instance = new BrowserPageBridge();
        return instance;
    }

    private BrowserPageBridge() {}

    private volatile WeakReference<BrowserView> currentView;

    public void setCurrentView(BrowserView view) {
        currentView = new WeakReference<>(view);
    }

    public void clearCurrentView() {
        currentView = null;
    }

    @JavascriptInterface
    public void onResult(String pageName, String html) {
        WeakReference<BrowserView> ref = currentView;
        BrowserView view = ref != null ? ref.get() : null;
        if (view != null) {
            view.receivePageResult(pageName, html);
        }
    }
}
