package io.foxbiz.shellular.lib;

import static android.os.Build.VERSION.SDK_INT;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.provider.Settings;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import android.widget.Toast;
import android.window.SplashScreen;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;

import org.jetbrains.annotations.Contract;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.net.URLConnection;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Shellular;
import io.foxbiz.shellular.MainActivity;
import io.foxbiz.shellular.Payload;
import io.foxbiz.shellular.Service;
import io.foxbiz.shellular.webView.AppView;
import io.foxbiz.shellular.utils.Theme;

public class Native extends Service {
    private static final String TAG = "Native";
    private final Activity activity;
    private final int REQ_CAMERA = 3;
    private final int REQ_PERMISSION = 2;
    private final int REQ_PERMISSIONS = 1;
    private Theme theme;
    private Callback intentHandler;
    private Callback onRequestCameraResultCallback;
    private Callback onRequestPermissionResultCallback;

    public Native(Context context, WebView webview) {
        super(context, webview);
        this.activity = (Activity) context;
    }

    public boolean exec(String action, JSONArray args, Callback callback) {
        if (Objects.equals(action, "showToast")) {
            activity.runOnUiThread(() -> showToast(args, callback));
            return true;
        }

        if (Objects.equals(action, "setSystemBarColor")) {
            activity.runOnUiThread(() -> setSystemBarColor(args, callback));
            return true;
        }

        if (Objects.equals(action, "setTheme")) {
            activity.runOnUiThread(() -> setTheme(args, callback));
            return true;
        }

        if (Objects.equals(action, "setTerminalKeyboardMode")) {
            activity.runOnUiThread(() -> setTerminalKeyboardMode(args, callback));
            return true;
        }

        return super.exec(action, args, callback);
    }

    public void setTerminalKeyboardMode(@NonNull JSONArray args, @NonNull Callback callback) {
        String mode = args.optString(0, "terminal");
        if (webview instanceof AppView) {
            int inputType;
            switch (mode) {
                case "text":
                    inputType = AppView.SUGGESTIONS_DEFAULT;
                    break;
                case "numeric":
                    inputType = AppView.NO_SUGGESTIONS;
                    break;
                case "terminal":
                default:
                    inputType = AppView.NO_SUGGESTIONS_AGGRESSIVE;
                    break;
            }
            ((AppView) webview).setInputType(inputType);

            InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.restartInput(webview);
            }
        }
        callback.success();
    }

    public void requestPermissions(@NonNull JSONArray args, Callback callback) {
        JSONArray permissions = args.optJSONArray(0);
        Log.d(TAG, "requestPermissions: " + permissions);
        try {
            String[] granted = getGrantedPermissions(permissions);

            if (granted.length == permissions.length()) {
                callback.success(true);
                return;
            }

            String[] pending = new String[permissions.length() - granted.length];
            for (int i = 0, j = 0; i < permissions.length(); i++) {
                String permission = permissions.getString(i);
                if (!Arrays.asList(granted).contains(permission)) {
                    pending[j++] = permission;
                }
            }

            onRequestPermissionResultCallback = callback;
            ActivityCompat.requestPermissions((Activity) context, pending, REQ_PERMISSIONS);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void requestPermission(@NonNull JSONArray args, Callback callback) {
        String permission = args.optString(0);

        Log.d(TAG, "requestPermission: " + permission);
        if (!args.isNull(0) && !permission.isEmpty()) {
            if (ActivityCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
                callback.success(1);
                return;
            }

            onRequestPermissionResultCallback = callback;
            ActivityCompat.requestPermissions((Activity) context, new String[]{permission}, REQ_PERMISSION);
            return;
        }

        callback.error("No permission passed to request.");
    }

    public void hasPermission(@NonNull JSONArray args, Callback callback) {
        String permission = args.optString(0);
        if (!args.isNull(0) && !permission.isEmpty()) {
            int res = 0;
            if (ActivityCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
                res = 1;
            }
            callback.success(res);
            return;
        }

        callback.error("No permission passed to check.");
    }

    public void showToast(@NonNull JSONArray args, @NonNull Callback callback) {
        String message = args.optString(0);
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
        callback.success();
    }

    public void shareFile(JSONArray args, Callback callback) {
        Activity activity = this.activity;
        Context context = this.context;

        try {
            String fileURI = args.getString(0);
            String filename = args.optString(1, "");
            String packageId = args.optString(2, "");
            String contentType = args.optString(3, "");

            File file = new File(Objects.requireNonNull(Uri.parse(fileURI).getPath()));
            if (!file.exists()) {
                callback.success("File not found");
                return;
            }

            // If a filename is provided, copy file to cache directory.
            if (!filename.isEmpty()) {
                File cacheDir = context.getCacheDir();
                File newFile = new File(cacheDir, filename);
                try (FileInputStream in = new FileInputStream(file); FileOutputStream out = new FileOutputStream(newFile)) {
                    byte[] buffer = new byte[1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                    }
                }

                file = newFile;

                if (contentType.isEmpty()) {
                    contentType = URLConnection.guessContentTypeFromName(filename);
                }
            } else if (contentType.isEmpty()) {
                try (FileInputStream fis = new FileInputStream(file)) {
                    contentType = URLConnection.guessContentTypeFromStream(fis);
                }
            }

            Uri uri = getContentProviderUri(file);
            Intent intent = new Intent(Intent.ACTION_SEND);

            if (!packageId.isEmpty()) {
                intent.setPackage(packageId);
            }

            intent.putExtra(Intent.EXTRA_STREAM, uri);
            Log.d(TAG, "Filename: " + filename);
            Log.d(TAG, "ContentType: " + contentType);
            intent.setType(contentType);
            activity.startActivity(intent);

            callback.success(uri.toString());
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void shareText(@NonNull JSONArray args, Callback callback) {
        String text = args.optString(0);
        String address = args.optString(1, "");

        try {
            Intent intent = new Intent();
            intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.setType("text/plain");

            if (!args.isNull(1) && !address.isEmpty()) {
                intent.setAction(Intent.ACTION_SENDTO);
                intent.setData(Uri.parse(address));
                activity.startActivity(intent);
            } else {
                intent.setAction(Intent.ACTION_SEND);
                activity.startActivity(Intent.createChooser(intent, "Share via"));
            }

            callback.success(text);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void getAppInfo(JSONArray ignoredArgs, Callback callback) {
        JSONObject res = new JSONObject();
        try {
            PackageManager pm = activity.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);
            ApplicationInfo appInfo = context.getApplicationInfo();

            res.put("firstInstallTime", pInfo.firstInstallTime);
            res.put("lastUpdateTime", pInfo.lastUpdateTime);
            res.put("label", appInfo.loadLabel(pm).toString());
            res.put("packageName", pInfo.packageName);
            res.put("versionName", pInfo.versionName);

            if (SDK_INT <= 28) {
                res.put("versionCode", getDeprecatedVersionCode(pInfo));
            } else {
                res.put("versionCode", pInfo.getLongVersionCode());
            }

            callback.success(res);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void getDeviceInfo(JSONArray ignoredArgs, Callback callback) {
        JSONObject res = new JSONObject();
        try {
            res.put("manufacturer", Build.MANUFACTURER);
            res.put("model", Build.MODEL);
            res.put("product", Build.PRODUCT);
            res.put("isEmulator", isEmulator());
            callback.success(res);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void getVersionSdkInt(JSONArray ignoredArgs, @NonNull Callback callback) {
        callback.success(SDK_INT);
    }

    public void getNavigationMode(JSONArray ignoredArgs, @NonNull Callback callback) {
        try {
            Resources res = context.getResources();
            JSONObject result = new JSONObject();

            // Navigation mode: 0=3-button, 1=2-button, 2=gesture (API 29+)
            int mode = 0; // default to 3-button for API < 29
            if (SDK_INT >= 29) {
                int modeResId = res.getIdentifier(
                        "config_navBarInteractionMode", "integer", "android");
                if (modeResId > 0) {
                    mode = res.getInteger(modeResId);
                }
            }

            // Navigation bar height in density-independent pixels
            float navBarHeight = 0;
            int navBarResId = res.getIdentifier(
                    "navigation_bar_height", "dimen", "android");
            if (navBarResId > 0) {
                navBarHeight = res.getDimensionPixelSize(navBarResId)
                        / res.getDisplayMetrics().density;
            }

            // Status bar height in density-independent pixels
            float statusBarHeight = 0;
            int statusBarResId = res.getIdentifier(
                    "status_bar_height", "dimen", "android");
            if (statusBarResId > 0) {
                statusBarHeight = res.getDimensionPixelSize(statusBarResId)
                        / res.getDisplayMetrics().density;
            }

            boolean hasButtons = mode != 2;

            result.put("mode", mode);
            result.put("hasButtons", hasButtons);
            result.put("navigationBarHeight", navBarHeight);
            result.put("statusBarHeight", statusBarHeight);

            callback.success(result);
        } catch (JSONException e) {
            callback.error(e.toString());
        }
    }

    public void openInBrowser(@NonNull JSONArray args, @NonNull Callback callback) {
        CustomTabColorSchemeParams params = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(theme.get("primary"))
                .setNavigationBarColor(theme.get("primary"))
                .build();
        CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
        builder.setShowTitle(true);
        CustomTabsIntent customTabsIntent = builder.build();
        customTabsIntent.launchUrl(activity, Uri.parse(args.optString(0)));
    }

    public void setIntentHandler(JSONArray ignoredArgs, Callback callback) {
        intentHandler = callback;
    }

    public void setSystemBarColor(JSONArray args, Callback callback) {
        if (theme == null) {
            callback.error("Theme not set");
            return;
        }

        String hex = args.optString(0);
        int color = theme.get("primary");
        if (!args.isNull(0) && !hex.isEmpty()) {
            color = Color.parseColor(hex);
        }
        setSystemBarColor(color, callback);
        callback.success();
    }

    public void setTheme(@NonNull JSONArray args, Callback callback) {
        if (args.isNull(0)) return;
        JSONObject arg = args.optJSONObject(0);
        theme = new Theme(arg);

        int systemBarColor = theme.get("primary");
        setSystemBarColor(systemBarColor, callback);
        webview.setBackgroundColor(systemBarColor);
    }

    public void getConfiguration(JSONArray ignoredArgs, Callback callback) {
        try {
            JSONObject result = new JSONObject();
            Configuration config = context.getResources().getConfiguration();
            InputMethodManager imm = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
            //noinspection JavaReflectionMemberAccess
            Method method = InputMethodManager.class.getMethod("getInputMethodWindowVisibleHeight");

            result.put("isAcceptingText", imm.isAcceptingText());
            result.put("keyboardHeight", method.invoke(imm));
            result.put("fontScale", config.fontScale);
            result.put("keyboard", config.keyboard);
            result.put("keyboardHidden", config.keyboardHidden);
            result.put("hardKeyboardHidden", config.hardKeyboardHidden);
            result.put("navigationHidden", config.navigationHidden);
            result.put("navigation", config.navigation);
            result.put("orientation", config.orientation);

            if (SDK_INT <= 24) {
                result.put("locale", getDeprecatedLocale(config));
            } else {
                result.put("locale", config.getLocales().get(0).toString());
            }

            callback.success(result);
        } catch (JSONException | NoSuchMethodException | IllegalAccessException |
                 InvocationTargetException e) {
            callback.error(e.toString());
        }
    }

    public void captureFromCamera(JSONArray ignoredArgs, Callback callback) {
        Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
        activity.startActivityForResult(intent, REQ_CAMERA);
        onRequestCameraResultCallback = callback;
    }

    public void getIpAddresses(JSONArray ignoredArgs, Callback callback) {
        try {
            JSONArray addresses = new JSONArray();

            if (SDK_INT >= 31) {
                ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
                LinkProperties linkProperties = cm.getLinkProperties(cm.getActiveNetwork());
                assert linkProperties != null;
                List<LinkAddress> linkAddresses = linkProperties.getLinkAddresses();
                for (LinkAddress linkAddress : linkAddresses) {
                    addresses.put(linkAddress.getAddress().getHostAddress());
                }
            } else {
                for (Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces(); en.hasMoreElements(); ) {
                    NetworkInterface i = en.nextElement();
                    for (Enumeration<InetAddress> inetAddresses = i.getInetAddresses(); inetAddresses.hasMoreElements(); ) {
                        InetAddress inetAddress = inetAddresses.nextElement();
                        if (!inetAddress.isLoopbackAddress()) {
                            addresses.put(inetAddress.getHostAddress());
                        }
                    }
                }
            }

            callback.success(addresses);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void restartApp(JSONArray ignoredArgs, Callback callback) {
        try {
            PackageManager pm = context.getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(context.getPackageName());
            assert intent != null;
            Intent mainIntent = Intent.makeRestartActivityTask(intent.getComponent());
            context.startActivity(mainIntent);
            Runtime.getRuntime().exit(0);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    @SuppressLint("BatteryLife")
    public void requestIgnoreBatteryOptimization(JSONArray ignoredArgs, Callback callback) {
        try {
            Intent intent = new Intent();
            String packageName = context.getPackageName();
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (powerManager.isIgnoringBatteryOptimizations(packageName)) {
                callback.success(1);
                return;
            }

            intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + packageName));
            activity.startActivity(intent);
            callback.success(0);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void hideSplashScreen(JSONArray ignoredArgs, Callback callback) {
        MainActivity mainActivity = (MainActivity) context;
        mainActivity.splashReadyToHide = true;
        callback.success();
    }

    public void haptic(JSONArray ignoredArgs, Callback callback) {
        if (SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            Vibrator vibrator = vm.getDefaultVibrator();
            vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE));
        } else if (SDK_INT >= Build.VERSION_CODES.O) {
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            vibrator.vibrate(50);
        }
        callback.success();
    }

    public void onNewIntent(Intent intent) {
        Log.d(TAG, "onNewIntent: " + intent);
        if (intentHandler != null) {
            intentHandler.sendPayload(new Payload(
                    getIntentJson(intent),
                    true
            ));
        }
    }

    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_CAMERA) {
            if (onRequestCameraResultCallback != null) {
                if (resultCode == Activity.RESULT_OK) {
                    Uri uri = data.getData();
                    assert uri != null;
                    onRequestCameraResultCallback.success(uri.toString());
                } else {
                    onRequestCameraResultCallback.error("Camera capture failed");
                }
            }
        }
    }

    private void setSystemBarColor(int color, Callback callback) {
        final Window window = activity.getWindow();
        window.clearFlags(0x04000000); // SDK 19: WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(0x80000000); // SDK 21: WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        try {
            // Keep bars transparent — safe area insets are handled in CSS.
            // Only set the icon appearance (light/dark) so icons are readable.

            if (SDK_INT < 30) {
                setStatusBarStyle(window);
                setNavigationBarStyle(window);
            } else {
                String themeType = theme.getType();
                WindowInsetsController controller = window.getInsetsController();
                int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;

                assert controller != null;
                if (themeType.equals("light")) {
                    controller.setSystemBarsAppearance(appearance, appearance);
                } else {
                    controller.setSystemBarsAppearance(0, appearance);
                }
            }

            callback.success();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void exitApp(JSONArray ignoredArgs, Callback ignoredCallback) {
        Shellular app = (Shellular) activity.getApplication();
        app.shutdown();
        System.exit(0);
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86");
    }

    private void setStatusBarStyle(@NonNull final Window window) {
        String themeType = theme.getType();
        View decorView = window.getDecorView();
        int uiOptions;
        int lightStatusBar;

        if (SDK_INT <= 30) {
            uiOptions = getDeprecatedSystemUiVisibility(decorView);
            lightStatusBar = deprecatedFlagUiLightStatusBar();

            if (themeType.equals("light")) {
                setDeprecatedSystemUiVisibility(decorView, uiOptions | lightStatusBar);
                return;
            }
            setDeprecatedSystemUiVisibility(decorView, uiOptions & ~lightStatusBar);
            return;
        }

        uiOptions = Objects.requireNonNull(decorView.getWindowInsetsController()).getSystemBarsAppearance();
        lightStatusBar = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS;

        if (themeType.equals("light")) {
            decorView.getWindowInsetsController().setSystemBarsAppearance(uiOptions | lightStatusBar, lightStatusBar);
            return;
        }

        decorView.getWindowInsetsController().setSystemBarsAppearance(uiOptions & ~lightStatusBar, lightStatusBar);
    }

    private void setNavigationBarStyle(@NonNull final Window window) {
        String themeType = theme.getType();
        View decorView = window.getDecorView();
        int uiOptions;

        if (SDK_INT <= 30) {
            uiOptions = getDeprecatedSystemUiVisibility(decorView);
            // 0x80000000 FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS
            // 0x00000010 SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

            if (themeType.equals("light")) {
                setDeprecatedSystemUiVisibility(decorView, uiOptions | 0x80000000 | 0x00000010);
                return;
            }
            setDeprecatedSystemUiVisibility(decorView, (uiOptions & ~0x00000010) | 0x80000000);
            return;
        }

        uiOptions = Objects.requireNonNull(decorView.getWindowInsetsController()).getSystemBarsAppearance();
        int lightNavigationBar = WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;

        if (themeType.equals("light")) {
            decorView.getWindowInsetsController().setSystemBarsAppearance(uiOptions | lightNavigationBar, lightNavigationBar);
            return;
        }

        decorView.getWindowInsetsController().setSystemBarsAppearance(uiOptions & ~lightNavigationBar, lightNavigationBar);
    }

    @NonNull
    private JSONObject getIntentJson(@NonNull Intent intent) {
        JSONObject json = new JSONObject();
        try {
            json.put("action", intent.getAction());
            json.put("uri", intent.getDataString());
            json.put("type", intent.getType());
            json.put("package", intent.getPackage());
            json.put("extras", getExtrasJson(intent.getExtras()));
        } catch (JSONException e) {
            Log.e(TAG, "Error creating intent JSON", e);
        }
        return json;
    }

    @Contract(pure = true)
    private int getDeprecatedVersionCode(@NonNull PackageInfo packageInfo) {
        return packageInfo.versionCode;
    }

    @NonNull
    @SuppressWarnings("deprecation")
    private String getDeprecatedLocale(@NonNull Configuration configuration) {
        return configuration.locale.toString();
    }

    @Nullable
    @RequiresApi(api = Build.VERSION_CODES.O)
    @SuppressLint("HardwareIds")
    private String getDeprecatedPhoneNumber(TelephonyManager telephonyManager) {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED && ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_NUMBERS) != PackageManager.PERMISSION_GRANTED && ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    activity,
                    new String[]{Manifest.permission.READ_SMS, Manifest.permission.READ_PHONE_NUMBERS, Manifest.permission.READ_PHONE_STATE},
                    REQ_PERMISSION
            );
            return null;
        }
        return telephonyManager.getLine1Number();
    }

    private int deprecatedFlagUiLightStatusBar() {
        return View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    }

    private int getDeprecatedSystemUiVisibility(@NonNull View decorView) {
        return decorView.getSystemUiVisibility();
    }

    private void setDeprecatedSystemUiVisibility(@NonNull View decorView, int visibility) {
        decorView.setSystemUiVisibility(visibility);
    }

    @NonNull
    private JSONObject getExtrasJson(Bundle extras) {
        JSONObject json = new JSONObject();
        if (extras != null) {
            for (String key : extras.keySet()) {
                try {
                    Object value = getValueForKey(extras, key);
                    if (value != null) {
                        if (value instanceof Bundle) {
                            json.put(key, getExtrasJson((Bundle) value));
                        } else {
                            json.put(key, value);
                        }
                    }
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating extras JSON", e);
                }
            }
        }
        return json;
    }

    private Object getValueForKey(@NonNull Bundle extras, String key) {
        Object value = null;
        if (extras.containsKey(key)) {
            value = extras.get(key); // Retrieve the raw value

            if (value instanceof String) {
                return value;
            } else if (value instanceof Integer) {
                return extras.getInt(key);
            } else if (value instanceof Long) {
                return extras.getLong(key);
            } else if (value instanceof Double) {
                return extras.getDouble(key);
            } else if (value instanceof Float) {
                return extras.getFloat(key);
            } else if (value instanceof Boolean) {
                return extras.getBoolean(key);
            } else if (value instanceof Bundle) {
                return getExtrasJson((Bundle) value);
            } else if (value instanceof ArrayList) {
                return extras.getStringArrayList(key);
            } else {
                Log.w(TAG, "Unhandled type for key: " + key + ", value: " + value);
            }
        }
        return value;
    }

    private Uri getContentProviderUri(File file) {
        String Id = context.getPackageName();
        return FileProvider.getUriForFile(context, Id + ".provider", file);
    }

    public void onRequestPermissionResult(int code, String[] permissions, int[] resCodes) {
        Log.d(TAG, "onRequestPermissionsResult: " + code + ": " + Arrays.toString(permissions));
        if (code == REQ_PERMISSIONS) {
            boolean allGranted = true;
            for (int res : resCodes) {
                if (res == PackageManager.PERMISSION_DENIED) {
                    allGranted = false;
                    break;
                }
            }

            onRequestPermissionResultCallback.success(allGranted);
            return;
        }

        if (resCodes.length >= 1 && resCodes[0] == PackageManager.PERMISSION_DENIED) {
            onRequestPermissionResultCallback.success(false);
            return;
        }

        onRequestPermissionResultCallback.success(true);
    }

    @NonNull
    private String[] getGrantedPermissions(@NonNull JSONArray arr) throws Exception {
        List<String> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            try {
                String permission = arr.getString(i);
                if (permission.isEmpty()) {
                    throw new Exception("Permission cannot be null or empty");
                }
                if (ActivityCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
                    list.add(permission);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking permissions", e);
                throw new Exception("Error checking permissions: " + e.getMessage());
            }
        }

        String[] res = new String[list.size()];
        return list.toArray(res);
    }
}
