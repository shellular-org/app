package io.foxbiz.shellular.browser;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

import org.json.JSONArray;
import org.json.JSONObject;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class BrowserService extends Service {
    private static final long AUTH_CANCEL_DELAY_MS = 250;

    /// Dialog saved when browser is minimized — restored on next open().
    public static BrowserDialog minimizedDialog;
    public static String savedWebViewUrl;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Callback pendingAuthCallback;
    private String pendingAuthCallbackScheme;
    private boolean authCustomTabOpen;
    private BrowserDialog activeDialog;

    public BrowserService(Context context, WebView webView) {
        super(context, webView);
    }

    /**
     * Open browser in devtools mode.
     * args[0] = url (String)
     * args[1] = theme (JSONObject)
     */
    @SuppressWarnings("unused")
    public void open(JSONArray args, Callback callback) {
        try {
            String url = args.isNull(0) ? null : args.optString(0, null);
            JSONObject themeJson = args.optJSONObject(1);
            BrowserTheme theme = new BrowserTheme(themeJson);

            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    // If there's a minimized dialog, restore it instead of creating new
                    if (minimizedDialog != null) {
                        activeDialog = minimizedDialog;
                        minimizedDialog = null;
                        if (url != null && !url.isEmpty()) {
                            activeDialog.setUrl(url);
                        }
                        activeDialog.showAnimated(null);
                        callback.success("restored");
                        return;
                    }

                    dismissActiveDialog();
                    activeDialog = new BrowserDialog((Activity) context, theme, false, null);
                    if (url != null && !url.isEmpty()) {
                        activeDialog.setUrl(url);
                    } else {
                        activeDialog.setUrl("shellular://home");
                    }
                    activeDialog.showAnimated(null);
                    callback.success("Opened browser");
                } catch (Exception e) {
                    callback.error(e.toString());
                }
            });
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    /**
     * Open browser with raw HTML content.
     * args[0] = html (String)
     * args[1] = theme (JSONObject)
     */
    @SuppressWarnings("unused")
    public void openHTML(JSONArray args, Callback callback) {
        try {
            String html = args.getString(0);
            JSONObject themeJson = args.optJSONObject(1);
            BrowserTheme theme = new BrowserTheme(themeJson);

            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    dismissActiveDialog();
                    activeDialog = new BrowserDialog((Activity) context, theme, false, null);
                    activeDialog.setHtml(html);
                    activeDialog.showAnimated(null);
                    callback.success("Opened browser");
                } catch (Exception e) {
                    callback.error(e.toString());
                }
            });
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    /**
     * Open browser in auth mode — waits for callback scheme redirect.
     * args[0] = url (String)
     * args[1] = callbackScheme (String, optional, e.g. "shellular")
     * args[2] = useSafari (Boolean, ignored on Android)
     */
    @SuppressWarnings("unused")
    public void openForAuth(JSONArray args, Callback callback) {
        try {
            String url = args.getString(0);
            String callbackScheme = args.optString(1, null);

            pendingAuthCallback = callback;
            pendingAuthCallbackScheme = callbackScheme;
            authCustomTabOpen = false;

            mainHandler.post(() -> {
                try {
                    openAuthCustomTab(url);
                } catch (Exception e) {
                    if (pendingAuthCallback != null) {
                        pendingAuthCallback.error(e.toString());
                        pendingAuthCallback = null;
                        pendingAuthCallbackScheme = null;
                        authCustomTabOpen = false;
                    }
                }
            });
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    private void openAuthCustomTab(String url) {
        BrowserTheme theme = new BrowserTheme(null);
        CustomTabColorSchemeParams params = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(theme.get("primary"))
                .setNavigationBarColor(theme.get("primary"))
                .build();

        CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(params)
                .setShowTitle(true)
                .build();
        customTabsIntent.intent.addCategory(Intent.CATEGORY_BROWSABLE);
        authCustomTabOpen = true;
        customTabsIntent.launchUrl((Activity) context, Uri.parse(url));
    }

    @Override
    public void onNewIntent(Intent intent) {
        if (pendingAuthCallback == null || intent == null || intent.getData() == null) {
            return;
        }

        Uri uri = intent.getData();
        if (!isAuthCallbackUri(uri)) {
            return;
        }

        Callback cb = pendingAuthCallback;
        pendingAuthCallback = null;
        pendingAuthCallbackScheme = null;
        authCustomTabOpen = false;
        try {
            cb.success(authResult(uri));
        } catch (Exception e) {
            cb.error(e.toString());
        }
    }

    private boolean isAuthCallbackUri(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (!"auth-callback".equals(host)) return false;
        return "shellular".equals(scheme)
                || "foxbiz".equals(scheme)
                || (pendingAuthCallbackScheme != null && pendingAuthCallbackScheme.equals(scheme));
    }

    private JSONObject authResult(Uri uri) throws Exception {
        JSONObject result = new JSONObject();
        result.put("url", uri.toString());
        JSONObject params = new JSONObject();
        for (String key : uri.getQueryParameterNames()) {
            params.put(key, uri.getQueryParameter(key));
        }
        result.put("params", params);
        return result;
    }

    @Override
    public void onResume() {
        if (pendingAuthCallback == null || !authCustomTabOpen) {
            return;
        }

        mainHandler.postDelayed(() -> {
            if (pendingAuthCallback == null || !authCustomTabOpen) {
                return;
            }

            Callback cb = pendingAuthCallback;
            pendingAuthCallback = null;
            pendingAuthCallbackScheme = null;
            authCustomTabOpen = false;
            cb.error("Authentication was cancelled.");
        }, AUTH_CANCEL_DELAY_MS);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        // Forward file chooser results to the active browser dialog's WebView
        if (requestCode == BrowserView.FILE_SELECT_CODE && activeDialog != null) {
            BrowserView bv = activeDialog.getBrowserView();
            if (bv != null && bv.filePathCallback != null) {
                bv.filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                bv.filePathCallback = null;
            }
        }
    }

    private void dismissActiveDialog() {
        if (minimizedDialog != null) {
            minimizedDialog.dismiss();
            minimizedDialog = null;
        }
        if (activeDialog != null && activeDialog.isShowing()) {
            activeDialog.dismiss();
        }
        activeDialog = null;
    }

    @Override
    public void destroy() {
        dismissActiveDialog();
        pendingAuthCallback = null;
        pendingAuthCallbackScheme = null;
        authCustomTabOpen = false;
    }
}
