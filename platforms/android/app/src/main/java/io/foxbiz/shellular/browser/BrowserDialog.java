package io.foxbiz.shellular.browser;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;

import androidx.core.view.WindowCompat;

public class BrowserDialog extends Dialog {

    private static final String TAG = "BrowserDialog";

    public static volatile boolean isBrowserActive = false;

    private BrowserView browserView;
    private final BrowserTheme theme;

    public BrowserDialog(Activity activity, BrowserTheme theme, boolean isAuth, String callbackScheme) {
        super(activity, android.R.style.Theme_Black_NoTitleBar);
        this.theme = theme;

        requestWindowFeature(Window.FEATURE_NO_TITLE);

        browserView = new BrowserView(activity, theme, false, isAuth ? callbackScheme : null);
        browserView.setExitAction(() -> animateOut(BrowserDialog.this::dismiss));
        browserView.setMinimizeAction(() -> {
            BrowserService.savedWebViewUrl = browserView.webView.getUrl();
            BrowserDialog self = BrowserDialog.this;
            animateOut(() -> {
                BrowserService.minimizedDialog = self;
                hide();
            });
        });

        Window window = getWindow();
        if (window != null) {
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.setBackgroundDrawableResource(android.R.color.transparent);
        }

        setContentView(browserView);
        applySystemTheme();
    }

    @Override
    public void dismiss() {
        isBrowserActive = false;
        if (browserView != null) {
            browserView.destroy();
            browserView = null;
        }
        super.dismiss();
    }

    public void setUrl(String url) {
        if (browserView != null) browserView.setUrl(url);
    }

    public void setHtml(String html) {
        if (browserView != null) browserView.setHtml(html);
    }

    public void setAuthCallback(BrowserView.AuthCallback callback) {
        if (browserView != null) browserView.setAuthCallback(callback);
    }

    public BrowserView getBrowserView() {
        return browserView;
    }

    @Override
    public void show() {
        isBrowserActive = true;
        super.show();
        Window window = getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            applySystemTheme();
        }
    }

    public void showAnimated(Runnable onDone) {
        browserView.setAlpha(0);
        show();
        browserView.post(() -> {
            browserView.setTranslationY(browserView.getHeight());
            browserView.animate()
                .translationY(0)
                .alpha(1)
                .setDuration(300)
                .withEndAction(onDone)
                .start();
        });
    }

    public void animateIn(Runnable onDone) {
        browserView.post(() -> {
            browserView.setTranslationY(browserView.getHeight());
            browserView.setAlpha(0);
            browserView.animate()
                .translationY(0)
                .alpha(1)
                .setDuration(300)
                .withEndAction(onDone)
                .start();
        });
    }

    public void animateOut(Runnable onDone) {
        browserView.animate()
            .translationY(browserView.getHeight())
            .alpha(0)
            .setDuration(300)
            .withEndAction(() -> {
                browserView.setTranslationY(0);
                browserView.setAlpha(1);
                if (onDone != null) onDone.run();
            })
            .start();
    }

    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        if (browserView != null && browserView.goBack()) return;
        dismiss();
    }

    private void applySystemTheme() {
        Window window = getWindow();
        if (window == null) return;
        try {
            int barColor = theme.get("primary");
            // Required for setStatusBarColor / setNavigationBarColor to take effect
            window.clearFlags(0x04000000 /* FLAG_TRANSLUCENT_STATUS */);
            window.addFlags(0x80000000 /* FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS */);
            window.getClass().getMethod("setNavigationBarColor", int.class).invoke(window, barColor);
            window.getClass().getMethod("setStatusBarColor", int.class).invoke(window, barColor);

            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    if (theme.getType().equals("light")) {
                        controller.setSystemBarsAppearance(appearance, appearance);
                    } else {
                        controller.setSystemBarsAppearance(0, appearance);
                    }
                }
            } else {
                View decorView = window.getDecorView();
                int flags = decorView.getSystemUiVisibility();
                if (theme.getType().equals("light")) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        decorView.setSystemUiVisibility(flags
                                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                    }
                } else {
                    decorView.setSystemUiVisibility(flags
                            & ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed applying system bar theme", e);
        }
    }
}
