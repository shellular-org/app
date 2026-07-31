package io.foxbiz.shellular.browser;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

import org.json.JSONArray;
import org.json.JSONObject;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;
import io.foxbiz.shellular.webView.ChromeClient;

public class BrowserService extends Service {
    /**
     * How long a resume waits for the auth deep link before treating the flow as
     * cancelled. The redirect and the resume arrive together and their order is
     * not guaranteed, so this is a grace period, not a guess: it only ever fires
     * when no callback intent showed up at all (user hit back / swiped the tab).
     */
    private static final long AUTH_CANCEL_DELAY_MS = 1500;

    /// Dialog saved when browser is minimized — restored on next open().
    public static BrowserDialog minimizedDialog;
    public static String savedWebViewUrl;

    /**
     * Auth callback URI that arrived with no JS callback waiting for it — the
     * usual cause is process death during the OAuth detour, where the redirect
     * relaunches the activity and `openForAuth`'s promise died with the old
     * WebView. Held statically (the service instance is rebuilt with the
     * activity) so the next `openForAuth` can consume it instead of re-running
     * a flow the user already completed.
     */
    private static Uri pendingAuthCallbackUri;

    /// True while an auth flow owns the foreground; read by MainActivity so a
    /// long OAuth detour is not mistaken for a long pause worth reloading over.
    private static volatile boolean authFlowInFlight;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Callback pendingAuthCallback;
    private String pendingAuthCallbackScheme;
    private boolean authCustomTabOpen;
    private Runnable pendingAuthCancel;
    private BrowserDialog activeDialog;

    /**
     * True from the moment an auth Custom Tab opens until its callback is
     * delivered (or the flow is cancelled). While set, MainActivity must not
     * reload the WebView: that would tear down the JS context holding the
     * in-flight `openForAuth` promise and drop a completed sign-in.
     */
    public static boolean isAuthFlowInFlight() {
        return authFlowInFlight;
    }

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

            // `exec` dispatches this on a background thread, while onNewIntent /
            // onResume run on the main thread. Do all pending-auth bookkeeping on
            // the main thread so the callback, its scheme and the cancel timer are
            // only ever touched from one thread.
            mainHandler.post(() -> {
                // A previous attempt may have left a callback stranded (process
                // death mid-flow, or a reload that outran delivery). Redeem it
                // rather than sending the user through a sign-in they already
                // finished — the authorization code is single-use and still valid.
                Uri stranded = takeStrandedAuthCallback(callbackScheme);
                if (stranded != null) {
                    try {
                        callback.success(authResult(stranded));
                    } catch (Exception e) {
                        callback.error(e.toString());
                    }
                    return;
                }

                // Supersede any earlier in-flight attempt so its cancel timer and
                // callback cannot resolve this one's promise.
                failPendingAuth("Auth superseded");

                pendingAuthCallback = callback;
                pendingAuthCallbackScheme = callbackScheme;
                authCustomTabOpen = false;
                authFlowInFlight = true;

                try {
                    openAuthCustomTab(url);
                } catch (Exception e) {
                    if (pendingAuthCallback == callback) {
                        clearPendingAuth();
                        callback.error(e.toString());
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
        if (intent == null || intent.getData() == null) {
            return;
        }

        Uri uri = intent.getData();
        if (!isAuthCallbackUri(uri)) {
            return;
        }

        // Cancel the resume timer first. `onNewIntent` and `onResume` both fire
        // on this redirect and their order is not contractual — on cold start
        // the intent can land after the resume, so the timer must die here
        // rather than be relied on to lose a race.
        cancelPendingAuthCancel();

        if (pendingAuthCallback == null) {
            // Nothing waiting: the flow outlived its JS context (process death,
            // WebView reload). Stash the result for the next `openForAuth` so
            // the completed sign-in is not thrown away.
            pendingAuthCallbackUri = uri;
            authFlowInFlight = false;
            return;
        }

        Callback cb = pendingAuthCallback;
        clearPendingAuth();
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
        // `shellular-dev` is matched explicitly too: after process death there is
        // no pending scheme to compare against, and dev builds must still be able
        // to redeem a stranded callback.
        return "shellular".equals(scheme)
                || "shellular-dev".equals(scheme)
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

        // Returning to the app without a callback intent *probably* means the
        // user dismissed the Custom Tab — but the redirect may still be in
        // flight, so give it a grace period. `onNewIntent` cancels this timer,
        // so it only ever fires on a genuine cancellation.
        cancelPendingAuthCancel();
        pendingAuthCancel = () -> {
            pendingAuthCancel = null;
            if (pendingAuthCallback == null || !authCustomTabOpen) {
                return;
            }

            Callback cb = pendingAuthCallback;
            clearPendingAuth();
            cb.error("Authentication was cancelled.");
        };
        mainHandler.postDelayed(pendingAuthCancel, AUTH_CANCEL_DELAY_MS);
    }

    private void cancelPendingAuthCancel() {
        if (pendingAuthCancel != null) {
            mainHandler.removeCallbacks(pendingAuthCancel);
            pendingAuthCancel = null;
        }
    }

    private void clearPendingAuth() {
        cancelPendingAuthCancel();
        pendingAuthCallback = null;
        pendingAuthCallbackScheme = null;
        authCustomTabOpen = false;
        authFlowInFlight = false;
    }

    /** Reject the in-flight auth (if any) without touching a stashed callback. */
    private void failPendingAuth(String message) {
        if (pendingAuthCallback == null) {
            cancelPendingAuthCancel();
            return;
        }
        Callback cb = pendingAuthCallback;
        clearPendingAuth();
        cb.error(message);
    }

    /**
     * Take a callback that arrived with no JS promise waiting, if it matches the
     * scheme this flow expects. Cleared on read — the code inside is single-use.
     */
    private static Uri takeStrandedAuthCallback(String callbackScheme) {
        Uri uri = pendingAuthCallbackUri;
        if (uri == null) return null;
        String scheme = uri.getScheme();
        boolean matches = "shellular".equals(scheme)
                || "foxbiz".equals(scheme)
                || (callbackScheme != null && callbackScheme.equals(scheme));
        if (!matches) return null;
        pendingAuthCallbackUri = null;
        return uri;
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
        // Note: a stashed `pendingAuthCallbackUri` deliberately survives this —
        // it exists precisely for the teardown-mid-flow case, and the next
        // `openForAuth` consumes it.
        clearPendingAuth();
    }
}
