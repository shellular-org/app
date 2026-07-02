package io.foxbiz.shellular.browser;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;
import io.foxbiz.shellular.webView.ChromeClient;

public class BrowserService extends Service {

    /// Dialog saved when browser is minimized — restored on next open().
    public static BrowserDialog minimizedDialog;
    public static String savedWebViewUrl;

    private Callback pendingAuthCallback;
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
     * args[1] = theme (JSONObject)
     * args[2] = callbackScheme (String, optional, e.g. "npm")
     */
    @SuppressWarnings("unused")
    public void openForAuth(JSONArray args, Callback callback) {
        try {
            String url = args.getString(0);
            JSONObject themeJson = args.optJSONObject(1);
            String callbackScheme = args.optString(2, null);
            BrowserTheme theme = new BrowserTheme(themeJson);

            pendingAuthCallback = callback;

            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    dismissActiveDialog();
                    activeDialog = new BrowserDialog((Activity) context, theme, true, callbackScheme);
                    activeDialog.setAuthCallback(authUrl -> {
                        if (pendingAuthCallback == null) return;
                        Callback cb = pendingAuthCallback;
                        pendingAuthCallback = null;
                        // Dismiss triggers the dismiss listener which cleans up the dialog
                        activeDialog.dismiss();
                        try {
                            JSONObject result = new JSONObject();
                            result.put("url", authUrl);
                            if (authUrl != null) {
                                Uri uri = Uri.parse(authUrl);
                                JSONObject params = new JSONObject();
                                for (String key : uri.getQueryParameterNames()) {
                                    params.put(key, uri.getQueryParameter(key));
                                }
                                result.put("params", params);
                            }
                            cb.success(result);
                        } catch (Exception e) {
                            cb.error(e.toString());
                        }
                    });
                    // Override dismiss listener to handle auth cancellation
                    activeDialog.setOnDismissListener(d -> {
                        if (pendingAuthCallback != null) {
                            pendingAuthCallback.error("Auth cancelled");
                            pendingAuthCallback = null;
                        }
                        activeDialog = null;
                    });
                    activeDialog.setUrl(url);
                    activeDialog.showAnimated(null);
                } catch (Exception e) {
                    if (pendingAuthCallback != null) {
                        pendingAuthCallback.error(e.toString());
                        pendingAuthCallback = null;
                    }
                }
            });
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        // Forward file chooser results to the active browser dialog's WebView
        if (requestCode == BrowserView.FILE_SELECT_CODE && activeDialog != null) {
            BrowserView bv = activeDialog.getBrowserView();
            if (bv != null && bv.filePathCallback != null) {
                bv.filePathCallback.onReceiveValue(
                        resultCode == Activity.RESULT_OK
                                ? ChromeClient.getUrisFromIntent(data)
                                : null);
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
    }
}
