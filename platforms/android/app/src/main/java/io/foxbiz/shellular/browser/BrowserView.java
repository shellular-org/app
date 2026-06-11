package io.foxbiz.shellular.browser;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

public class BrowserView extends LinearLayout {

    public static final int FILE_SELECT_CODE = 2001;

    public BrowserMenu menu;
    public WebView webView;
    public ValueCallback<Uri[]> filePathCallback;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final BrowserTheme theme;
    private final Context context;
    private TextView titleText;
    private ImageView favicon;
    private ProgressBar loading;
    private DeviceEmulator deviceEmulator;

    public boolean emulator = false;
    public boolean console = false;
    public boolean desktopMode = false;

    private final Set<Integer> activeProxyPorts = Collections.synchronizedSet(new HashSet<>());

    private String url = "";
    private String title = "Browser";
    private final boolean onlyConsole;

    private ImageButton menuIcon;
    private ImageButton backButton;
    private ImageButton forwardButton;
    private ImageButton consoleButton;

    private final int titleHeight;
    private final int titleTextHeight;
    private final int iconSize;

    // Bottom toolbar
    private LinearLayout bottomToolbar;

    // Minimize action (set by BrowserDialog to hide instead of dismiss)
    private Runnable minimizeAction;

    // Exit action (default: finish the host Activity; overridable for dialog mode)
    private Runnable exitAction;

    // Auth mode
    private final String callbackScheme;
    private AuthCallback authCallback;

    public interface AuthCallback {
        void onAuthResult(String url);
    }

    public BrowserView(Context context, BrowserTheme theme, boolean onlyConsole, String callbackScheme) {
        super(context);
        this.context = context;
        this.theme = theme;
        this.onlyConsole = onlyConsole;
        this.callbackScheme = callbackScheme;

        float density = context.getResources().getDisplayMetrics().density;
        this.iconSize = (int) (35 * density);
        this.titleHeight = (int) (45 * density);
        this.titleTextHeight = (int) (35 * density);

        init();
    }

    public void setAuthCallback(AuthCallback callback) {
        this.authCallback = callback;
    }

    public void setExitAction(Runnable action) {
        this.exitAction = action;
    }

    public void setMinimizeAction(Runnable action) {
        this.minimizeAction = action;
    }

    private void init() {
        int textColor = theme.get("primaryText");

        // Favicon
        favicon = new ImageView(context);
        Bitmap globeBmp = IconFont.get(context, "globe", iconSize, textColor);
        if (globeBmp != null) favicon.setImageBitmap(globeBmp);
        styleIcon(favicon);

        // Menu button
        this.menuIcon = createIconButton("more-vertical");
        menuIcon.setOnClickListener(v -> menu.show(v));

        // Refresh button
        ImageButton refreshIcon = createIconButton("refresh-cw");
        refreshIcon.setOnClickListener(v -> webView.reload());

        // Loading indicator
        loading = new ProgressBar(context, null, android.R.attr.progressBarStyle);
        loading.setLayoutParams(new LayoutParams(iconSize, iconSize, 0));

        // Favicon frame (overlays favicon + loading spinner)
        FrameLayout faviconFrame = new FrameLayout(context);
        LayoutParams faviconFrameParams = new LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        faviconFrameParams.gravity = Gravity.CENTER_VERTICAL;
        faviconFrame.setLayoutParams(faviconFrameParams);
        faviconFrame.addView(favicon);
        faviconFrame.addView(loading);

        // Title bar
        LinearLayout titleLayout = createTile(titleHeight);
        titleLayout.addView(faviconFrame);
        titleText = onlyConsole ? createTextView(title) : createEditText(title);
        titleLayout.addView(titleText);
        if (!onlyConsole) {
            titleLayout.addView(menuIcon);
        }

        // WebView
        webView = new WebView(context);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setBackgroundColor(theme.get("primary"));
        webView.setLayoutParams(new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        // Register localhost port bridge so injected JS can auto-start proxy servers
        webView.addJavascriptInterface(new LocalhostBridge(), "__shellularEnsurePort");

        // Download listener
        webView.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimeType, contentLength) -> {
            String fileName = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType);
            new Handler(Looper.getMainLooper()).post(() ->
                    new AlertDialog.Builder(context)
                            .setTitle("Download file")
                            .setMessage("Do you want to download \"" + fileName + "\"?")
                            .setPositiveButton("Yes", (dialog, which) -> {
                                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(downloadUrl));
                                request.setMimeType(mimeType);
                                request.addRequestHeader("User-Agent", userAgent);
                                request.setDescription("Downloading file...");
                                request.setTitle(fileName);
                                request.allowScanningByMediaScanner();
                                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                                DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                                dm.enqueue(request);
                                Toast.makeText(context, "Download started...", Toast.LENGTH_SHORT).show();
                            })
                            .setNegativeButton("Cancel", null)
                            .show());
        });

        webView.setWebChromeClient(new BrowserChromeClient());
        webView.setWebViewClient(new BrowserWebViewClient());

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        LinearLayout webViewContainer = new LinearLayout(context);
        webViewContainer.setGravity(Gravity.CENTER);
        webViewContainer.setLayoutParams(new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT, 1));
        webViewContainer.setBackgroundColor(theme.get("primary"));
        webViewContainer.addView(webView);

        setOrientation(VERTICAL);
        setBackgroundColor(theme.get("primary"));
        setLayoutParams(new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setFocusableInTouchMode(true);
        setFocusable(true);
        createMenu();
        addView(titleLayout);
        addView(webViewContainer);

        // ── Bottom toolbar ──
        bottomToolbar = new LinearLayout(context);
        bottomToolbar.setOrientation(HORIZONTAL);
        bottomToolbar.setBackgroundColor(theme.get("primary"));
        bottomToolbar.setGravity(Gravity.CENTER_VERTICAL);
        int btnPad = dpToPx(12);
        LayoutParams btnParams = new LayoutParams(0, iconSize, 1);
        btnParams.gravity = Gravity.CENTER;

        // Minimize button
        ImageButton minimizeBtn = createIconButton("chevron-down");
        minimizeBtn.setOnClickListener(v -> {
            if (minimizeAction != null) {
                minimizeAction.run();
            }
        });
        minimizeBtn.setLayoutParams(btnParams);
        bottomToolbar.addView(minimizeBtn);

        // Back button
        ImageButton backBtn = createIconButton("chevron-left");
        backBtn.setOnClickListener(v -> goBack());
        backBtn.setLayoutParams(btnParams);
        bottomToolbar.addView(backBtn);
        backButton = backBtn;

        // Forward button
        ImageButton forwardBtn = createIconButton("chevron-right");
        forwardBtn.setOnClickListener(v -> { if (webView.canGoForward()) webView.goForward(); });
        forwardBtn.setLayoutParams(btnParams);
        bottomToolbar.addView(forwardBtn);
        forwardButton = forwardBtn;

        // Home button
        ImageButton homeBtn = createIconButton("home");
        homeBtn.setOnClickListener(v -> setUrl("shellular://home"));
        homeBtn.setLayoutParams(btnParams);
        bottomToolbar.addView(homeBtn);

        // Refresh button
        ImageButton toolbarRefreshBtn = createIconButton("refresh-cw");
        toolbarRefreshBtn.setOnClickListener(v -> webView.reload());
        toolbarRefreshBtn.setLayoutParams(btnParams);
        bottomToolbar.addView(toolbarRefreshBtn);

        // Console button
        ImageButton consoleBtn = createIconButton("terminal");
        consoleBtn.setOnClickListener(v -> {
            setConsoleVisible(!console);
        });
        consoleBtn.setLayoutParams(btnParams);
        bottomToolbar.addView(consoleBtn);
        consoleButton = consoleBtn;

        // Expand touch targets
        int minTouch = dpToPx(44);
        for (ImageButton btn : new ImageButton[]{minimizeBtn, backBtn, forwardBtn, homeBtn, toolbarRefreshBtn, consoleBtn}) {
            btn.setMinimumWidth(minTouch);
            btn.setMinimumHeight(minTouch);
        }

        bottomToolbar.setLayoutParams(new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, titleHeight));
        bottomToolbar.setPadding(btnPad, 0, btnPad, 0);
        addView(bottomToolbar);

        ViewCompat.setOnApplyWindowInsetsListener(this, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, systemBars.top, 0, systemBars.bottom);
            return insets;
        });

        updateConsoleButton();
    }

    private void createMenu() {
        menu = new BrowserMenu(context, theme);

        menu.addItem("monitor", "Devices", true);
        menu.addItem("refresh-cw", "Disable Cache", true);
        menu.addItem("external-link", "Open in Browser");
        menu.addItem("x", "Exit");

        menu.setCallback((action, checked) -> {
            switch (action) {
                case "Devices":
                    if (deviceEmulator == null) createDeviceEmulatorLayout();
                    emulator = checked;
                    if (checked) {
                        setDesktopMode(true);
                        setConsoleVisible(false);
                        addView(deviceEmulator, getChildCount());
                        // Re-add at bottom would break layout; add before webview container
                        removeView(deviceEmulator);
                        addView(deviceEmulator);
                        deviceEmulator.setReference(webView);
                        updateConsoleButton();
                    } else {
                        removeView(deviceEmulator);
                        fitWebViewTo(0, 0, 1f);
                        webView.post(() -> setDesktopMode(false));
                        updateConsoleButton();
                    }
                    break;
                case "Disable Cache":
                    webView.getSettings().setCacheMode(
                            checked ? WebSettings.LOAD_NO_CACHE : WebSettings.LOAD_DEFAULT);
                    break;
                case "Open in Browser":
                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    context.startActivity(browserIntent);
                    exit();
                    break;
                case "Exit":
                    exit();
                    break;
            }
        });
    }

    private void createDeviceEmulatorLayout() {
        deviceEmulator = new DeviceEmulator(context, theme);
        deviceEmulator.setReference(webView);
        deviceEmulator.setChangeListener(this::fitWebViewTo);
    }

    public void setUrl(String url) {
        this.url = url;

        if (!onlyConsole && menuIcon != null) {
            menuIcon.setVisibility(url.startsWith("shellular://") ? View.GONE : View.VISIBLE);
        }

        // Handle shellular:// pages
        if (url.startsWith("shellular://")) {
            Uri uri = Uri.parse(url);
            String pageName = uri.getHost();
            if (pageName != null && !pageName.equals("auth-callback")) {
                loadShellularPage(pageName);
                return;
            }
        }

        setTitle(url);
        setProgressBarVisible(true);
        webView.loadUrl(url);
        updateConsoleButton();
    }

    private void loadShellularPage(String pageName) {
        url = "shellular://" + pageName;
        updateConsoleButton();
        String displayTitle = pageName.substring(0, 1).toUpperCase() + pageName.substring(1);
        setTitle(displayTitle);
        setProgressBarVisible(true);

        // Set page-specific favicon immediately
        String faviconCode;
        switch (pageName) {
            case "home":  faviconCode = "shellular"; break;
            case "ports": faviconCode = "shellular"; break;
            default:      faviconCode = "globe"; break;
        }
        Bitmap pageIcon = IconFont.get(context, faviconCode, iconSize, theme.get("primaryText"));
        if (pageIcon != null) setFavicon(pageIcon);

        WebView mwv = HttpProxyHandler.getInstance().getMainWebView();
        if (mwv == null) {
            setProgressBarVisible(false);
            return;
        }

        mainHandler.post(() -> {
            // Point the pre-registered singleton bridge at this BrowserView so the JS callback
            // lands here. The bridge is registered on the main WebView before the first page
            // load (in MainActivity), so window.__shellularPageBridge is always available.
            BrowserPageBridge.getInstance().setCurrentView(BrowserView.this);

            String escaped = pageName.replace("'", "\\'");
            // Retry up to 10 times (3 seconds total) if __shellularPage isn't ready yet.
            // Always call onResult — even on error — so the spinner never hangs forever.
            String js = "(function load(n,attempts){"
                + "if(!window.__shellularPage){"
                + "  if(attempts>0){setTimeout(function(){load(n,attempts-1)},300);return;}"
                + "  window.__shellularPageBridge&&window.__shellularPageBridge.onResult(n,"
                + "    '<html><head><meta charset=\"utf-8\"></head><body style=\"background:#0d0d0f;color:#f5f1e8;font-family:sans-serif;padding:24px\">App not ready — try reopening the browser.</body></html>');"
                + "  return;"
                + "}"
                + "try{"
                + "  var r=window.__shellularPage(n);"
                + "  if(r&&typeof r.then==='function'){"
                + "    r.then(function(h){window.__shellularPageBridge.onResult(n,h)})"
                + "     .catch(function(e){window.__shellularPageBridge.onResult(n,"
                + "       '<html><head><meta charset=\"utf-8\"></head><body style=\"background:#0d0d0f;color:#f5f1e8;font-family:sans-serif;padding:24px\">Error: '+e+'</body></html>');});"
                + "  }else if(r){"
                + "    window.__shellularPageBridge.onResult(n,r);"
                + "  }"
                + "}catch(e){"
                + "  window.__shellularPageBridge&&window.__shellularPageBridge.onResult(n,"
                + "    '<html><head><meta charset=\"utf-8\"></head><body style=\"background:#0d0d0f;color:#f5f1e8;font-family:sans-serif;padding:24px\">Error: '+e+'</body></html>');"
                + "}"
                + "})(" + "'" + escaped + "',10);";
            mwv.evaluateJavascript(js, null);
        });
    }

    /** Called by BrowserPageBridge when the JS callback delivers the rendered HTML. */
    public void receivePageResult(String pageName, String html) {
        mainHandler.post(() -> {
            setProgressBarVisible(false);
            webView.loadDataWithBaseURL("shellular://" + pageName, html, "text/html", "utf-8", null);
        });
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        // Clear the view reference so the singleton bridge doesn't hold a stale reference.
        // Do NOT remove __shellularPageBridge from the main WebView — it must stay registered
        // for future browser opens.
        BrowserPageBridge.getInstance().clearCurrentView();
    }

    public void setHtml(String html) {
        this.url = "";
        setTitle("Home");
        setProgressBarVisible(false);
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        updateConsoleButton();
    }

    public void setTitle(String title) {
        this.title = title;
        titleText.setText(title);
    }

    public void setFavicon(Bitmap icon) {
        favicon.setImageBitmap(icon);
    }

    public void setConsoleVisible(boolean visible) {
        console = visible;
        String js = "if(window.eruda){document.dispatchEvent(new CustomEvent('" + (visible ? "show" : "hide") + "console'));}";
        webView.evaluateJavascript(js, null);
        updateConsoleButton();
    }

    public void setProgressBarVisible(boolean visible) {
        loading.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    public void setDesktopMode(boolean enabled) {
        desktopMode = enabled;
        WebSettings ws = webView.getSettings();
        ws.setUserAgentString(enabled
                ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
                : null);
        ws.setLoadWithOverviewMode(enabled);
        ws.setUseWideViewPort(enabled);
        ws.setSupportZoom(enabled);
        ws.setBuiltInZoomControls(enabled);
        webView.reload();
    }

    private void updateConsoleButton() {
        if (consoleButton == null) return;
        boolean isHomeOrPorts = url != null && (url.startsWith("shellular://home") || url.startsWith("shellular://ports"));
        boolean enabled = !emulator && !isHomeOrPorts;
        consoleButton.setEnabled(enabled);
        consoleButton.setAlpha(enabled ? 1f : 0.3f);
        int btnColor = console ? theme.get("primaryActiveText", theme.get("primaryText")) : theme.get("primaryText");
        Bitmap bmp = IconFont.get(context, "terminal", iconSize, btnColor);
        if (bmp != null) consoleButton.setImageBitmap(bmp);
    }

    public boolean goBack() {
        if (console) {
            setConsoleVisible(false);
            return true;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            url = webView.getOriginalUrl();
            return true;
        }
        return false;
    }

    private void updateNavigationButtons() {
        forwardButton.setEnabled(webView.canGoForward());
        forwardButton.setAlpha(webView.canGoForward() ? 1f : 0.3f);
    }

    public void destroy() {
        for (int port : activeProxyPorts) {
            EmbeddedProxyServer.INSTANCE.stopServer(port);
        }
        activeProxyPorts.clear();

        webView.post(() -> {
            webView.stopLoading();
            webView.destroy();
        });
    }

    public void exit() {
        destroy();
        if (exitAction != null) {
            exitAction.run();
        } else {
            ((Activity) context).finish();
        }
    }

    private void fitWebViewTo(int width, int height, float scale) {
        webView.setScaleX(scale);
        webView.setScaleY(scale);
        webView.setLayoutParams(new LayoutParams(
                width == 0 ? ViewGroup.LayoutParams.MATCH_PARENT : width,
                height == 0 ? ViewGroup.LayoutParams.MATCH_PARENT : height));
        if (width > 0 && height > 0) updateViewportDimension(width, height);
    }

    private void updateViewportDimension(int width, int height) {
        String script = "!function(){var e=document.head;if(e){e.querySelectorAll(\"meta[name=viewport]\").forEach(function(e){e.remove()});var t=document.createElement(\"meta\");t.name=\"viewport\",t.content=\"width=%s, height=%s, initial-scale=%s\",e.append(t)}}();";
        String w = width > 0 ? String.valueOf(width) : "device-width";
        String h = height > 0 ? String.valueOf(height) : "device-height";
        String r = width > 0 ? "0.1" : "1";
        webView.evaluateJavascript(String.format(script, w, h, r), null);
    }

    private void styleIcon(ImageView view) {
        int pad = dpToPx(7);
        LayoutParams params = new LayoutParams(iconSize, iconSize);
        params.gravity = Gravity.CENTER_VERTICAL;
        view.setBackground(null);
        view.setLayoutParams(params);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        view.setAdjustViewBounds(true);
        view.setPadding(pad, pad, pad, pad);
    }

    private ImageButton createIconButton(String iconCode) {
        int textColor = theme.get("primaryText");
        Bitmap bmp = IconFont.get(context, iconCode, iconSize, textColor);
        ImageButton btn = new ImageButton(context);
        if (bmp != null) btn.setImageBitmap(bmp);
        styleIcon(btn);
        return btn;
    }

    private LinearLayout createTile(int height) {
        LinearLayout tile = new LinearLayout(context);
        tile.setOrientation(HORIZONTAL);
        tile.setBackgroundColor(theme.get("primary"));
        tile.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, height));
        tile.setGravity(Gravity.CENTER_VERTICAL);
        return tile;
    }

    private TextView createTextView(String text) {
        TextView tv = new TextView(context);
        setTextViewProps(tv, titleHeight);
        tv.setText(text);
        return tv;
    }

    private EditText createEditText(String text) {
        EditText et = new EditText(context);
        GradientDrawable bg = new GradientDrawable();
        int radius = titleTextHeight / 2;
        bg.setCornerRadius(radius);
        bg.setColor(theme.getType().equals("light") ? 0x11000000 : 0x11FFFFFF);
        et.setBackground(bg);
        setTextViewProps(et, titleTextHeight);
        et.setText(text);
        et.setPadding(radius, 0, radius, 0);
        et.setTextSize(14);
        et.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        et.setImeOptions(EditorInfo.IME_ACTION_GO);

        et.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                titleText.setText(url);
                et.selectAll();
                showKeyboard(true);
            } else {
                titleText.setText(title);
                showKeyboard(false);
            }
        });

        et.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                String input = v.getText().toString();
                if (!input.startsWith("http://") && !input.startsWith("https://") && !input.startsWith("shellular://")) {
                    input = "http://" + input;
                }
                title = input;
                setUrl(input);
                et.clearFocus();
                showKeyboard(false);
                return true;
            }
            return false;
        });

        return et;
    }

    private void setTextViewProps(TextView tv, int height) {
        LayoutParams params = new LayoutParams(0, height, 1);
        params.gravity = Gravity.CENTER_VERTICAL;
        tv.setMaxLines(1);
        tv.setEllipsize(TextUtils.TruncateAt.END);
        tv.setSingleLine(true);
        tv.setTextColor(theme.get("primaryText"));
        tv.setLayoutParams(params);
        tv.setGravity(Gravity.CENTER_VERTICAL);
    }

    private void showKeyboard(boolean show) {
        InputMethodManager imm = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (show) {
            imm.toggleSoftInput(InputMethodManager.SHOW_FORCED, 0);
        } else {
            imm.hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
    }

    private int dpToPx(int dp) {
        return (int) (dp * context.getResources().getDisplayMetrics().density);
    }

    // ─── Localhost Bridge (JS → native, for auto-starting proxy on new ports) ───

    private class LocalhostBridge {
        @JavascriptInterface
        public void ensurePort(int port) {
            if (activeProxyPorts.contains(port)) return;
            WebView mwv = HttpProxyHandler.getInstance().getMainWebView();
            if (mwv == null) return;
            EmbeddedProxyServer.INSTANCE.setMainWebView(mwv);
            if (EmbeddedProxyServer.INSTANCE.startServer(port)) {
                activeProxyPorts.add(port);
            }
        }
    }

    // ─── Chrome client ────────────────────────────────────────────

    private class BrowserChromeClient extends WebChromeClient {
        @Override
        public void onReceivedTitle(WebView view, String pageTitle) {
            super.onReceivedTitle(view, pageTitle);
            setTitle(pageTitle);
        }

        @Override
        public void onReceivedIcon(WebView view, Bitmap icon) {
            super.onReceivedIcon(view, icon);
            setFavicon(icon);
        }

        @Override
        public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> fpCallback,
                                         FileChooserParams fileChooserParams) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = fpCallback;

            String[] acceptTypes = fileChooserParams.getAcceptTypes();
            Intent selectDoc = getIntent(fileChooserParams, acceptTypes);
            ((Activity) context).startActivityForResult(
                    Intent.createChooser(selectDoc, "Select File"), FILE_SELECT_CODE);
            return true;
        }

        @NonNull
        private Intent getIntent(FileChooserParams fileChooserParams, String[] acceptTypes) {
            String mimeType = "*/*";
            if (acceptTypes != null && acceptTypes.length > 0 && acceptTypes[0] != null && !acceptTypes[0].trim().isEmpty()) {
                mimeType = acceptTypes[0];
            }

            Intent selectDoc = new Intent(Intent.ACTION_GET_CONTENT);
            selectDoc.addCategory(Intent.CATEGORY_OPENABLE);
            selectDoc.setType(mimeType);
            if (fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                selectDoc.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            return selectDoc;
        }
    }

    // ─── WebView client ───────────────────────────────────────────

    private class BrowserWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String loadUrl) {
            // Intercept auth callback scheme
            if (callbackScheme != null && loadUrl.startsWith(callbackScheme + "://")) {
                if (authCallback != null) authCallback.onAuthResult(loadUrl);
                return true;
            }
            // Intercept shellular:// auth callbacks
            if (loadUrl.startsWith("shellular://auth-callback")) {
                if (authCallback != null) authCallback.onAuthResult(loadUrl);
                return true;
            }
            // Intercept shellular:// page navigations
            if (loadUrl.startsWith("shellular://")) {
                Uri uri = Uri.parse(loadUrl);
                String pageName = uri.getHost();
                if (pageName != null && !pageName.equals("auth-callback")) {
                    loadShellularPage(pageName);
                    return true;
                }
            }
            url = loadUrl;
            setProgressBarVisible(true);
            // Auto-start embedded proxy server for localhost URLs
            ensureProxyServer(loadUrl);
            // Explicitly load http/https URLs in this WebView. Returning false from a
            // custom-scheme (shellular://) context causes Android to dispatch the URL via
            // a system Intent (external browser) instead of loading it here.
            if (loadUrl.startsWith("http://") || loadUrl.startsWith("https://")) {
                view.loadUrl(loadUrl);
                return true;
            }
            return false;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();

            // Serve bundled assets for shellular://assets/* (e.g. icon font)
            if ("shellular".equals(scheme) && "assets".equals(uri.getHost())) {
                String filename = uri.getLastPathSegment();
                if (filename != null) {
                    try {
                        java.io.InputStream is = context.getAssets().open("bundle/" + filename);
                        String mime;
                        if (filename.endsWith(".ttf")) mime = "font/truetype";
                        else if (filename.endsWith(".css")) mime = "text/css";
                        else mime = "application/octet-stream";
                        java.util.Map<String, String> hdrs = new java.util.HashMap<>();
                        hdrs.put("Access-Control-Allow-Origin", "*");
                        return new WebResourceResponse(mime, null, 200, "OK", hdrs, is);
                    } catch (java.io.IOException ignored) {}
                }
                return super.shouldInterceptRequest(view, request);
            }

            // Auto-start embedded proxy server for ALL localhost sub-resource requests.
            // This fires for images, scripts, stylesheets, XHR, fetch, fonts, modules,
            // dynamic imports — any resource load targeting localhost.
            if ("http".equals(scheme) || "https".equals(scheme)) {
                ensureProxyServer(uri.toString());
            }

            return super.shouldInterceptRequest(view, request);
        }

        @Override
        public void onPageStarted(WebView view, String pageUrl, Bitmap icon) {
            super.onPageStarted(view, pageUrl, icon);
            // Update url/favicon for real pages. Use pageUrl (the incoming URL) rather than the
            // stored url field — the stored value may still be "shellular://" when navigating
            // away from a shellular page, which would incorrectly suppress the address bar update.
            // loadDataWithBaseURL reports about:blank as pageUrl for shellular pages, so this
            // condition is naturally false for shellular page loads.
            if (pageUrl != null && !pageUrl.equals("about:blank") && !pageUrl.startsWith("shellular://")) {
                url = pageUrl;
                setProgressBarVisible(true);
                // Show menu button when navigating to a real page (may have been hidden on shellular:// pages)
                if (!onlyConsole && menuIcon != null) menuIcon.setVisibility(View.VISIBLE);
                // Reset favicon to globe when navigating to a regular page
                Bitmap globeBmp = IconFont.get(context, "globe", iconSize, theme.get("primaryText"));
                if (globeBmp != null) setFavicon(globeBmp);
                updateConsoleButton();
            }
            // Inject eruda early so it captures console/network logs from page startup
            if (pageUrl != null && !pageUrl.equals("about:blank") && !pageUrl.startsWith("shellular://")
                    && !pageUrl.startsWith("data:")) {
                injectErudaEarly(view);
                injectLocalhostHooks(view);
            }
        }

        @Override
        public void onPageFinished(WebView view, String pageUrl) {
            super.onPageFinished(view, pageUrl);
            setProgressBarVisible(false);

            // Report history to the app (skip shellular:// pages)
            if (pageUrl != null && !pageUrl.isEmpty()
                    && !pageUrl.startsWith("shellular://")
                    && !pageUrl.startsWith("data:") && !pageUrl.startsWith("about:")) {
                WebView mwv = HttpProxyHandler.getInstance().getMainWebView();
                if (mwv != null) {
                    String escapedUrl = pageUrl.replace("'", "\\'");
                    String pageTitle = (title != null ? title : pageUrl).replace("'", "\\'");
                    String faviconUrl = "";
                    try {
                        Uri uri = Uri.parse(pageUrl);
                        String origin = uri.getScheme() + "://" + uri.getHost();
                        if (uri.getPort() != -1) origin += ":" + uri.getPort();
                        faviconUrl = origin + "/favicon.ico";
                    } catch (Exception ignored) {}
                    String escapedFav = faviconUrl.replace("'", "\\'");
                    String historyJs = "window.__shellularHistory && window.__shellularHistory({url:'" + escapedUrl + "',title:'" + pageTitle + "',favicon:'" + escapedFav + "'})";
                    mainHandler.post(() -> mwv.evaluateJavascript(historyJs, null));
                }
            }
            updateNavigationButtons();
        }

        @Override
        public void onLoadResource(WebView view, String resUrl) {
            if (desktopMode) {
                int w = webView.getMeasuredWidth();
                int h = webView.getMeasuredHeight();
                if (w > 0 && h > 0) updateViewportDimension(w, h);
            }
        }

        private void injectErudaEarly(WebView view) {
            String content = readAssetAsString("bundle/console.js");
            if (content == null) {
                Log.w("BrowserView", "console.js not found in bundle assets");
                return;
            }
            String script =
                    "(function inject(){" +
                    "if(document.readyState === 'loading'){" +
                    "document.addEventListener('DOMContentLoaded', inject);" +
                    "return;" +
                    "}" +
                    "if(window.__erudaInitialized)return;" +
                    content +
                    "if(!window.eruda)return;" +
                    "window.__erudaInitialized=true;" +
                    "eruda.init({theme:'dark'});" +
                    "eruda._shadowRoot.querySelector('.eruda-entry-btn').style.display='none';" +
                    "document.addEventListener('showconsole',function(){eruda.show();});" +
                    "document.addEventListener('hideconsole',function(){eruda.hide();});" +
                    (console ? "eruda.show();" : "") +
                    "})();";

            view.evaluateJavascript(script, v -> updateConsoleButton());
        }

        private void injectLocalhostHooks(WebView view) {
            String script =
                "(function(){" +
                "if(window.__shellularHooksInjected)return;" +
                "window.__shellularHooksInjected=true;" +
                "function es(u){" +
                "  try{" +
                "    var p=new URL(u,location.href);" +
                "    var h=p.hostname;" +
                "    if(h!=='localhost'&&h!=='127.0.0.1')return;" +
                "    var pt=p.port||(p.protocol==='https:'?'443':'80');" +
                "    window.__shellularEnsurePort&&window.__shellularEnsurePort.ensurePort(parseInt(pt));" +
                "  }catch(e){}" +
                "}" +
                "var _f=window.fetch;" +
                "window.fetch=function(i,o){" +
                "  var u=typeof i==='string'?i:(i&&i.url);" +
                "  if(u)es(u);" +
                "  return _f.apply(this,arguments);" +
                "};" +
                "var _o=XMLHttpRequest.prototype.open;" +
                "XMLHttpRequest.prototype.open=function(m,u){" +
                "  es(u);" +
                "  return _o.apply(this,arguments);" +
                "};" +
                "var _ES=window.EventSource;" +
                "if(_ES){" +
                "  window.EventSource=function(u,c){" +
                "    es(u);" +
                "    return new _ES(u,c);" +
                "  };" +
                "  window.EventSource.prototype=_ES.prototype;" +
                "  window.EventSource.CONNECTING=_ES.CONNECTING;" +
                "  window.EventSource.OPEN=_ES.OPEN;" +
                "  window.EventSource.CLOSED=_ES.CLOSED;" +
                "}" +
                "var _WS=window.WebSocket;" +
                "if(_WS){" +
                "  window.WebSocket=function(u,p){" +
                "    es(u);" +
                "    return new _WS(u,p);" +
                "  };" +
                "  window.WebSocket.prototype=_WS.prototype;" +
                "  window.WebSocket.CONNECTING=_WS.CONNECTING;" +
                "  window.WebSocket.OPEN=_WS.OPEN;" +
                "  window.WebSocket.CLOSING=_WS.CLOSING;" +
                "  window.WebSocket.CLOSED=_WS.CLOSED;" +
                "}" +
                "})();";
            view.evaluateJavascript(script, null);
        }
    }

    // ─── Asset reading helper ───────────────────────────────────────

    private String readAssetAsString(String assetName) {
        try {
            InputStream is = context.getAssets().open(assetName);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = is.read(chunk)) != -1) baos.write(chunk, 0, n);
            is.close();
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            return null;
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────

    private void ensureProxyServer(String urlStr) {
        try {
            Uri uri = Uri.parse(urlStr);
            String host = uri.getHost();
            if (host == null) return;
            if (!host.equals("localhost") && !host.equals("127.0.0.1") && !host.equals("0.0.0.0")) return;

            int port = uri.getPort();
            if (port == -1) {
                port = "https".equals(uri.getScheme()) ? 443 : 80;
            }

            if (activeProxyPorts.contains(port)) return;

            WebView mwv = HttpProxyHandler.getInstance().getMainWebView();
            if (mwv == null) return;
            EmbeddedProxyServer.INSTANCE.setMainWebView(mwv);

            if (EmbeddedProxyServer.INSTANCE.startServer(port)) {
                activeProxyPorts.add(port);
            }
        } catch (Exception ignored) {}
    }
}
