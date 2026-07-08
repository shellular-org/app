package io.foxbiz.shellular;

import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.window.OnBackInvokedDispatcher;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.OnBackPressedDispatcher;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import io.foxbiz.shellular.browser.BrowserDialog;
import io.foxbiz.shellular.webView.AppView;
import io.foxbiz.shellular.webView.ChromeClient;
import io.foxbiz.shellular.webView.WebViewClient;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "FoxbizMainActivity";

    private Bridge bridge;
    private AppView appView;

    private long lastPausedTime = 0;
    private static final long PAUSE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

    private Handler mainHandler;

    public SplashScreen splashScreen;
    public boolean splashReadyToHide = false;
    private ChromeClient chromeClient;

    private BroadcastReceiver screenStateReceiver;
    private boolean screenWasOff = false;

    // Debounce fields to prevent rapid refresh triggers and flashing
    private long lastWindowFocusTime = 0;
    private static final long WINDOW_FOCUS_DEBOUNCE_MS = 500;
    private long lastRefreshTime = 0;
    private static final long REFRESH_DEBOUNCE_MS = 300;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        setRequestedOrientation(isTablet()
            ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        mainHandler = new Handler(Looper.getMainLooper());

        splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> splashReadyToHide);

        // Register screen state receiver to detect screen on/off
        setupScreenStateReceiver();

        createWebView(savedInstanceState);
        setupBackButton();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView(Bundle savedInstanceState) {
        if(appView != null) {
            return;
        }

        appView = new AppView(this);
        chromeClient = new ChromeClient(this);

        bridge = new Bridge(this, appView);

        bridge.getServices().forEach((key, service) -> {
            if (service == null) {
                Log.e(TAG, "Service not found: " + key);
                return;
            }
            service.onNewIntent(getIntent());
        });

        if (savedInstanceState != null) {
            appView.restoreState(savedInstanceState);
        } else {
            appView.clearHistory();
            appView.clearCache(true);
        }

        appView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        appView.getSettings().setJavaScriptEnabled(true);
        appView.setScrollBarStyle(WebView.SCROLLBARS_OUTSIDE_OVERLAY);
        appView.getSettings().setDomStorageEnabled(true);
        appView.setInputType(AppView.SUGGESTIONS_DEFAULT);

        // Critical settings to prevent blank screen issues
        appView.getSettings().setUseWideViewPort(true);
        appView.getSettings().setLoadWithOverviewMode(true);
        appView.setScrollbarFadingEnabled(false);

        // Ensure WebView is visible and properly rendered
        appView.setVisibility(View.VISIBLE);

        appView.addJavascriptInterface(bridge, "Android");
        appView.setWebViewClient(new WebViewClient(this));
        appView.setWebChromeClient(chromeClient);
        appView.setBackgroundColor(Color.BLACK);

        // Register main WebView for proxy handler (needed for shellular page loading)
        io.foxbiz.shellular.browser.HttpProxyHandler proxyHandler =
                io.foxbiz.shellular.browser.HttpProxyHandler.getInstance();
        proxyHandler.setMainWebView(appView);

        // Register shellular page bridge before first loadUrl so window.__shellularPageBridge
        // is available in JavaScript immediately (addJavascriptInterface only takes effect on
        // the next page load — registering before loadUrl ensures it's available from the start)
        appView.addJavascriptInterface(
                io.foxbiz.shellular.browser.BrowserPageBridge.getInstance(),
                "__shellularPageBridge");

        appView.loadUrl("shellular://localhost/");

        setupKeyboardInsetsListener(appView);

        setContentView(appView);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (bridge == null) {
            Log.e(TAG, "Bridge is not initialized.");
            return;
        }

        bridge.getServices().forEach((key, service) -> {
            if (service == null) {
                Log.e(TAG, "Service not found: " + key);
                return;
            }
            service.onRequestPermissionResult(requestCode, permissions, grantResults);
        });
    }

    @Override
    public void onNewIntent(@NonNull Intent intent) {
        super.onNewIntent(intent);

        if (bridge == null) {
            Log.e(TAG, "Bridge is not initialized.");
            return;
        }

        bridge.getServices().forEach((key, service) -> {
            if (service == null) {
                Log.e(TAG, "Service not found: " + key);
                return;
            }
            service.onNewIntent(intent);
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        ValueCallback<Uri[]> filePathCallback = chromeClient.filePathCallback;

        if (requestCode == ChromeClient.FILE_SELECT_CODE && filePathCallback != null) {
            filePathCallback.onReceiveValue(chromeClient.parseFileChooserResult(resultCode, data));
            chromeClient.filePathCallback = null;
        }

        if (bridge == null) {
            Log.e(TAG, "Bridge is not initialized.");
            return;
        }

        bridge.getServices().forEach((key, service) -> {
            if (service == null) {
                Log.e(TAG, "Service not found: " + key);
                return;
            }
            service.onActivityResult(requestCode, resultCode, data);
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        lastPausedTime = System.currentTimeMillis();

        if (BrowserDialog.isBrowserActive) {
            Log.d(TAG, "Browser is active, skipping WebView pause");
            return;
        }

        if (appView != null) {
            appView.onPause();
            appView.pauseTimers();
            appView.evaluateJavascript("document.dispatchEvent(new Event('pause'));", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        long now = System.currentTimeMillis();
        boolean wasLongPause = lastPausedTime > 0 && (now - lastPausedTime) > PAUSE_THRESHOLD_MS;

        if (wasLongPause && appView != null) {
            appView.reload();
            appView.invalidate();
        }

        if (appView != null) {
            appView.onResume();
            appView.resumeTimers();

            // If screen was off and now on, force complete redraw
            if (screenWasOff) {
                Log.d(TAG, "Screen turned on, forcing WebView redraw");
                screenWasOff = false;
                lastRefreshTime = now;

                // Use double-post to ensure smooth visibility toggle only for screen wake
                appView.post(() -> {
                    if (appView != null) {
                        appView.setVisibility(View.INVISIBLE);
                        appView.postDelayed(() -> {
                            if (appView != null) {
                                appView.setVisibility(View.VISIBLE);
                                appView.invalidate();
                                appView.requestLayout();
                            }
                        }, 16); // One frame delay to prevent flash
                    }
                });

                // Single delayed refresh after screen on
                mainHandler.postDelayed(() -> {
                    if (appView != null) {
                        appView.invalidate();
                        appView.requestLayout();
                        appView.evaluateJavascript("void(0);", null);
                    }
                }, 200);
            } else {
                // Normal resume handling - NO visibility toggle to prevent flash
                // Just invalidate to ensure rendering
                appView.invalidate();
            }

            appView.evaluateJavascript("document.dispatchEvent(new Event('resume'));", null);
        }

        if (bridge == null) {
            Log.e(TAG, "Bridge is not initialized.");
            return;
        }

        bridge.getServices().forEach((key, service) -> {
            if (service == null) {
                Log.e(TAG, "Service not found: " + key);
                return;
            }
            service.onResume();
        });
    }

    private void setupScreenStateReceiver() {
        screenStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getAction() != null) {
                    if (intent.getAction().equals(Intent.ACTION_SCREEN_OFF)) {
                        Log.d(TAG, "Screen turned OFF");
                        screenWasOff = true;
                    } else if (intent.getAction().equals(Intent.ACTION_SCREEN_ON)) {
                        Log.d(TAG, "Screen turned ON");
                        // Just set the flag, the actual refresh will happen in onResume/onWindowFocusChanged
                        // to avoid duplicate visibility toggles that cause flash
                    } else if (intent.getAction().equals(Intent.ACTION_USER_PRESENT)) {
                        Log.d(TAG, "User unlocked device");
                        // Subtle refresh when user unlocks
                        if (appView != null) {
                            mainHandler.postDelayed(() -> {
                                if (appView != null) {
                                    appView.invalidate();
                                }
                            }, 100);
                        }
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenStateReceiver, filter);
    }

    @Override
    protected void onStart() {
        super.onStart();
        // Subtle refresh without visibility toggle to prevent flash during normal navigation
        if (appView != null) {
            appView.post(() -> {
                if (appView != null) {
                    appView.invalidate();
                    appView.requestLayout();
                }
            });
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        // Unregister screen state receiver
        if (screenStateReceiver != null) {
            try {
                unregisterReceiver(screenStateReceiver);
            } catch (IllegalArgumentException e) {
                Log.e(TAG, "Screen state receiver already unregistered", e);
            }
            screenStateReceiver = null;
        }

        if (appView != null) {
            appView.clearCache(true);
            appView.clearHistory();
            appView.destroy();
            appView = null;
            System.gc();
        }

        if (bridge != null) {
            bridge.getServices().forEach((key, service) -> {
                if (service == null) {
                    Log.e(TAG, "Service not found: " + key);
                    return;
                }
                service.onDestroy();
            });
        }

        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (appView != null) {
            appView.saveState(outState);
        }
    }

    @Override
    protected void onRestoreInstanceState(@NonNull Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (appView != null) {
            appView.restoreState(savedInstanceState);
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (appView != null) {
            appView.invalidate();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus && appView != null) {
            long now = System.currentTimeMillis();

            // Debounce to prevent rapid triggers from navigation bar gestures
            if (now - lastWindowFocusTime < WINDOW_FOCUS_DEBOUNCE_MS) {
                Log.d(TAG, "Window focus changed too quickly, ignoring to prevent flash");
                return;
            }
            lastWindowFocusTime = now;

            // Only do visibility toggle if this is truly a screen wake event (screenWasOff flag)
            // For all other cases (navigation bar, notification panel), just invalidate
            if (screenWasOff) {
                Log.d(TAG, "Window gained focus after screen wake, refreshing WebView");
                lastRefreshTime = now;

                // Use double-post with frame delay for smooth transition
                appView.post(() -> {
                    if (appView != null) {
                        appView.setVisibility(View.INVISIBLE);
                        appView.postDelayed(() -> {
                            if (appView != null) {
                                appView.setVisibility(View.VISIBLE);
                                appView.invalidate();
                                appView.requestLayout();
                            }
                        }, 16); // One frame delay
                    }
                });

                mainHandler.postDelayed(() -> {
                    if (appView != null) {
                        appView.invalidate();
                        appView.evaluateJavascript("void(0);", null);
                    }
                }, 200);
            } else {
                // For normal navigation bar/notification panel interactions: NO visibility toggle
                // Just invalidate silently - no flash
                Log.d(TAG, "Window gained focus (normal interaction), no flash refresh");
                appView.invalidate();
            }
        }
    }

    private void setupKeyboardInsetsListener(WebView webview) {
        ViewCompat.setOnApplyWindowInsetsListener(webview, (v, insets) -> {
            Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
            float density = getResources().getDisplayMetrics().density;

            // In edge-to-edge mode the WebView extends to the screen bottom,
            // so use the full IME inset (distance from screen bottom to keyboard top).
            float keyboardHeightDp = Math.max(0, imeInsets.bottom) / density;

            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            if (imeVisible && keyboardHeightDp > 0) {
                webview.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('keyboardshow',{detail:{height:" + keyboardHeightDp + "}}));",
                    null
                );
            } else {
                webview.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('keyboardhide'));",
                    null
                );
            }

            return insets;
        });
    }

    private boolean isTablet() {
        int screenLayout = getResources().getConfiguration().screenLayout;
        return (screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK)
            >= Configuration.SCREENLAYOUT_SIZE_LARGE;
    }

    private void setupBackButton(){
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            OnBackInvokedDispatcher dispatcher = getOnBackInvokedDispatcher();
            dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> appView.evaluateJavascript("document.dispatchEvent(new Event('backbutton'));", null));
        }else {
            OnBackPressedDispatcher dispatcher = getOnBackPressedDispatcher();
            dispatcher.addCallback(this, new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    appView.evaluateJavascript("document.dispatchEvent(new Event('backbutton'));", null);
                }
            });
        }
    }
}
